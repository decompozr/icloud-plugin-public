import type {Database} from 'bun:sqlite';
import {z} from 'zod';
const input=z.object({clientId:z.string().min(1).max(256),additionalScopes:z.array(z.string().min(1).max(128)).min(1).max(32),confirm:z.literal(true)}).strict();
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
const scopes=(value:string|null,fallback:readonly string[])=>value===null?[...fallback]:z.array(z.string()).parse(JSON.parse(value));
/** Owner diagnostics and supported provider updates only. Never changes tokens or consent. */
export function createClientRecovery(options:{database:Database;origin:string;declaredScopes:readonly string[];allowedScopes():readonly string[];
 ownerSession(headers:Headers):Promise<{user:{id:string}}>;
 updateClient(headers:Headers,clientId:string,scopes:string[]):Promise<void>;
}){
 return async(request:Request):Promise<Response>=>{
  if(request.headers.get('origin')&&request.headers.get('origin')!==options.origin)return reply({error:'ORIGIN_DENIED'},403);
  let owner:string;try{owner=(await options.ownerSession(request.headers)).user.id;}catch{return reply({error:'OWNER_REQUIRED'},403);}
  const clients=()=>options.database.query<{clientId:string;name:string|null;userId:string|null;scopes:string|null},[string,string]>(
   'SELECT clientId,name,userId,scopes FROM oauthClient WHERE userId=? OR clientId IN (SELECT clientId FROM oauthConsent WHERE userId=?) ORDER BY clientId'
  ).all(owner,owner);
  if(request.method==='GET')return reply({enabledScopes:options.allowedScopes(),clients:clients().map(client=>{
   const registered=scopes(client.scopes,options.declaredScopes),missing=options.allowedScopes().filter(scope=>!registered.includes(scope));
   return{clientId:client.clientId,name:client.name,registeredScopes:registered,missingEnabledScopes:missing,recovery:missing.length?(client.userId===owner?'explicit_client_update_then_consent':'new_client_registration_then_consent'):'fresh_consent_and_tool_refresh'};
  }),existingGrantsChanged:false});
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==options.origin)return reply({error:'ORIGIN_DENIED'},403);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'INVALID_INPUT'},400);
  const reader=request.body?.getReader();if(!reader)return reply({error:'INVALID_INPUT'},400);
  let text='';try{const chunks:Uint8Array[]=[];let length=0;while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>8192){await reader.cancel();return reply({error:'INVALID_INPUT'},400);}chunks.push(part.value);}text=Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}
  const parsed=input.safeParse(await Promise.resolve().then(()=>JSON.parse(text)).catch(()=>null));
  if(!parsed.success)return reply({error:'EXPLICIT_SCOPE_CONFIRMATION_REQUIRED'},400);
  const {clientId,additionalScopes}=parsed.data,client=clients().find(c=>c.clientId===clientId);
  if(!client)return reply({error:'CLIENT_NOT_FOUND'},404);
  if(additionalScopes.some(scope=>!options.allowedScopes().includes(scope)))return reply({error:'CAPABILITY_DISABLED'},409);
  if(client.userId!==owner)return reply({error:'NEW_CLIENT_REGISTRATION_REQUIRED',existingGrantsChanged:false,instructions:'Keep the existing Mail connection. Register a new OAuth client through host connection setup with required Mail and Calendar scopes, select the same saved account, and explicitly consent. Reusing the old client ID cannot increase its scope ceiling.'},409);
  const merged=[...new Set([...scopes(client.scopes,options.declaredScopes),...additionalScopes])];
  try{await options.updateClient(request.headers,clientId,merged);}catch{return reply({error:'CLIENT_UPDATE_FAILED',existingGrantsChanged:false},409);}
  return reply({clientId,registeredScopes:merged,consentRequired:true,existingGrantsChanged:false});
 };
}
