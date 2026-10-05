import type {Database} from 'bun:sqlite';
import {z} from 'zod';
import {createHash,randomBytes} from 'node:crypto';
// One queue per database, shared by local/remote owner components. In-flight issuance
// finishes before revocation; later issuance observes deleted grants and codes.
const mutationQueues=new WeakMap<Database,Promise<void>>();
export async function withOAuthMutation<T>(database:Database,operation:()=>Promise<T>):Promise<T>{
 const previous=mutationQueues.get(database)??Promise.resolve();
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const queued=previous.then(()=>gate);mutationQueues.set(database,queued);
 await previous;
 try{return await operation();}finally{release();if(mutationQueues.get(database)===queued)mutationQueues.delete(database);}
}
const managementInput=z.object({clientId:z.string().min(1).max(256),action:z.enum(['revoke','remove']),confirm:z.literal(true),confirmation:z.string().min(32).max(128)}).strict();
const input=z.object({clientId:z.string().min(1).max(256),additionalScopes:z.array(z.string().min(1).max(128)).min(1).max(32),confirm:z.literal(true)}).strict();
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
const scopes=(value:string|null,fallback:readonly string[])=>value===null?[...fallback]:z.array(z.string()).parse(JSON.parse(value));
type Client={clientId:string;name:string|null;userId:string|null;scopes:string|null;disabled?:number|null};
type Grant={id:string;clientId:string;userId:string;referenceId:string|null;scopes:string;expiresAt:string|number;createdAt:string|number;sessionId:string|null;revoked:string|number|null;refresh?:boolean;resources?:string|null};
const date=(value:string|number)=>typeof value==='number'?value:Date.parse(value);
const iso=(value:string|number)=>new Date(date(value)).toISOString();
/** Registration metadata and account-bound grants are intentionally separate. */
export function createClientRecovery(options:{database:Database;origin:string;origins?:readonly string[];resource?:string;declaredScopes:readonly string[];allowedScopes():readonly string[];
 validAccount?(owner:string,accountId:string):boolean;
 ownerSession(headers:Headers):Promise<{user:{id:string}}>;
 updateClient(headers:Headers,clientId:string,scopes:string[]):Promise<void>;
}){
 const db=options.database;
 db.exec('CREATE TABLE IF NOT EXISTS plugin_client_management_audit(id TEXT PRIMARY KEY,owner TEXT NOT NULL,clientId TEXT NOT NULL,action TEXT NOT NULL,occurredAt TEXT NOT NULL,accessCount INTEGER NOT NULL,refreshCount INTEGER NOT NULL,consentCount INTEGER NOT NULL,codeCount INTEGER NOT NULL)');
 const confirmations=new Map<string,{owner:string;clientId:string;action:string;digest:string;expires:number}>();
 return async(request:Request):Promise<Response>=>{
  const url=new URL(request.url),allowedOrigins=options.origins??[options.origin];
  if(!allowedOrigins.includes(url.origin)||(request.headers.has('host')&&request.headers.get('host')!==url.host)||(request.headers.get('origin')&&request.headers.get('origin')!==url.origin))return reply({error:'ORIGIN_DENIED'},403);
  let owner:string;try{owner=(await options.ownerSession(request.headers)).user.id;}catch{return reply({error:'OWNER_REQUIRED'},403);}
  const clients=()=>options.database.query<Client,[string,string,string,string,string]>(
   'SELECT clientId,name,userId,scopes,disabled FROM oauthClient WHERE userId=? OR (userId IS NULL AND clientId IN (SELECT clientId FROM oauthConsent WHERE userId=? UNION SELECT clientId FROM oauthAccessToken WHERE userId=? UNION SELECT clientId FROM oauthRefreshToken WHERE userId=? UNION SELECT clientId FROM plugin_client_management_audit WHERE owner=?)) ORDER BY clientId'
  ).all(owner,owner,owner,owner,owner);
  const records=(table:string,clientId:string)=>db.query('SELECT * FROM '+table+' WHERE userId=? AND clientId=? ORDER BY id').all(owner,clientId) as Record<string,unknown>[];
  const codes=(clientId:string)=>{const result:{id:string}[]=[];for(const row of db.query<{id:string;value:string},[]>('SELECT id,value FROM verification').all()){try{const value=JSON.parse(row.value);if(value.type==='authorization_code'&&value.userId===owner&&value.query?.client_id===clientId)result.push({id:row.id});}catch{/* Other verification formats are unrelated. */}}return result;};
  const impact=(clientId:string,action:string)=>{
   const client=clients().find(c=>c.clientId===clientId);if(!client)return;
   const access=records('oauthAccessToken',clientId),refresh=records('oauthRefreshToken',clientId),consents=records('oauthConsent',clientId),pending=codes(clientId);
   const foreign=['oauthAccessToken','oauthRefreshToken','oauthConsent'].some(table=>Boolean(db.query('SELECT id FROM '+table+' WHERE clientId=? AND (userId IS NULL OR userId<>?) LIMIT 1').get(clientId,owner)));
   const foreignCode=db.query<{value:string},[]>('SELECT value FROM verification').all().some(row=>{try{const value=JSON.parse(row.value);return value.type==='authorization_code'&&value.query?.client_id===clientId&&value.userId!==owner;}catch{return false;}});
   const removable=(client.userId===null||client.userId===owner)&&!foreign&&!foreignCode;
   const summary={clientId,name:client.name,action,accountIds:[...new Set([...access,...refresh,...consents].map(r=>r.referenceId).filter((v):v is string=>typeof v==='string'))],accessTokens:access.length,refreshTokens:refresh.length,consents:consents.length,authorizationCodes:pending.length,registrationRemoved:action==='remove',accountsPreserved:true as const,removable};
   const digest=createHash('sha256').update(JSON.stringify({client,access,refresh,consents,pending,removable})).digest('hex');
   return{summary,digest,pending};
  };
  if(request.method==='GET'){
   const action=url.searchParams.get('action'),clientId=url.searchParams.get('clientId');
   if(action||clientId){if(!clientId||!['revoke','remove'].includes(action??''))return reply({error:'INVALID_INPUT'},400);const current=impact(clientId,action!);if(!current)return reply({error:'CLIENT_NOT_FOUND'},404);if(action==='remove'&&!current.summary.removable)return reply({error:'SHARED_CLIENT_REGISTRATION',impact:current.summary},409);
    for(const [key,value] of confirmations)if(value.expires<=Date.now())confirmations.delete(key);
    if(confirmations.size>=128)return reply({error:'TOO_MANY_PENDING_CONFIRMATIONS'},429);
    const confirmation=randomBytes(32).toString('base64url');confirmations.set(confirmation,{owner,clientId,action:action!,digest:current.digest,expires:Date.now()+120000});return reply({impact:current.summary,confirmation});}
   const connections=[];
   for(const client of clients()){
    if(client.disabled)continue;
    const consents=records('oauthConsent',client.clientId),tokens=[...records('oauthAccessToken',client.clientId),...records('oauthRefreshToken',client.clientId).map(row=>({...row,refresh:true}))] as unknown as Grant[];
    const groups=new Map<string,{clientId:string;name:string|null;accountId:string;grantedScopes:string[];authorizedAt:string;expiresAt:string}>();
    for(const token of tokens){if(options.resource&&!scopes(token.resources??null,[]).includes(options.resource))continue;
     if(!token.referenceId||token.revoked||date(token.expiresAt)<=Date.now()||(options.validAccount&&!options.validAccount(owner,token.referenceId)))continue;
     // Provider refresh grants survive session expiry; access requires its existing session.
     if(!token.refresh&&(!token.sessionId||!db.query('SELECT id FROM session WHERE id=? AND userId=? AND expiresAt>?').get(token.sessionId,owner,Date.now())))continue;
     const consent=consents.find(c=>c.referenceId===token.referenceId);if(!consent)continue;
     const consentScopes=scopes(String(consent.scopes),[]),registered=scopes(client.scopes,options.declaredScopes),granted=scopes(token.scopes,[]).filter(scope=>consentScopes.includes(scope)&&registered.includes(scope)&&options.allowedScopes().includes(scope));
     if(!granted.some(scope=>scope.includes('.')))continue;
     const existing=groups.get(token.referenceId),expiresAt=iso(token.expiresAt),authorizedAt=iso(token.createdAt);
     if(existing){existing.grantedScopes=[...new Set([...existing.grantedScopes,...granted])];if(expiresAt>existing.expiresAt)existing.expiresAt=expiresAt;if(authorizedAt<existing.authorizedAt)existing.authorizedAt=authorizedAt;}
     else groups.set(token.referenceId,{clientId:client.clientId,name:client.name,accountId:token.referenceId,grantedScopes:granted,authorizedAt,expiresAt});
    }
    connections.push(...groups.values());
   }
   return reply({enabledScopes:options.allowedScopes(),connections,clients:clients().map(client=>{
    const registered=scopes(client.scopes,options.declaredScopes),missing=options.allowedScopes().filter(scope=>!registered.includes(scope));
    return{clientId:client.clientId,name:client.name,registeredScopes:registered,missingEnabledScopes:missing,recovery:missing.length?(client.userId===owner?'explicit_client_update_then_consent':'new_client_registration_then_consent'):'fresh_consent_and_tool_refresh'};
   }),existingGrantsChanged:false});
  }
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==url.origin)return reply({error:'ORIGIN_DENIED'},403);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'INVALID_INPUT'},400);
  const reader=request.body?.getReader();if(!reader)return reply({error:'INVALID_INPUT'},400);
  let text='';try{const chunks:Uint8Array[]=[];let length=0;while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>8192){await reader.cancel();return reply({error:'INVALID_INPUT'},400);}chunks.push(part.value);}text=Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}
  const body=await Promise.resolve().then(()=>JSON.parse(text)).catch(()=>null),management=managementInput.safeParse(body);
  if(management.success){
   const {clientId,action,confirmation}=management.data,saved=confirmations.get(confirmation);confirmations.delete(confirmation);
   if(!saved||saved.owner!==owner||saved.clientId!==clientId||saved.action!==action||saved.expires<=Date.now())return reply({error:'IMPACT_CONFIRMATION_REQUIRED'},409);
   try{
    const result=db.transaction(()=>{
     const current=impact(clientId,action);if(!current||current.digest!==saved.digest)throw Error('IMPACT_CHANGED');if(action==='remove'&&!current.summary.removable)throw Error('SHARED_CLIENT_REGISTRATION');
     // Delete access first because it can reference refresh. Token material never enters responses or audit.
     for(const table of ['oauthAccessToken','oauthRefreshToken','oauthConsent'])db.query('DELETE FROM '+table+' WHERE userId=? AND clientId=?').run(owner,clientId);
     for(const code of current.pending)db.query('DELETE FROM verification WHERE id=?').run(code.id);
     if(action==='remove')db.query('DELETE FROM oauthClient WHERE clientId=?').run(clientId);
     const i=current.summary;db.query('INSERT INTO plugin_client_management_audit VALUES(?,?,?,?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),owner,clientId,action,new Date().toISOString(),i.accessTokens,i.refreshTokens,i.consents,i.authorizationCodes);
     return i;
    }).immediate();
    return reply({completed:true,impact:result});
   }catch(error){return reply({error:error instanceof Error&&['IMPACT_CHANGED','SHARED_CLIENT_REGISTRATION'].includes(error.message)?error.message:'CLIENT_MANAGEMENT_FAILED'},409);}
  }
  const parsed=input.safeParse(body);
  if(!parsed.success)return reply({error:'EXPLICIT_SCOPE_CONFIRMATION_REQUIRED'},400);
  const {clientId,additionalScopes}=parsed.data,client=clients().find(c=>c.clientId===clientId);
  if(!client)return reply({error:'CLIENT_NOT_FOUND'},404);
  if(additionalScopes.some(scope=>!options.allowedScopes().includes(scope)))return reply({error:'CAPABILITY_DISABLED'},409);
  if(client.userId!==owner)return reply({error:'NEW_CLIENT_REGISTRATION_REQUIRED',existingGrantsChanged:false,instructions:'Keep the existing Mail connection. Register a new OAuth client through host connection setup with the required currently enabled capability scopes, select the same saved account, and explicitly consent. Reusing the old client ID cannot increase its scope ceiling.'},409);
  const merged=[...new Set([...scopes(client.scopes,options.declaredScopes),...additionalScopes])];
  try{await options.updateClient(request.headers,clientId,merged);}catch{return reply({error:'CLIENT_UPDATE_FAILED',existingGrantsChanged:false},409);}
  return reply({clientId,registeredScopes:merged,consentRequired:true,existingGrantsChanged:false});
 };
}
