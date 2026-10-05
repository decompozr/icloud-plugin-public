// Source contract and limitations: ../../docs/photos-feasibility.md.
export const LIMITS = { bytes: 1024 * 1024, items: 1000, list: 100, text: 512 } as const;
export type Field<T> = { source: string } & (
  { state: "absent" | "empty" } | { state: "invalid"; reason: string } | { state: "present"; value: T }
);
type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const validText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= LIMITS.text;
function texts(obj: Obj, key: string, source = key): Field<string[]> {
  if (!(key in obj)) return { state: "absent", source };
  const v = obj[key];
  if (!Array.isArray(v) || v.length > LIMITS.list || !v.every(validText)) return { state: "invalid", source, reason: "expected bounded nonblank string list" };
  return v.length ? { state: "present", source, value: [...v] } : { state: "empty", source };
}
function people(obj: Obj): Field<(string | null)[]> {
  const source = "persons";
  if (!(source in obj)) return { state: "absent", source };
  const v = obj[source];
  if (!Array.isArray(v) || v.length > LIMITS.list || !v.every(x => x === null || validText(x))) return { state: "invalid", source, reason: "expected bounded person-label list" };
  return v.length ? { state: "present", source, value: [...v] } : { state: "empty", source };
}
function placeNames(obj: Obj): Field<Record<string, string[]>> {
  const source = "place.names";
  if (!("names" in obj)) return { state: "absent", source };
  if (!isObject(obj.names) || Object.keys(obj.names).length > LIMITS.list) return { state: "invalid", source, reason: "expected bounded place-name map" };
  const entries = Object.entries(obj.names);
  if (!entries.every(([k, v]) => validText(k) && Array.isArray(v) && v.length <= LIMITS.list && v.every(validText))) return { state: "invalid", source, reason: "expected bounded place-name lists" };
  return entries.length ? { state: "present", source, value: Object.fromEntries(entries) as Record<string, string[]> } : { state: "empty", source };
}
function text(obj: Obj, key: string, source: string): Field<string> {
  if (!(key in obj)) return { state: "absent", source };
  if (obj[key] === null || obj[key] === "") return { state: "empty", source };
  return validText(obj[key]) ? { state: "present", source, value: obj[key] } : { state: "invalid", source, reason: "expected bounded nonblank string" };
}
function gps(obj: Obj): Field<{ latitude: number; longitude: number }> {
  const source = "latitude,longitude";
  if (!("latitude" in obj) && !("longitude" in obj)) return { state: "absent", source };
  const { latitude, longitude } = obj;
  if (latitude === null && longitude === null) return { state: "empty", source };
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return { state: "invalid", source, reason: "expected a complete finite GPS pair in range" };
  return { state: "present", source, value: { latitude, longitude } };
}
function place(obj: Obj) {
  const source = "place";
  if (!("place" in obj)) return { state: "absent", source } as const;
  if (obj.place === null) return { state: "empty", source } as const;
  if (!isObject(obj.place)) return { state: "invalid", source, reason: "expected place object" } as const;
  if (Object.keys(obj.place).length === 0) return { state: "empty", source } as const;
  return { state: "present", source, value: {
    name: text(obj.place, "name", "place.name"),
    names: placeNames(obj.place),
    countryCode: text(obj.place, "country_code", "place.country_code"),
  } } as const;
}
export function parseMetadata(input: string, libraryNamespace: string) {
  if (!validText(libraryNamespace)) throw new Error("invalid explicit library namespace");
  if (Buffer.byteLength(input, "utf8") > LIMITS.bytes) throw new Error("metadata byte limit");
  let raw: unknown;
  try { raw = JSON.parse(input); } catch { throw new Error("invalid metadata JSON"); }
  if (!Array.isArray(raw) || raw.length > LIMITS.items) throw new Error("expected bounded photo array");
  const ids = new Set<string>();
  const photos = raw.map((row, index) => {
    if (!isObject(row) || !validText(row.uuid)) throw new Error(`invalid photo identity at index ${index}`);
    const id = JSON.stringify(["local-photos", libraryNamespace, row.uuid]);
    if (ids.has(id)) throw new Error(`duplicate photo identity at index ${index}`);
    ids.add(id);
    return { id, libraryNamespace, uuid: row.uuid,
      provenance: { provider: "osxphotos-asdict-subset", identityField: "uuid", scope: "caller-supplied local library namespace" },
      peopleLabels: people(row), userKeywords: texts(row, "keywords"),
      photosGeneratedLabels: texts(row, "labels"), gps: gps(row), storedPlace: place(row) };
  });
  return { source: "caller-supplied local metadata JSON; not live iCloud", photos };
}
// Stream cap avoids loading an arbitrarily large input file before validation.
export async function importMetadata(path: string, libraryNamespace: string) {
  const reader = Bun.file(path).stream().getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > LIMITS.bytes) throw new Error("metadata byte limit");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseMetadata(new TextDecoder("utf-8", { fatal: true }).decode(bytes), libraryNamespace);
}
