import type {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {withOAuthMutation} from './client-recovery.js';
const list=(value:unknown):string[]=>{if(typeof value!=='string')return [];const parsed=JSON.parse(value);if(!Array.isArray(parsed)||parsed.some(v=>typeof v!=='string'))throw Error('Invalid scope record');return parsed;};
const timestamp=(value:unknown)=>typeof value==='number'?value:typeof value==='string'?Date.parse(value):0;
/** Owner-authorized capability saves synchronize existing, live account grants only. */
export function createClientPermissionSync(options:{database:Database;resource:string;ownerId():string|null|undefined;declaredScopes:readonly string[];allowedScopes():readonly string[];validAccount(owner:string,accountId:string):boolean}) {
 const db=options.database;
 db.exec('CREATE TABLE IF NOT EXISTS plugin_client_permission_sync_audit(id TEXT PRIMARY KEY,owner TEXT NOT NULL,clientId TEXT NOT NULL,accountId TEXT,kind TEXT NOT NULL,recordId TEXT NOT NULL,scopesBefore TEXT NOT NULL,scopesAfter TEXT NOT NULL,occurredAt TEXT NOT NULL)');
 return ()=>withOAuthMutation(db,async()=>{
  const owner=options.ownerId();if(!owner)return {status:'synced' as const,clients:0,grants:0,skipped:0};
  const consentResource=(row:Record<string,unknown>)=>{if(row.resources==null)return true;const values=list(row.resources);return values.length===0||values.length===1&&values[0]===options.resource;};
  const enabled=[...new Set(options.allowedScopes().filter(scope=>options.declaredScopes.includes(scope)))];
  return db.transaction(()=>{
   let clients=0,grants=0,skipped=0;const now=Date.now();
   const audit=(clientId:string,accountId:string|null,kind:string,id:string,before:string[],after:string[])=>db.query('INSERT INTO plugin_client_permission_sync_audit VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),owner,clientId,accountId,kind,id,JSON.stringify(before),JSON.stringify(after),new Date(now).toISOString());
   for(const client of db.query('SELECT clientId,userId,scopes,disabled FROM oauthClient WHERE disabled IS NULL OR disabled=0').all() as Array<{clientId:string;userId:string|null;scopes:string|null}>){
    if(client.userId!==null&&client.userId!==owner)continue;
    let blocked=false;
    const eligible=new Map<string,Array<{table:string;row:Record<string,unknown>}>>();
    for(const table of ['oauthAccessToken','oauthRefreshToken'])for(const row of db.query('SELECT * FROM '+table+' WHERE clientId=? AND userId=?').all(client.clientId,owner) as Record<string,unknown>[]){
     if(typeof row.referenceId!=='string'||row.revoked||!(timestamp(row.expiresAt)>now)||!options.validAccount(owner,row.referenceId))continue;
     if(table==='oauthAccessToken'&&row.sessionId){const session=db.query('SELECT expiresAt FROM session WHERE id=? AND userId=?').get(row.sessionId as string,owner) as {expiresAt:unknown}|null;if(!session||!(timestamp(session.expiresAt)>now))continue;}
     const resources=list(row.resources);if(!resources.includes(options.resource))continue;
     if(resources.length!==1){if(enabled.some(scope=>!list(row.scopes).includes(scope)))blocked=true;continue;}
     if(!(db.query('SELECT * FROM oauthConsent WHERE clientId=? AND userId=? AND referenceId=?').all(client.clientId,owner,row.referenceId) as Record<string,unknown>[]).some(consentResource)){if(enabled.some(scope=>!list(row.scopes).includes(scope)))blocked=true;continue;}
     const group=eligible.get(row.referenceId)??[];group.push({table,row});eligible.set(row.referenceId,group);
    }
    if(blocked)skipped++;
    if(!eligible.size)continue;
    const registrationBefore=client.scopes===null?[...options.declaredScopes]:list(client.scopes);
    const needsRegistration=enabled.some(scope=>!registrationBefore.includes(scope));
    const needsGrant=[...eligible].some(([accountId,records])=>[...records.map(value=>value.row),...(db.query('SELECT * FROM oauthConsent WHERE clientId=? AND userId=? AND referenceId=?').all(client.clientId,owner,accountId) as Record<string,unknown>[]).filter(consentResource)].some(row=>enabled.some(scope=>!list(row.scopes).includes(scope))));
    if(!needsRegistration&&!needsGrant)continue;
    const foreign=['oauthAccessToken','oauthRefreshToken','oauthConsent'].some(table=>!!db.query('SELECT id FROM '+table+' WHERE clientId=? AND (userId IS NULL OR userId<>?) LIMIT 1').get(client.clientId,owner));
    if(foreign){if(!blocked)skipped++;continue;}
    const before=client.scopes===null?[...options.declaredScopes]:list(client.scopes),after=[...new Set([...before,...enabled])];
    if(enabled.some(scope=>!before.includes(scope))){db.query('UPDATE oauthClient SET scopes=? WHERE clientId=?').run(JSON.stringify(after),client.clientId);audit(client.clientId,null,'registration',client.clientId,before,after);clients++;}
    for(const [accountId,records] of eligible){
     records.push(...(db.query('SELECT * FROM oauthConsent WHERE clientId=? AND userId=? AND referenceId=?').all(client.clientId,owner,accountId) as Record<string,unknown>[]).filter(consentResource).map(row=>({table:'oauthConsent',row})));
     for(const {table,row} of records){const previous=list(row.scopes),next=[...new Set([...previous,...enabled])];if(!enabled.some(scope=>!previous.includes(scope)))continue;db.query('UPDATE '+table+' SET scopes=? WHERE id=? AND clientId=? AND userId=? AND referenceId=?').run(JSON.stringify(next),row.id as string,client.clientId,owner,accountId);audit(client.clientId,accountId,table,row.id as string,previous,next);grants++;}
    }
   }
   return {status:skipped?'partial' as const:'synced' as const,clients,grants,skipped};
  }).immediate();
 });
}
