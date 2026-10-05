// Invented data shaped after the pinned source, never an account capture.
import type { Library } from "./photos";

export const library: Library = { database: "private", zoneID: { zoneName: "PrimarySync", ownerRecordName: "fixture-owner" } };
const field = (value: unknown, type = "STRING") => ({ value, type });
const rendition = (prefix: string, name: string, type: string) => ({
  [`${prefix}Res`]: field({ size: 1024, downloadURL: `https://photos.invalid/${name}`, fileChecksum: `synthetic-${name}` }, "ASSETID"),
  [`${prefix}FileType`]: field(type),
});

export function pair(name: string, thumbnail = true, motion = false) {
  return [
    { recordType: "CPLAsset", recordName: `asset-${name}`, fields: { masterRef: field({ recordName: `master-${name}` }, "REFERENCE") } },
    { recordType: "CPLMaster", recordName: `master-${name}`, fields: {
      filenameEnc: field(Buffer.from("IMG_0001.HEIC").toString("base64"), "ENCRYPTED_BYTES"),
      ...rendition("resOriginal", `${name}.heic`, "public.heic"),
      ...(thumbnail ? rendition("resJPEGThumb", `${name}-thumb.jpg`, "public.jpeg") : {}),
      ...(motion ? rendition("resOriginalVidCompl", `${name}.mov`, "com.apple.quicktime-movie") : {}),
    } },
  ];
}

export const fixturePairs = [pair("one"), pair("two", false), pair("live", true, true)];
export function fixtureResponse(startRank: number, pageSize: number) {
  return { records: fixturePairs.slice(startRank, startRank + pageSize).flat() };
}

export function startFixture() {
  const requests: { startRank: number; resultsLimit: number }[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      if (request.method !== "POST" || new URL(request.url).pathname !== "/database/1/com.apple.photos.cloud/production/private/records/query") return new Response(null, { status: 404 });
      const body = await request.json();
      const startRank = body.query.filterBy.find((filter: { fieldName: string }) => filter.fieldName === "startRank").fieldValue.value;
      requests.push({ startRank, resultsLimit: body.resultsLimit });
      return Response.json(fixtureResponse(startRank, body.resultsLimit / 2));
    },
  });
  return { server, requests };
}
