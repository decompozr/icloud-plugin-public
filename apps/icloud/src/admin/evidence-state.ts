import type {Database} from 'bun:sqlite';
import type {OwnerSecretStore} from '@decompozr/account/server';
import type {Principal} from '@decompozr/account/server';
import {createHash} from 'node:crypto';
/** Only nonsecret metadata. Any relevant change invalidates the whole observation conservatively. */
export function evidenceState(db:Database,store:OwnerSecretStore,allowed:()=>readonly string[],epoch:()=>number){
 const whitelist=['id','clientId','userId','referenceId','scopes','expiresAt','revoked','disabled','sessionId','refreshId','createdAt','updatedAt'];
 return(p:Principal,service:string):string|undefined=>{try{
  if(!p.accountId||!p.clientId||store.ownerId()!==p.subject||!allowed().includes(service+'.read'))return;
  const generation=store.accountGeneration?.(p.subject,p.accountId);if(generation===undefined)return;
  const state:unknown[]=[generation,epoch(),[...allowed()].sort()];
  if(service==='homekit'){const bindings=db.query('SELECT id,home,uid,source FROM homekit_bindings WHERE owner=? AND account=? ORDER BY id LIMIT 101').all(p.subject,p.accountId);if(!bindings.length||bindings.length>100)return;state.push(bindings);}
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
