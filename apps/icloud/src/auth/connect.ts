import type { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import type { OwnerSecretStore } from '../storage/owner-store.js';
import { z } from 'zod';

export type AccountStore = Pick<OwnerSecretStore, 'listAccounts' | 'account' | 'legacyAccountId' | 'addAccount'>;
const querySchema=z.string().min(1).max(16384);
const bodySchema=z.object({oauth_query:querySchema});
const selectSchema=bodySchema.extend({accountId:z.string().min(1).max(256)}).strict();
const addSchema=bodySchema.extend({user:z.string().email().max(320),appPassword:z.string().min(1).max(256),label:z.string().trim().min(1).max(120).optional()}).strict();
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});

/** Each signed stage is immutable; a consent query gets its own persisted account snapshot. */
export function authorizationKey(query:string):string {
 const params=new URLSearchParams(query);
 const entries=[...params].sort(([a,b],[c,d])=>a<c?-1:a>c?1:b<d?-1:b>d?1:0);
 return createHash('sha256').update(new URLSearchParams(entries).toString()).digest('hex');
}
export function createAccountConnection(options:{database:Database;secret:string;origin:string;store:AccountStore;ownerSession(headers:Headers):Promise<{user:{id:string};session:{id:string}}>;
 validateCredential(credential:{user:string;appPassword:string}):Promise<void>;
 continueAuthorization(request:Request,query:string,accountId:string):Promise<Response>;
}) {
 const db=options.database;
 const validationAttempts=new Map<string,{start:number;count:number;active:number}>();
 db.exec('CREATE TABLE IF NOT EXISTS plugin_account_selection (request TEXT NOT NULL, owner TEXT NOT NULL, session TEXT NOT NULL, account TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(request,owner,session))');
 async function signed(query:string){querySchema.parse(query);if(!await verifyOAuthQueryParams(query,options.secret))throw Error('INVALID_AUTHORIZATION');return new URLSearchParams(query);}
 function selected(query:string,owner:string,session:string){
  const row=db.query<{account:string},[string,string,string,number]>('SELECT account FROM plugin_account_selection WHERE request=? AND owner=? AND session=? AND expires>? AND consumed=0').get(authorizationKey(query),owner,session,Date.now());
  if(!row)return undefined;
  try{const account=options.store.account(owner,row.account);return account.credentialStored?account:undefined;}catch{return undefined;}
 }
 function consume(query:string,owner:string,session:string){return db.query('UPDATE plugin_account_selection SET consumed=1 WHERE request=? AND owner=? AND session=? AND consumed=0').run(authorizationKey(query),owner,session).changes===1;}
 function cancel(query:string,owner:string,session:string){
  db.query('INSERT OR IGNORE INTO plugin_account_selection(request,owner,session,account,expires,consumed) VALUES(?,?,?,?,?,1)').run(authorizationKey(query),owner,session,'',Number(new URLSearchParams(query).get('exp'))*1000);
  consume(query,owner,session);
 }
 async function handle(request:Request):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(!['/icloud/connect/status','/icloud/connect/select','/icloud/connect/add'].includes(path))return json({error:'NOT_FOUND'},404);
  if(request.headers.get('origin')&&request.headers.get('origin')!==options.origin)return json({error:'ORIGIN_DENIED'},403);
  const read=request.method==='GET'&&path.endsWith('/status');
  if(!read&&(request.method!=='POST'||request.headers.get('origin')!==options.origin||!request.headers.get('content-type')?.startsWith('application/json')))return json({error:'ORIGIN_DENIED'},403);
  let session:Awaited<ReturnType<typeof options.ownerSession>>;
  try{session=await options.ownerSession(request.headers);}catch{return json({error:'OWNER_REQUIRED'},401);}
  try{
   const raw=read?{oauth_query:url.searchParams.get('oauth_query')}:await boundedBody(request);
   const {oauth_query}=bodySchema.parse(raw),params=await signed(oauth_query);
   const cleared=params.get('ba_pl');
   if(cleared&&cleared!==session.session.id)return json({error:'INVALID_AUTHORIZATION'},403);
   if(read){
    const chosen=cleared?selected(oauth_query,session.user.id,session.session.id):undefined;
    if(cleared&&!chosen)return json({error:'ACCOUNT_SELECTION_REQUIRED'},403);
    return json({accounts:options.store.listAccounts(session.user.id),...(chosen?{selectedAccount:chosen}:{})});
   }
   // Consent-stage queries cannot be used to switch accounts underneath displayed consent.
   if(cleared)return json({error:'INVALID_AUTHORIZATION'},403);
   if(selected(oauth_query,session.user.id,session.session.id))return json({error:'ACCOUNT_ALREADY_SELECTED'},409);
   let account;
   if(path.endsWith('/add')){
    const value=addSchema.parse(raw),credential={user:value.user,appPassword:value.appPassword};
    if(options.store.listAccounts(session.user.id).some(a=>a.credentialStored&&a.user.trim().toLowerCase()===value.user.trim().toLowerCase()))return json({error:'ACCOUNT_EXISTS'},409);
    let limit=validationAttempts.get(session.user.id);
    if(!limit||Date.now()-limit.start>=600000){limit={start:Date.now(),count:0,active:0};validationAttempts.set(session.user.id,limit);}
    if(limit.count>=10||limit.active>=2)return json({error:'RATE_LIMITED'},429);
    limit.count++;limit.active++;
    try{await options.validateCredential(credential);}catch{return json({error:'PROVIDER_VALIDATION_FAILED'},422);}finally{limit.active--;}
    const bytes=Buffer.from(JSON.stringify(credential));
    try{account=options.store.addAccount(session.user.id,{user:value.user,label:value.label,credential:bytes});}finally{bytes.fill(0);}
   }else{const value=selectSchema.parse(raw);account=options.store.account(session.user.id,value.accountId);}
   if(!account.credentialStored)return json({error:'CREDENTIAL_REQUIRED'},409);
   db.query('DELETE FROM plugin_account_selection WHERE expires<=?').run(Date.now());
   const claimed=db.query('INSERT OR IGNORE INTO plugin_account_selection(request,owner,session,account,expires,consumed) VALUES(?,?,?,?,?,0)').run(authorizationKey(oauth_query),session.user.id,session.session.id,account.id,Number(params.get('exp'))*1000);
   if(claimed.changes!==1)return json({error:'ACCOUNT_ALREADY_SELECTED'},409);
   let response:Response;
   try{
    response=await options.continueAuthorization(request,oauth_query,account.id);
    if(!response.ok)return json({error:'CONNECT_RESTART_REQUIRED'},409);
    const result=z.object({url:z.string()}).parse(await response.clone().json());
    const destination=new URL(result.url,options.origin);
    if(destination.origin!==options.origin||destination.pathname!=='/icloud/consent')throw Error('Consent required');
    const consentQuery=destination.search.slice(1),consentParams=await signed(consentQuery);
    if(consentParams.get('ba_pl')!==session.session.id)throw Error('Session binding required');
    const consentClaim=db.query('INSERT OR IGNORE INTO plugin_account_selection(request,owner,session,account,expires,consumed) VALUES(?,?,?,?,?,0)').run(authorizationKey(consentQuery),session.user.id,session.session.id,account.id,Math.min(Number(params.get('exp')),Number(consentParams.get('exp')))*1000);
    if(consentClaim.changes!==1)throw Error('Consent already issued');
   }catch{return json({error:'CONNECT_RESTART_REQUIRED'},409);}
   return response;
  }catch(error){return json({error:error instanceof Error&&error.message==='INVALID_AUTHORIZATION'?'INVALID_AUTHORIZATION':'INVALID_ACCOUNT_REQUEST'},400);}
 }
 return{handle,selected,consume,cancel,signed};
}

async function boundedBody(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw Error('Body required');
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>24576){await reader.cancel();throw Error('Body too large');}chunks.push(item.value);}}
 finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
