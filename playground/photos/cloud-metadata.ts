// Wire format observed in pinned icloudpd xmp_sidecar.py; see README.
import { decodePlist } from "./cloud-plist";
import type { Field } from "./metadata";
import type { Library } from "./photos";
export const CLOUD_LIMITS = { decodedBytes: 65536, text: 512 } as const;
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= CLOUD_LIMITS.text;
function bytes(field: unknown): Uint8Array {
  if (!object(field) || field.type !== "ENCRYPTED_BYTES" || typeof field.value !== "string") throw new Error();
  const s = field.value;
  if (s.length > 4 * Math.ceil(CLOUD_LIMITS.decodedBytes / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) throw new Error();
  const b = Buffer.from(s, "base64");
  if (b.length > CLOUD_LIMITS.decodedBytes || b.toString("base64") !== s) throw new Error();
  return b;
}
function decode<T>(fields: Obj, key: string, kind: "caption" | "keywords" | "gps"): Field<T> {
  const source = `CPLAsset.fields.${key}.value`;
  if (!(key in fields)) return { state: "absent", source };
  let data: Uint8Array;
  try { data = bytes(fields[key]); } catch { return { state: "invalid", source, reason: "invalid bounded ENCRYPTED_BYTES field" }; }
  if (kind === "caption") {
    try {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (value.length > CLOUD_LIMITS.text) throw new Error();
      return value.length ? { state: "present", source, value: value as T } : { state: "empty", source };
    } catch { return { state: "invalid", source, reason: "invalid bounded UTF-8 caption" }; }
  }
  try {
    const value = decodePlist(data);
    if (kind === "keywords") {
      if (!Array.isArray(value) || value.length > 100 || !value.every(text)) throw new Error();
      return value.length ? { state: "present", source, value: value as T } : { state: "empty", source };
    }
    if (!object(value) || value instanceof Date || value instanceof Uint8Array) throw new Error();
    if (!Object.keys(value).length) return { state: "empty", source };
    if (!("lat" in value) && !("lon" in value)) return { state: "absent", source };
    const { lat, lon } = value;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error();
    return { state: "present", source, value: { latitude: lat, longitude: lon } as T };
  } catch {
    return { state: "invalid", source, reason: "unsupported or malformed plist metadata" };
  }
}
export function decodeCloudMetadata(record: unknown, library: Library) {
  if (!object(record) || record.recordType !== "CPLAsset" || !text(record.recordName) || !object(record.fields)) throw new Error("invalid cloud asset");
  if (!object(library) || !["private", "shared"].includes(library.database) || !object(library.zoneID) || !text(library.zoneID.zoneName) || Object.keys(library.zoneID).length > 16 || !Object.entries(library.zoneID).every(([k, v]) => text(k) && text(v))) throw new Error("invalid cloud library");
  const scope = { database: library.database, zoneID: Object.fromEntries(Object.keys(library.zoneID).sort().map(k => [k, library.zoneID[k]])) };
  if (record.zoneID !== undefined && (!object(record.zoneID) || JSON.stringify(Object.fromEntries(Object.keys(record.zoneID).sort().map(k => [k, (record.zoneID as Obj)[k]]))) !== JSON.stringify(scope.zoneID))) throw new Error("cloud record zone mismatch");
  return {
    id: JSON.stringify([scope.database, scope.zoneID, record.recordName]), library: scope, assetRecordName: record.recordName,
    provenance: "icloudpd 879c561 xmp_sidecar wire-format subset; input is caller-supplied, not authenticated",
    userKeywords: decode<string[]>(record.fields, "keywordsEnc", "keywords"),
    caption: decode<string>(record.fields, "captionEnc", "caption"),
    gps: decode<{ latitude: number; longitude: number }>(record.fields, "locationEnc", "gps"),
    people: { state: "unsupported", reason: "no source-backed cloud person decoder implemented" },
    generatedLabels: { state: "unsupported", reason: "not user keywords; no decoder implemented" },
    placeNames: { state: "unsupported", reason: "locationV2Enc and human-readable places unverified" },
  };
}
