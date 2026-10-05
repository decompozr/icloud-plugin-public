import type {Database} from 'bun:sqlite';
import type {OwnerSecretStore} from '../storage/owner-store.js';
import type {Principal} from '../auth/verify.js';
import {createHash} from 'node:crypto';
/** Only nonsecret metadata. Any relevant change invalidates the whole observation conservatively. */
export function evidenceState(db:Database,store:OwnerSecretStore,allowed:()=>readonly string[],epoch:()=>number){
 const whitelist=['id','clientId','userId','referenceId','scopes','expiresAt','revoked','disabled','sessionId','refreshId','createdAt','updatedAt'];
 return(p:Principal,service:string):string|undefined=>{try{
  if(!p.accountId||!p.clientId||store.ownerId()!==p.subject||!allowed().includes(service+'.read'))return;
  const generation=store.accountGeneration?.(p.subject,p.accountId);if(generation===undefined)return;
  const state:unknown[]=[generation,epoch(),[...allowed()].sort()];
  for(const table of ['oauthClient','oauthConsent','oauthAccessToken','oauthRefreshToken','session']){
   const columns=(db.query('PRAGMA table_info('+table+')').all() as {name:string}[]).map(c=>c.name),safe=whitelist.filter(c=>columns.includes(c));
   const filter=table==='session'?'userId':'clientId';if(!columns.includes(filter)||!safe.includes('id'))return;
   const rows=db.query('SELECT '+safe.map(c=>'"'+c+'"').join(',')+' FROM "'+table+'" WHERE "'+filter+'"=? ORDER BY id LIMIT 2049').all(table==='session'?p.subject:p.clientId) as Record<string,unknown>[];
   if(rows.length>2048)return;
   state.push(rows.map(row=>({...row,...(table==='session'?{expired:typeof row.expiresAt==='number'?row.expiresAt<=Date.now():Date.parse(String(row.expiresAt))<=Date.now()}: {})})));
  }
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
 }catch{return;}};
}
