import { describe, expect, test } from "bun:test";
import { serializePairingTranscript, signPairingRequest, verifyPairingResponse, type PairingTranscript } from "./cloud-search-pairing";

const fromHex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const transcript = (): PairingTranscript => ({
  remoteChallenge: Uint8Array.from({ length: 32 }, (_, i) => i),
  localChallenge: Uint8Array.from({ length: 32 }, (_, i) => i + 32),
  transactionId: "00112233-4455-6677-8899-aabbccddeeff",
  sessionToken: "tok",
  localIdentity: fromHex("aabb"), remoteIdentity: fromHex("ccddee"),
});
const key = (extractable = false) => crypto.subtle.importKey("raw", Uint8Array.from({ length: 32 }, (_, i) => i),
  { name: "HMAC", hash: "SHA-256" }, extractable, ["sign", "verify"]);
// Fixed, manually framed bytes; proof values generated independently with OpenSSL
// dgst -sha256 -mac HMAC -macopt hexkey:000102...1f (synthetic key only).
const wire = "012000000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2000202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f00112233445566778899aabbccddeeff0300746f6b0200aabb0300ccddee";
const requestProof = "7ceceac5ce49dd2396b4cebc0f01b5e9511066ec048c1bc5493e43df0202fad7";
const responseProof = "c1c3657485e0e80e79ae23f750bf59c1fa1af07495d41881d5eddb422f13ecf4";

describe("SkyBridge v1 pairing wire codec (offline only)", () => {
  test("matches manual framing and independent OpenSSL MACs", async () => {
    expect(hex(serializePairingTranscript(transcript()))).toBe(wire);
    expect(hex(await signPairingRequest(await key(), transcript()))).toBe(requestProof);
    expect(await verifyPairingResponse(await key(), transcript(), fromHex(responseProof))).toBe(true);
    expect(await verifyPairingResponse(await key(), transcript(), fromHex(requestProof))).toBe(false);
  });
  test("binds both identities, session, challenges and transaction", async () => {
    const secret = await key();
    for (const field of ["remoteChallenge", "localChallenge", "localIdentity", "remoteIdentity"] as const) {
      const altered = transcript(); altered[field][0] ^= 1;
      expect(await verifyPairingResponse(secret, altered, fromHex(responseProof))).toBe(false);
    }
    for (const changed of [
      { sessionToken: "other" },
      { transactionId: "00112233-4455-6677-8899-aabbccddee00" },
      { localIdentity: fromHex("ccddee"), remoteIdentity: fromHex("aabb") },
    ]) expect(await verifyPairingResponse(secret, { ...transcript(), ...changed }, fromHex(responseProof))).toBe(false);
  });
  test("rejects reflection and malformed or oversized input with fixed errors", async () => {
    for (const changed of [
      { localChallenge: transcript().remoteChallenge },
      { remoteIdentity: transcript().localIdentity },
      { remoteChallenge: new Uint8Array(31) },
      { localIdentity: new Uint8Array(65536) },
      { transactionId: "private-invalid-id" },
      { sessionToken: "" },
      { sessionToken: "界".repeat(21846) },
    ]) expect(() => serializePairingTranscript({ ...transcript(), ...changed })).toThrow("invalid_pairing_transcript");
    await expect(verifyPairingResponse(await key(), transcript(), new Uint8Array(31))).rejects.toThrow("invalid_pairing_transcript");
  });
  test("counts UTF-8 bytes and encodes lengths little endian", () => {
    const result = serializePairingTranscript({ ...transcript(), sessionToken: "界".repeat(100) });
    expect([...result.slice(85, 87)]).toEqual([44, 1]);
    expect(result.length).toBe(91 + 300 + 5);
  });
  test("requires non-extractable HMAC SHA-256 keys", async () => {
    await expect(signPairingRequest(await key(true), transcript())).rejects.toThrow("invalid_pairing_key");
    const wrong = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-512" }, false, ["sign", "verify"]);
    await expect(signPairingRequest(wrong, transcript())).rejects.toThrow("invalid_pairing_key");
    const verifyOnly = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    await expect(signPairingRequest(verifyOnly, transcript())).rejects.toThrow("invalid_pairing_key");
  });
});
