import { expect, test, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import fixtures from "./cloud-fixtures.json";
import { CLOUD_LIMITS, decodeCloudMetadata } from "./cloud-metadata";
const library = { database: "private" as const, zoneID: { zoneName: "fixture" } };
const record = (fields: object) => ({ recordType: "CPLAsset", recordName: "asset", fields });
const enc = (value: string) => ({ type: "ENCRYPTED_BYTES", value });
test("binary and XML plist wire fixtures decode identically, with valid zero GPS", () => {
  for (const fixture of [fixtures.binary, fixtures.xml]) {
    const p = decodeCloudMetadata(fixture, library);
    expect(p.userKeywords).toEqual({ state: "present", value: ["holiday", "海邊"], source: "CPLAsset.fields.keywordsEnc.value" });
    expect(p.caption.state === "present" && p.caption.value).toBe("Invented cloud caption");
    expect(p.gps).toEqual({ state: "present", value: { latitude: 0, longitude: 0 }, source: "CPLAsset.fields.locationEnc.value" });
    expect(p.people.state).toBe("unsupported");
    expect(p.generatedLabels.state).toBe("unsupported");
    expect(p.placeNames.state).toBe("unsupported");
  }
});
test("cloud identity retains zone and database and rejects local/master records", () => {
  const a = decodeCloudMetadata(record({}), library);
  expect(a.id).not.toBe(decodeCloudMetadata(record({}), { ...library, database: "shared" }).id);
  expect(a.id).not.toBe(decodeCloudMetadata(record({}), { ...library, zoneID: { zoneName: "other" } }).id);
  expect(() => decodeCloudMetadata({ uuid: "local" }, library)).toThrow("cloud asset");
  expect(() => decodeCloudMetadata({ ...record({}), recordType: "CPLMaster" }, library)).toThrow();
  expect(() => decodeCloudMetadata({ ...record({}), zoneID: { zoneName: "other" } }, library)).toThrow("zone mismatch");
});
test("absent, plist empty and malformed cloud fields stay distinct", () => {
  const missing = decodeCloudMetadata(record({}), library);
  expect(missing.userKeywords.state).toBe("absent");
  expect(missing.gps.state).toBe("absent");
  const empty = decodeCloudMetadata(record({ keywordsEnc: enc(fixtures.cases.emptyKeywords), locationEnc: enc(fixtures.cases.emptyLocation), captionEnc: enc("") }), library);
  expect(empty.userKeywords.state).toBe("empty");
  expect(empty.gps.state).toBe("empty");
  expect(empty.caption.state).toBe("empty");
  for (const value of ["%%%%", "YQ", "YR==", Buffer.from("not a plist").toString("base64")]) expect(decodeCloudMetadata(record({ keywordsEnc: enc(value) }), library).userKeywords.state).toBe("invalid");
  expect(decodeCloudMetadata(record({ keywordsEnc: { type: "STRING", value: fixtures.cases.emptyKeywords } }), library).userKeywords.state).toBe("invalid");
});
test("schema validates keywords and complete numeric GPS rather than guessing", () => {
  for (const key of ["partialGPS", "invalidGPS", "nonfiniteGPS", "boolGPS"] as const) expect(decodeCloudMetadata(record({ locationEnc: enc(fixtures.cases[key]) }), library).gps.state).toBe("invalid");
  for (const key of ["wrongKeywords", "tooManyKeywords"] as const) expect(decodeCloudMetadata(record({ keywordsEnc: enc(fixtures.cases[key]) }), library).userKeywords.state).toBe("invalid");
  expect(decodeCloudMetadata(record({ locationEnc: enc(fixtures.cases.locationWithoutGPS) }), library).gps.state).toBe("absent");
});
test("caption UTF8 and byte/text limits are enforced", () => {
  expect(decodeCloudMetadata(record({ captionEnc: enc(Buffer.from([0xff]).toString("base64")) }), library).caption.state).toBe("invalid");
  expect(decodeCloudMetadata(record({ captionEnc: enc(Buffer.from("x".repeat(513)).toString("base64")) }), library).caption.state).toBe("invalid");
  expect(decodeCloudMetadata(record({ keywordsEnc: enc(Buffer.alloc(CLOUD_LIMITS.decodedBytes + 1).toString("base64")) }), library).userKeywords.state).toBe("invalid");
});
test("XML entity declarations are rejected before parsing", () => {
  const xml = '<?xml version="1.0"?><!DOCTYPE plist [<!ENTITY a "secret">]><plist version="1.0"><array><string>&a;</string></array></plist>';
  expect(decodeCloudMetadata(record({ keywordsEnc: enc(Buffer.from(xml).toString("base64")) }), library).userKeywords.state).toBe("invalid");
});

test("cloud metadata decoding uses no subprocess or Python runtime", () => {
  const spies = ["execFileSync", "execSync", "spawnSync", "execFile", "exec", "spawn", "fork"].map(name => spyOn(childProcess, name as keyof typeof childProcess).mockImplementation(() => { throw new Error("subprocess forbidden"); }));
  try {
    for (const fixture of [fixtures.binary, fixtures.xml]) {
      const result = decodeCloudMetadata(fixture, library);
      expect(result.userKeywords.state).toBe("present");
      expect(result.gps.state).toBe("present");
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { for (const spy of spies) spy.mockRestore(); }
});
