import { describe, expect, test } from "bun:test";
import { LIMITS, parseMetadata, importMetadata } from "./metadata";
const parse = (row: object) => parseMetadata(JSON.stringify([{ uuid: "asset", ...row }]), "library").photos[0]!;
describe("stored semantic metadata", () => {
  test("keeps people, user keywords and generated labels separate with provenance", () => {
    const p = parse({ persons: ["Alex"], keywords: ["Trip"], labels: ["Beach"] });
    expect(p.peopleLabels).toEqual({ state: "present", source: "persons", value: ["Alex"] });
    expect(p.userKeywords).toEqual({ state: "present", source: "keywords", value: ["Trip"] });
    expect(p.photosGeneratedLabels).toEqual({ state: "present", source: "labels", value: ["Beach"] });
    expect(p.provenance.identityField).toBe("uuid");
  });
  test("missing, exported empty and invalid differ", () => {
    expect(parse({}).peopleLabels.state).toBe("absent");
    expect(parse({ persons: [] }).peopleLabels.state).toBe("empty");
    for (const persons of [null, "Alex", [42], [" "], ["x".repeat(513)]]) expect(parse({ persons }).peopleLabels.state).toBe("invalid");
  });
  test("source namespace and uuid identify assets, never filename", () => {
    const rows = JSON.stringify([{ uuid: "a", filename: "same.jpg" }, { uuid: "b", filename: "same.jpg" }]);
    const a = parseMetadata(rows, "A").photos;
    const b = parseMetadata(rows, "B").photos;
    expect(a[0]!.id).not.toBe(a[1]!.id);
    expect(a[0]!.id).not.toBe(b[0]!.id);
    expect(() => parseMetadata(rows, " ")).toThrow();
    expect(() => parseMetadata('[{"uuid":"a"},{"uuid":"a"}]', "A")).toThrow("duplicate");
    expect(() => parseMetadata('[{}]', "A")).toThrow("identity");
  });
  test("GPS validates complete finite numeric pairs and accepts zero and boundaries", () => {
    expect(parse({ latitude: 0, longitude: 0 }).gps).toEqual({ state: "present", source: "latitude,longitude", value: { latitude: 0, longitude: 0 } });
    expect(parse({ latitude: -90, longitude: 180 }).gps.state).toBe("present");
    expect(parse({}).gps.state).toBe("absent");
    expect(parse({ latitude: null, longitude: null }).gps.state).toBe("empty");
    for (const row of [{ latitude: 1 }, { latitude: null }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: "0", longitude: 0 }]) expect(parse(row).gps.state).toBe("invalid");
    expect(parseMetadata('[{"uuid":"a","latitude":1e999,"longitude":0}]', "A").photos[0]!.gps.state).toBe("invalid");
  });
  test("stored place remains independent of GPS with nested field provenance", () => {
    const p = parse({ place: { name: "Somewhere", names: {}, country_code: "ZZ" } });
    expect(p.gps.state).toBe("absent");
    expect(p.storedPlace).toEqual({ state: "present", source: "place", value: { name: { state: "present", source: "place.name", value: "Somewhere" }, names: { state: "empty", source: "place.names" }, countryCode: { state: "present", source: "place.country_code", value: "ZZ" } } });
    expect(parse({}).storedPlace.state).toBe("absent");
    expect(parse({ place: null }).storedPlace.state).toBe("empty");
    expect(parse({ place: {} }).storedPlace.state).toBe("empty");
    expect(parse({ persons: ["Alex", null] }).peopleLabels).toEqual({ state: "present", source: "persons", value: ["Alex", null] });
    const mapped = parse({ place: { names: { city: ["Toronto"], country: ["Canada"] } } }).storedPlace;
    expect(mapped.state === "present" && mapped.value.names).toEqual({ state: "present", source: "place.names", value: { city: ["Toronto"], country: ["Canada"] } });
    const malformed = parse({ place: { names: ["Toronto"] } }).storedPlace;
    expect(malformed.state === "present" && malformed.value.names.state).toBe("invalid");
    expect(parse({ place: [] }).storedPlace.state).toBe("invalid");
  });
  test("bounds and source shape reject oversized or ambiguous input", () => {
    expect(() => parseMetadata(" ".repeat(LIMITS.bytes + 1), "A")).toThrow("byte limit");
    expect(() => parseMetadata(JSON.stringify(Array.from({ length: 1001 }, (_, i) => ({ uuid: String(i) }))), "A")).toThrow("bounded");
    expect(parse({ keywords: Array(101).fill("x") }).userKeywords.state).toBe("invalid");
    expect(() => parseMetadata('{"photos":[]}', "A")).toThrow("array");
    expect(() => parseMetadata("broken", "A")).toThrow("JSON");
  });
  test("file import fails on missing input without creating it", async () => {
    await expect(importMetadata("/this-path-does-not-exist/photos.json", "A")).rejects.toThrow();
  });
});
