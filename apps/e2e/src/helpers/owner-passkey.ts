import {Encoder} from 'cbor-x';
import {createHash,generateKeyPairSync,sign,randomBytes} from 'node:crypto';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest();
const b64=(v:Uint8Array)=>Buffer.from(v).toString('base64url');
const encoder=new Encoder({useRecords:false,mapsAsObjects:false});
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=publicKey.export({format:'jwk'}),id=randomBytes(24);
const cose=encoder.encode(new Map<number, number | Buffer>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]));
export function passkeyResponse(challenge:string,origin:string,register:boolean,uv=true,counter=1){
 const cd=Buffer.from(JSON.stringify({type:register?'webauthn.create':'webauthn.get',challenge,origin,crossOrigin:false}));
 const count=Buffer.alloc(4);count.writeUInt32BE(register?0:counter);
 const ad=Buffer.concat([hash('127.0.0.1'),Buffer.from([register?(uv?0x45:0x41):(uv?5:1)]),count]);
 const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
 return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:register?{clientDataJSON:b64(cd),attestationObject:b64(encoder.encode(new Map<string, unknown>([['fmt','none'],['attStmt',new Map()],['authData',Buffer.concat([ad,Buffer.alloc(16),length,id,cose])]])))}:{clientDataJSON:b64(cd),authenticatorData:b64(ad),signature:b64(sign('sha256',Buffer.concat([ad,hash(cd)]),privateKey))}};
}
