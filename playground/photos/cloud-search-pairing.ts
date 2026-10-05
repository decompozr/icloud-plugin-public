/** Handwritten SkyBridge v1 wire codec; no network, key provisioning or storage.
 * Protocol observed in Apple's public 2636Build34 main.js, offsets 2422800–2425800:
 * https://www.icloud.com/system/icloud.com/2636Build34/en-us/main.js
 * Offline compatibility only; this does not establish device approval or search readiness.
 */
export interface PairingTranscript {
  remoteChallenge: Uint8Array;
  localChallenge: Uint8Array;
  transactionId: string;
  sessionToken: string;
  localIdentity: Uint8Array;
  remoteIdentity: Uint8Array;
}

const encoder = new TextEncoder();
const invalid = () => new Error("invalid_pairing_transcript");
function bytes(value: unknown, exact?: number): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.length === 0 || value.length > 65535
    || (exact !== undefined && value.length !== exact)) throw invalid();
}

/** UInt16 lengths are little endian. UUID bytes remain in textual/network order.
 * Device proof reverses the identity order, not the challenges.
 */
export function serializePairingTranscript(input: PairingTranscript, deviceProof = false): Uint8Array {
  bytes(input.remoteChallenge, 32);
  bytes(input.localChallenge, 32);
  bytes(input.localIdentity);
  bytes(input.remoteIdentity);
  if (input.remoteChallenge.every((v, i) => v === input.localChallenge[i])) throw invalid();
  if (input.localIdentity.length === input.remoteIdentity.length
    && input.localIdentity.every((v, i) => v === input.remoteIdentity[i])) throw invalid();
  if (typeof input.transactionId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.transactionId)) throw invalid();
  if (typeof input.sessionToken !== "string" || !input.sessionToken.length || input.sessionToken.length > 65535) throw invalid();
  const token = encoder.encode(input.sessionToken);
  bytes(token);
  const uuid = Uint8Array.from(input.transactionId.replaceAll("-", "").match(/../g)!, h => parseInt(h, 16));
  const identities = deviceProof
    ? [input.remoteIdentity, input.localIdentity] : [input.localIdentity, input.remoteIdentity];
  const output = new Uint8Array(91 + token.length + input.localIdentity.length + input.remoteIdentity.length);
  const view = new DataView(output.buffer);
  let offset = 0;
  output[offset++] = 1;
  const append = (value: Uint8Array) => {
    view.setUint16(offset, value.length, true); offset += 2;
    output.set(value, offset); offset += value.length;
  };
  append(input.remoteChallenge);
  append(input.localChallenge);
  output.set(uuid, offset); offset += 16;
  append(token);
  identities.forEach(append);
  return output;
}

function validateKey(key: CryptoKey, usage: "sign" | "verify") {
  const algorithm = key?.algorithm as HmacKeyAlgorithm | undefined;
  if (!(key instanceof CryptoKey) || key.type !== "secret" || key.extractable
    || algorithm?.name !== "HMAC" || algorithm.hash?.name !== "SHA-256"
    || !key.usages.includes(usage)) throw new Error("invalid_pairing_key");
}

/** Caller supplies a legitimate device-approved, non-extractable HMAC key. */
export async function signPairingRequest(key: CryptoKey, input: PairingTranscript): Promise<Uint8Array> {
  validateKey(key, "sign");
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, serializePairingTranscript(input)));
}

/** Uses WebCrypto's MAC verification rather than a JavaScript byte comparison. */
export async function verifyPairingResponse(key: CryptoKey, input: PairingTranscript, proof: Uint8Array): Promise<boolean> {
  validateKey(key, "verify");
  bytes(proof, 32);
  return crypto.subtle.verify("HMAC", key, proof, serializePairingTranscript(input, true));
}
