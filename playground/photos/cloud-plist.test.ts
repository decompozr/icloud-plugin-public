import { expect, test } from "bun:test";
import { decodePlist, PLIST_LIMITS } from "./cloud-plist";
import fixtures from "./cloud-fixtures.json";
const xml = (body: string) => Buffer.from(`<plist version="1.0">${body}</plist>`);
// Explicit bplist00 container builder for malformed graph tests, not a decoder.
function binary(objects: number[][], top = 0): Buffer {
  const offsets: number[] = [];
  let pos = 8;
  for (const o of objects) { offsets.push(pos); pos += o.length; }
  const trailer = Buffer.alloc(32);
  trailer[6] = 1; trailer[7] = 1;
  trailer.writeBigUInt64BE(BigInt(objects.length), 8);
  trailer.writeBigUInt64BE(BigInt(top), 16);
  trailer.writeBigUInt64BE(BigInt(pos), 24);
  return Buffer.concat([Buffer.from("bplist00"), ...objects.map(o => Buffer.from(o)), Buffer.from(offsets), trailer]);
}
test("fixed known upstream-wire fixtures preserve text and zero coordinates", () => {
  for (const format of [fixtures.binary, fixtures.xml]) {
    expect(decodePlist(Buffer.from(format.fields.keywordsEnc.value, "base64"))).toEqual(["holiday", "海邊"]);
    const gps = decodePlist(Buffer.from(format.fields.locationEnc.value, "base64")) as any;
    expect(gps.lat).toBe(0); expect(gps.lon).toBe(0);
    expect(gps.timestamp).toEqual(new Date("2020-01-01T00:00:00Z"));
  }
});
test("reject binary bad refs, cycles, lengths, overlapping payloads and unsafe keys", () => {
  for (const data of [
    binary([[0xa1, 1]]), binary([[0xa1, 0]]), binary([[0xa1, 1], [0xa1, 0]]),
    binary([[0x5f, 0x13, 0xff]]), binary([[0x54, 65], [0x10, 0]]),
    binary([[0xa1, 1], [0x61, 0xd8, 0x00]]), binary([[0x51, 0xff]]),
    binary([[0xd1, 1, 2], [0x59, ...Buffer.from("__proto__")], [0x00]]),
    binary([[0xd2, 1, 1, 2, 2], [0x51, 97], [0x00]]),
    binary([[0xaf, 0x50, 0]]), binary([[0xa0]], 1),
  ]) expect(() => decodePlist(data)).toThrow();
  const truncated = Buffer.from(fixtures.binary.fields.keywordsEnc.value, "base64");
  for (let n = 1; n < truncated.length; n++) expect(() => decodePlist(truncated.subarray(0, n))).toThrow();
});
test("bounds binary object counts, recursive depth and repeated graph expansion", () => {
  const deep = Array.from({ length: 35 }, (_, i) => i === 34 ? [0x00] : [0xa1, i + 1]);
  expect(() => decodePlist(binary(deep))).toThrow();
  const bomb = Array.from({ length: 16 }, (_, i) => i === 15 ? [0x00] : [0xa2, i + 1, i + 1]);
  expect(() => decodePlist(binary(bomb))).toThrow();
  const excessive = binary([[0xa0]]); excessive.writeBigUInt64BE(99999999n, excessive.length - 24);
  expect(() => decodePlist(excessive)).toThrow();
  expect(() => decodePlist(Buffer.alloc(PLIST_LIMITS.bytes + 1))).toThrow();
});
test("XML is strict about entities, malformed UTF8, nesting, numbers and dictionary shape", () => {
  for (const body of [
    "<dict><key>lat</key></dict>", "<dict><key>lat</key><real>0oops</real></dict>",
    "<dict><key>lat</key><integer>1.2</integer></dict>",
    "<dict><key>x</key><string>a</string><key>x</key><string>b</string></dict>",
    "<dict><key>__proto__</key><dict/></dict>", "<array><key>not a string</key></array>",
    "<array><plist><string>x</string></plist></array>", "<string>&unknown;</string>",
    "<array>".repeat(34) + "<string>x</string>" + "</array>".repeat(34),
    "<string>\u0000</string>", "<string>&#0;</string>", "<array><string>x</array>", "<string/><string/>", "<real>NaN</real>",
  ]) expect(() => decodePlist(xml(body))).toThrow();
  expect(() => decodePlist(Buffer.concat([Buffer.from("<plist><string>"), Buffer.from([0xff]), Buffer.from("</string></plist>")]))).toThrow();
  expect(() => decodePlist(Buffer.from('<!DOCTYPE plist [<!ENTITY x "secret">]><plist><string>&x;</string></plist>'))).toThrow();
  expect(decodePlist(xml("<array><string>A &amp; B &#x6d77;</string><string>  text  </string></array>"))).toEqual(["A & B 海", "  text  "]);
});
