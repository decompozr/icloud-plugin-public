// Source-informed, handwritten subset; see ../../docs/photos-feasibility.md.
export type Library = { database: "private" | "shared"; zoneID: Record<string, string> };
export type Role = "thumbnail" | "original" | "livePhotoMotion";
export type Resource = { size: number; downloadURL: string; fileChecksum: string; fileType: string };
export type Photo = {
  id: string;
  library: Library;
  assetRecordName: string;
  masterRecordName: string;
  filename: string | null;
  assetDate: number | null;
  resources: Partial<Record<Role, Resource>>;
};
type Obj = Record<string, unknown>;
const roles = { thumbnail: "resJPEGThumb", original: "resOriginal", livePhotoMotion: "resOriginalVidCompl" } as const;

function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid ${label}`);
  return value as Obj;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.length) throw new Error(`invalid ${label}`);
  return value;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`invalid ${label}`);
  return value as number;
}
function field(fields: Obj, key: string): unknown {
  return object(fields[key], key).value;
}
function libraryScope(library: Library): Library {
  if (library.database !== "private" && library.database !== "shared") throw new Error("invalid database");
  const zone = object(library.zoneID, "zoneID");
  string(zone.zoneName, "zoneName");
  return { database: library.database, zoneID: Object.fromEntries(Object.keys(zone).sort().map(key => [key, string(zone[key], "zoneID field")])) };
}
function filename(fields: Obj): string | null {
  if (!("filenameEnc" in fields)) return null;
  const entry = object(fields.filenameEnc, "filenameEnc");
  const value = string(entry.value, "filenameEnc value");
  if (entry.type === "STRING") return value;
  if (entry.type !== "ENCRYPTED_BYTES" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("invalid filename encoding");
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value, "base64"));
}
function resource(asset: Obj, master: Obj, prefix: string): Resource | undefined {
  const key = `${prefix}Res`;
  const fields = key in asset ? asset : key in master ? master : null;
  if (!fields) return undefined;
  const raw = object(field(fields, key), key);
  const downloadURL = string(raw.downloadURL, "resource URL");
  const url = new URL(downloadURL);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid resource URL");
  return {
    size: integer(raw.size, "resource size", 0, Number.MAX_SAFE_INTEGER),
    downloadURL,
    fileChecksum: string(raw.fileChecksum, "resource checksum"),
    fileType: string(field(fields, `${prefix}FileType`), "resource type"),
  };
}

export function parsePage(payload: unknown, library: Library): Photo[] {
  const scope = libraryScope(library);
  const records = object(payload, "response").records;
  if (!Array.isArray(records)) throw new Error("invalid records");
  const masters = new Map<string, Obj>();
  const assets = new Map<string, Obj>();
  for (const value of records) {
    const record = object(value, "record");
    const name = string(record.recordName, "recordName");
    if (record.zoneID !== undefined && JSON.stringify(libraryScope({ ...scope, zoneID: record.zoneID as Library["zoneID"] }).zoneID) !== JSON.stringify(scope.zoneID)) throw new Error("record zone mismatch");
    const map = record.recordType === "CPLMaster" ? masters : record.recordType === "CPLAsset" ? assets : null;
    if (!map) throw new Error("unsupported record type");
    if (map.has(name)) throw new Error("duplicate record");
    map.set(name, object(record.fields, "fields"));
  }
  const usedMasters = new Set<string>();
  const photos: Photo[] = [];
  for (const [name, asset] of assets) {
    const reference = object(field(asset, "masterRef"), "masterRef");
    if (reference.zoneID !== undefined && JSON.stringify(libraryScope({ ...scope, zoneID: reference.zoneID as Library["zoneID"] }).zoneID) !== JSON.stringify(scope.zoneID)) throw new Error("master reference zone mismatch");
    const masterName = string(reference.recordName, "master recordName");
    const master = masters.get(masterName);
    if (!master) throw new Error("missing master");
    if (usedMasters.has(masterName)) throw new Error("shared master unsupported");
    usedMasters.add(masterName);
    const resources: Photo["resources"] = {};
    for (const [role, prefix] of Object.entries(roles)) {
      const found = resource(asset, master, prefix);
      if (found) resources[role as Role] = found;
    }
    const rawDate = (asset.assetDate as Obj | undefined)?.value;
    const assetDate = typeof rawDate === 'number' && Number.isSafeInteger(rawDate) && Math.abs(rawDate) <= 8640000000000000 ? rawDate : null;
    photos.push({ id: JSON.stringify([scope.database, scope.zoneID, name]), library: scope, assetRecordName: name, masterRecordName: masterName, filename: filename(master), assetDate, resources });
  }
  if (usedMasters.size !== masters.size) throw new Error("orphan master unsupported");
  return photos;
}

export function selectResource(photo: Photo, role: Role): Resource {
  const result = photo.resources[role];
  if (!result) throw new Error(`unavailable rendition: ${role}`);
  return result;
}

export function query(library: Library, startRank: number, pageSize: number) {
  const scope = libraryScope(library);
  integer(startRank, "startRank", 0, Number.MAX_SAFE_INTEGER);
  integer(pageSize, "pageSize", 1, 100);
  return {
    query: {
      recordType: "CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted",
      filterBy: [
        { fieldName: "startRank", fieldValue: { type: "INT64", value: startRank }, comparator: "EQUALS" },
        { fieldName: "direction", fieldValue: { type: "STRING", value: "ASCENDING" }, comparator: "EQUALS" },
      ],
    },
    resultsLimit: pageSize * 2,
    desiredKeys: ["recordName", "recordType", "masterRef", "filenameEnc", "assetDate", ...Object.values(roles).flatMap(prefix => [`${prefix}Res`, `${prefix}FileType`])],
    zoneID: scope.zoneID,
  };
}

type Bounds = { pageSize: number; maxPages: number; maxItems: number; maxBytes: number; timeoutMs: number };
export async function readLoopback(port: number, library: Library, options: Partial<Bounds> = {}) {
  integer(port, "port", 1, 65535);
  const scope = libraryScope(library);
  const bounds = { pageSize: 2, maxPages: 4, maxItems: 6, maxBytes: 64 * 1024, timeoutMs: 2000, ...options };
  for (const [key, ceiling] of Object.entries({ pageSize: 100, maxPages: 20, maxItems: 1000, maxBytes: 1024 * 1024, timeoutMs: 10000 })) integer(bounds[key as keyof Bounds], key, 1, ceiling);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), bounds.timeoutMs);
  const photos: Photo[] = [];
  const ids = new Set<string>();
  let pages = 0;
  let responseBytes = 0;
  try {
    while (pages < bounds.maxPages && photos.length < bounds.maxItems) {
      const pageSize = Math.min(bounds.pageSize, bounds.maxItems - photos.length);
      const response = await fetch(`http://127.0.0.1:${port}/database/1/com.apple.photos.cloud/production/${scope.database}/records/query`, {
        method: "POST", redirect: "manual", credentials: "omit", signal: controller.signal,
        headers: { "Content-Type": "text/plain" }, body: JSON.stringify(query(scope, photos.length, pageSize)),
      });
      pages++;
      if (!response.ok) { await response.body?.cancel(); throw new Error(`query HTTP ${response.status}`); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("missing response body");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          responseBytes += next.value.byteLength;
          if (responseBytes > bounds.maxBytes) throw new Error("response byte limit");
          chunks.push(next.value);
          length += next.value.byteLength;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      const data = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      const page = parsePage(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)), scope);
      if (page.length > pageSize) throw new Error("page item limit");
      if (!page.length) return { photos, pages, responseBytes, complete: true, truncated: false, stoppedBy: "empty-page" as const };
      for (const photo of page) {
        if (ids.has(photo.id)) throw new Error("repeated asset across pages");
        ids.add(photo.id);
        photos.push(photo);
      }
    }
    return { photos, pages, responseBytes, complete: false, truncated: true, stoppedBy: photos.length >= bounds.maxItems ? "item-cap" as const : "page-cap" as const };
  } finally { clearTimeout(timeout); controller.abort(); }
}
