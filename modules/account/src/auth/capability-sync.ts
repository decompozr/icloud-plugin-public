import type {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';

type Client={clientId:string;userId:string|null;scopes:string|null;disabled:number|null};
const parse=(value:string|null,fallback:readonly string[])=>value===null?[...fallback]:JSON.parse(value) as string[];
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every(s=>b.includes(s));
/** Module enablement updates registration ceilings, never consent or token grants. */
export function synchronizeClientCapabilities(options:{database:Database;owner:string|null|undefined;declared:readonly string[];enabled:readonly string[];validAccount(owner:string,account:string):boolean}){
 const {database:db,owner}=options;if(!owner)return;
 db.exec('CREATE TABLE IF NOT EXISTS plugin_client_scope_audit(id TEXT PRIMARY KEY,owner TEXT NOT NULL,clientId TEXT NOT NULL,registeredBefore TEXT NOT NULL,registeredAfter TEXT NOT NULL,occurredAt TEXT NOT NULL)');
 db.transaction(()=>{
  for(const client of db.query<Client,[]>('SELECT clientId,userId,scopes,disabled FROM oauthClient').all()){
   if(client.disabled||client.userId!==null&&client.userId!==owner)continue;
   const consents=db.query<{userId:string|null;referenceId:string|null},[string]>('SELECT userId,referenceId FROM oauthConsent WHERE clientId=?').all(client.clientId);
   if(client.userId!==owner&&!consents.some(c=>c.userId===owner&&c.referenceId&&options.validAccount(owner,c.referenceId)))continue;
   // Shared registrations and outstanding foreign codes retain their separate owner boundary.
   if(['oauthConsent','oauthAccessToken','oauthRefreshToken'].some(table=>db.query('SELECT id FROM '+table+' WHERE clientId=? AND (userId IS NULL OR userId<>?) LIMIT 1').get(client.clientId,owner)))continue;
   if(db.query<{value:string},[]>('SELECT value FROM verification').all().some(row=>{try{const v=JSON.parse(row.value);return v.type==='authorization_code'&&v.query?.client_id===client.clientId&&v.userId!==owner;}catch{return false;}}))continue;
   const before=parse(client.scopes,options.declared),after=[...new Set([...before,...options.enabled.filter(s=>options.declared.includes(s))])];
   if(same(before,after))continue;
   db.query('UPDATE oauthClient SET scopes=? WHERE clientId=?').run(JSON.stringify(after),client.clientId);
   db.query('INSERT INTO plugin_client_scope_audit VALUES(?,?,?,?,?,?)').run(randomUUID(),owner,client.clientId,JSON.stringify(before),JSON.stringify(after),new Date().toISOString());
  }
 }).immediate();
}

/** Recover cached whole-registration reconnect requests. Explicit narrow requests stay narrow. */
export function updatedAuthorizationScopes(db:Database,owner:string|null|undefined,clientId:string,requested:readonly string[],enabled:readonly string[]):string[]{
 if(!owner||!requested.length||requested.some(s=>!enabled.includes(s))||requested.filter(s=>s!=='offline_access').every(s=>s.endsWith('.read')))return [...requested];
 const client=db.query<Client,[string]>('SELECT clientId,userId,scopes,disabled FROM oauthClient WHERE clientId=?').get(clientId);
 if(!client||client.disabled||client.userId!==null&&client.userId!==owner)return [...requested];
 if(['oauthConsent','oauthAccessToken','oauthRefreshToken'].some(table=>db.query('SELECT id FROM '+table+' WHERE clientId=? AND (userId IS NULL OR userId<>?) LIMIT 1').get(clientId,owner)))return [...requested];
 if(db.query<{value:string},[]>('SELECT value FROM verification').all().some(row=>{try{const v=JSON.parse(row.value);return v.type==='authorization_code'&&v.query?.client_id===clientId&&v.userId!==owner;}catch{return false;}}))return [...requested];
 const snapshots=db.query<{registeredBefore:string},[string,string]>('SELECT registeredBefore FROM plugin_client_scope_audit WHERE owner=? AND clientId=?').all(owner,clientId);
 if(!snapshots.some(row=>same(parse(row.registeredBefore,[]),requested)))return [...requested];
 return [...new Set([...requested,...parse(client.scopes,[]).filter(s=>enabled.includes(s))])];
}
