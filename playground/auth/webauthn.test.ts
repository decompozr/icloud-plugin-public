import { test, expect } from 'bun:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { Encoder } from 'cbor-x';
const encoder = new Encoder({ useRecords: false, mapsAsObjects: false });
const encode = (v: unknown) => encoder.encode(v);
import { generateRegistrationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server';
const b64 = (v: Uint8Array) => Buffer.from(v).toString('base64url');
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest();
const rp = 'mail.example.test', origin = `https://${rp}`;
async function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cose = encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]));
  const id = Buffer.from('synthetic-credential');
  const options = await generateRegistrationOptions({ rpName: 'spike', rpID: rp, userName: 'fixture-owner', supportedAlgorithmIDs: [-7] });
  const client = (type: string, challenge: string, at = origin) => Buffer.from(JSON.stringify({ type, challenge, origin: at, crossOrigin: false }));
  const data = (flags: number, counter: number, at = rp) => { const count = Buffer.alloc(4); count.writeUInt32BE(counter); return Buffer.concat([hash(at), Buffer.from([flags]), count]); };
  const len = Buffer.alloc(2); len.writeUInt16BE(id.length);
  const registration = { id: b64(id), rawId: b64(id), type: 'public-key' as const, clientExtensionResults: {}, response: { clientDataJSON: b64(client('webauthn.create', options.challenge)), attestationObject: b64(encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', Buffer.concat([data(0x45, 0), Buffer.alloc(16), len, id, cose])]]))) } };
  const result = await verifyRegistrationResponse({ response: registration, expectedChallenge: options.challenge, expectedOrigin: origin, expectedRPID: rp, requireUserVerification: true });
  expect(result.verified).toBe(true);
  const assertion = (at = origin, forRP = rp, flags = 5) => {
    const cd = client('webauthn.get', 'fresh-challenge', at), ad = data(flags, 1, forRP);
    return { id: b64(id), rawId: b64(id), type: 'public-key' as const, clientExtensionResults: {}, response: { clientDataJSON: b64(cd), authenticatorData: b64(ad), signature: b64(sign('sha256', Buffer.concat([ad, hash(cd)]), privateKey)) } };
  };
  const verify = (response = assertion(), extra = {}) => verifyAuthenticationResponse({ response, expectedChallenge: 'fresh-challenge', expectedOrigin: origin, expectedRPID: rp, credential: result.registrationInfo!.credential, requireUserVerification: true, ...extra });
  return { verify, assertion };
}
test('L7 synthetic none-attestation registration and signed ES256 assertion verify', async () => { const f = await fixture(); expect((await f.verify()).verified).toBe(true); });
for (const scenario of ['origin', 'rp', 'challenge', 'uv'] as const) test(`L7 rejects wrong ${scenario}`, async () => {
  const f = await fixture();
  const response = scenario === 'origin' ? f.assertion('https://evil.example.test') : scenario === 'rp' ? f.assertion(origin, 'other.example.test') : scenario === 'uv' ? f.assertion(origin, rp, 1) : f.assertion();
  await expect(f.verify(response, scenario === 'challenge' ? { expectedChallenge: 'different' } : {})).rejects.toThrow();
});
test('L7 rejects tampered signature', async () => { const f = await fixture(); const a = f.assertion(); const sig = Buffer.from(a.response.signature, 'base64url'); sig[sig.length - 1] ^= 1; a.response.signature = b64(sig); expect((await f.verify(a)).verified).toBe(false); });
test('L7 server allows explicit second origin for same RP, not browser policy proof', async () => { const f = await fixture(); const second = `https://${rp}:8443`; expect((await f.verify(f.assertion(second), { expectedOrigin: [origin, second] })).verified).toBe(true); });
