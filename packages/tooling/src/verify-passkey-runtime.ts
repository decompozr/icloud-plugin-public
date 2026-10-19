import {generateKeyPairSync, sign, randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

/** Verify the standalone consumer's real cryptography, never production credentials. */
export async function verifyPasskeyRuntime(consumer: string) {
 const module: {verifySignature(input: {signature: Uint8Array; data: Uint8Array; credentialPublicKey: Uint8Array}): Promise<boolean>} =
  await import(pathToFileURL(Bun.resolveSync('@simplewebauthn/server/helpers', consumer)).href);
 const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
 const jwk = publicKey.export({format: 'jwk'});
 // COSE EC2/P-256/ES256 map with the generated public x/y coordinates.
 const credentialPublicKey = Buffer.concat([
  Buffer.from('a5010203262001215820', 'hex'), Buffer.from(jwk.x!, 'base64url'),
  Buffer.from('225820', 'hex'), Buffer.from(jwk.y!, 'base64url'),
 ]);
 const data = randomBytes(64), signature = sign('sha256', data, privateKey);
 if (!await module.verifySignature({signature, data, credentialPublicKey}))
  throw Error('Packaged Passkey valid signature rejected');
 const altered = Buffer.from(data); altered[0] = altered[0]! ^ 1;
 if (await module.verifySignature({signature, data: altered, credentialPublicKey}))
  throw Error('Packaged Passkey altered signature accepted');
}

if (import.meta.main) {
 if (!process.argv[2]) throw Error('Explicit standalone consumer directory required');
 await verifyPasskeyRuntime(process.argv[2]);
 console.log('Standalone Passkey signature accepted; altered data rejected.');
}
