import { expect, test } from "bun:test";
import { fixtureResponse, library, pair, startFixture } from "./fixture";
import { parsePage, query, readLoopback, selectResource } from "./photos";

test("filename collisions preserve scoped asset identity and master references", () => {
  const [one, two] = parsePage(fixtureResponse(0, 2), library);
  expect(one!.filename).toBe(two!.filename);
  expect(one!.id).not.toBe(two!.id);
  expect(one!.masterRecordName).toBe("master-one");
  expect(parsePage({ records: pair("one") }, { ...library, database: "shared" })[0]!.id).not.toBe(one!.id);
  expect(parsePage({ records: pair("one") }, { ...library, zoneID: { ...library.zoneID, ownerRecordName: "other" } })[0]!.id).not.toBe(one!.id);
  expect(parsePage({ records: pair("one") }, { ...library, zoneID: { ownerRecordName: "fixture-owner", zoneName: "PrimarySync" } })[0]!.id).toBe(one!.id);
});

test("exact rendition selection retains Live Photo motion and never substitutes an original", () => {
  const photo = parsePage({ records: pair("live", true, true) }, library)[0]!;
  expect(Object.keys(photo.resources)).toEqual(["thumbnail", "original", "livePhotoMotion"]);
  expect(selectResource(photo, "livePhotoMotion").fileType).toBe("com.apple.quicktime-movie");
  const noThumb = parsePage({ records: pair("two", false) }, library)[0]!;
  expect(() => selectResource(noThumb, "thumbnail")).toThrow("unavailable rendition");
  expect(selectResource(noThumb, "original").fileType).toBe("public.heic");
});

test("asset rendition overrides the same master role, malformed override fails explicitly", () => {
  const records: any[] = pair("one");
  records[0].fields.resJPEGThumbRes = { value: { size: 12, downloadURL: "https://photos.invalid/adjusted-thumb", fileChecksum: "adjusted" } };
  records[0].fields.resJPEGThumbFileType = { value: "public.jpeg" };
  expect(selectResource(parsePage({ records }, library)[0]!, "thumbnail").fileChecksum).toBe("adjusted");
  delete records[0].fields.resJPEGThumbRes.value.size;
  expect(() => parsePage({ records }, library)).toThrow("invalid resource size");
});

test("missing, orphan, duplicate and shared masters fail rather than invent joins", () => {
  const records: any[] = pair("one");
  expect(() => parsePage({ records: [records[0]] }, library)).toThrow("missing master");
  expect(() => parsePage({ records: [records[1]] }, library)).toThrow("orphan master");
  expect(() => parsePage({ records: [...records, records[1]] }, library)).toThrow("duplicate record");
  expect(() => parsePage({ records: [...records, { ...records[0], recordName: "asset-second" }] }, library)).toThrow("shared master");
  expect(() => parsePage({ records: [{ ...records[0], zoneID: { zoneName: "other" } }, records[1]] }, library)).toThrow("record zone mismatch");
  records[0].fields.masterRef.value.zoneID = { ...library.zoneID, ownerRecordName: "other" };
  expect(() => parsePage({ records }, library)).toThrow("master reference zone mismatch");
});

test("filename encoding is explicit and never becomes identity", () => {
  const records: any[] = pair("one");
  records[1].fields.filenameEnc = { value: "相片.HEIC", type: "STRING" };
  expect(parsePage({ records }, library)[0]!.filename).toBe("相片.HEIC");
  delete records[1].fields.filenameEnc;
  expect(parsePage({ records }, library)[0]!.filename).toBeNull();
  records[1].fields.filenameEnc = { value: "%%%", type: "ENCRYPTED_BYTES" };
  expect(() => parsePage({ records }, library)).toThrow("invalid filename encoding");
});

test("query retains upstream record type, rank and paired-row limit", () => {
  const body = query(library, 2, 3);
  expect(body.query.recordType).toBe("CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted");
  expect(body.query.filterBy[0]!.fieldValue).toEqual({ type: "INT64", value: 2 });
  expect(body.resultsLimit).toBe(6);
  expect(body.zoneID).toEqual(library.zoneID);
});

test("real loopback pagination advances by paired assets and confirms empty-page exhaustion", async () => {
  const { server, requests } = startFixture();
  try {
    const result = await readLoopback(server.port!, library);
    expect(result.photos.length).toBe(3);
    expect(result.complete).toBe(true);
    expect(result.truncated).toBe(false);
    expect(requests.map(request => request.startRank)).toEqual([0, 2, 3]);
    expect(requests[0]!.resultsLimit).toBe(4);
  } finally { await server.stop(true); }
});

for (const [bound, options, count] of [
  ["page-cap", { maxPages: 1 }, 2], ["item-cap", { maxItems: 1 }, 1],
] as const) test(`${bound} reports incomplete and stops making requests`, async () => {
  const { server, requests } = startFixture();
  try {
    const result = await readLoopback(server.port!, library, options);
    expect(result.photos.length).toBe(count);
    expect(result.complete).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.stoppedBy).toBe(bound);
    expect(requests.length).toBe(1);
  } finally { await server.stop(true); }
});

for (const mode of ["invalid-json", "oversize", "redirect", "timeout", "repeated-page", "cumulative-bytes"] as const) {
  test(`${mode} aborts without another page or redirect follow`, async () => {
    let requests = 0;
    const body = JSON.stringify({ records: pair("one") });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      requests++;
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBeNull();
      if (mode === "invalid-json") return new Response("{");
      if (mode === "redirect") return new Response(null, { status: 302, headers: { Location: "/redirect-target" } });
      if (mode === "timeout") { await Bun.sleep(100); return Response.json({ records: [] }); }
      if (mode === "oversize") return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(" ".repeat(512))); controller.close(); } }));
      return new Response(body);
    } });
    try {
      const options = mode === "oversize" ? { maxBytes: 128 } : mode === "timeout" ? { timeoutMs: 20 } : mode === "cumulative-bytes" ? { maxBytes: new TextEncoder().encode(body).length + 10 } : {};
      await expect(readLoopback(server.port!, library, options)).rejects.toThrow();
      expect(requests).toBe(mode === "repeated-page" || mode === "cumulative-bytes" ? 2 : 1);
    } finally { await server.stop(true); }
  });
}

test("invalid bounds and external destinations are rejected before any request", async () => {
  await expect(readLoopback("https://icloud.com" as any, library)).rejects.toThrow("invalid port");
  await expect(readLoopback(1, library, { maxPages: Infinity })).rejects.toThrow("invalid maxPages");
  await expect(readLoopback(1, library, { maxItems: 0 })).rejects.toThrow("invalid maxItems");
});
