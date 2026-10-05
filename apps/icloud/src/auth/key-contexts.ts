import type {Database} from 'bun:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {CustodyError} from '../storage/custody-contract.js';

const envelopeSchema=z.object({nonce:z.string(),tag:z.string(),value:z.string()});
export const resourceClientSchema=z.object({client_id:z.string(),client_secret:z.string()});
/** Existing contexts and HEX encoding: do not rotate or substitute raw key bytes. */
export function ownerAuthSecret(masterKey:Uint8Array,mode:'remote'|'local'):string {
 if(masterKey.byteLength!==32||(mode!=='remote'&&mode!=='local'))throw new CustodyError('invalid_input');
 return createHash('sha256').update(masterKey).update(mode==='remote'?'owner-auth-v1':'local-owner-auth-v1').digest('hex');
}
export function resourceClientStorageId(issuer:string,resource:string):string {
 return 'resource-client-v2:'+createHash('sha256').update(issuer+'\n'+resource).digest('hex');
}
function encryptionKey(secret:string){return createHash('sha256').update(secret).update('icloud-resource-client-v1').digest();}
/** Same historical AES envelope/no-AAD context, with bounded private buffers. */
export function sealResourceClient(secret:string,value:string):string {
 const key=encryptionKey(secret),plain=Buffer.from(value,'utf8');
 try{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),data=Buffer.concat([cipher.update(plain),cipher.final()]);
  return JSON.stringify({nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:data.toString('base64')});
 }finally{key.fill(0);plain.fill(0);}
}
export function openResourceClient(secret:string,value:string):string {
 const key=encryptionKey(secret);let partial:Buffer|undefined,final:Buffer|undefined,plain:Buffer|undefined;
 try{const item=envelopeSchema.parse(JSON.parse(value)),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(item.nonce,'base64'));
  decipher.setAuthTag(Buffer.from(item.tag,'base64'));partial=decipher.update(Buffer.from(item.value,'base64'));final=decipher.final();
  plain=Buffer.concat([partial,final]);return plain.toString('utf8');
 }catch{throw new CustodyError('recovery_required');}
 finally{key.fill(0);partial?.fill(0);final?.fill(0);plain?.fill(0);}
}

/** Existing-handle snapshot validation only: no schema creation, client
 * registration, auth factory startup or DB close. Required issuer/resource ID
 * belongs to the authenticated baseline; every retained row must decrypt, not
 * just the currently selected one. No secret, digest or identity is returned.
 * This does not authenticate Passkeys/tokens/cookies or imply full K2 acceptance.
 */
export function validateResourceClientCiphertexts(options:{database:Database;masterKey:Uint8Array;requiredRecordId:string}):Readonly<{format:1;records:number}> {
 try{
  if(!/^resource-client-v2:[a-f0-9]{64}$/.test(options.requiredRecordId))throw new CustodyError('invalid_input');
  const secret=ownerAuthSecret(options.masterKey,'remote');
  return options.database.transaction(()=>{
   let found=false,records=0;
   for(const raw of options.database.query('SELECT id,value FROM plugin_auth_private').all()){
    const row=z.object({id:z.string().min(1),value:z.string()}).strict().parse(raw);
    resourceClientSchema.parse(JSON.parse(openResourceClient(secret,row.value)));
    if(row.id===options.requiredRecordId)found=true;records++;
   }
   if(!found)throw new CustodyError('recovery_required');
   return Object.freeze({format:1 as const,records});
  })();
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
}
