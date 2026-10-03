import { z } from 'zod';
import type { OwnerSecretStore } from '../storage/owner-store.js';
import { setupPage } from './page.js';
export interface TailscaleStatus { installed: boolean; authenticated: boolean; online: boolean; privateReachable: boolean }
export interface AppleCredential { user: string; appPassword: string }
export interface AdminOptions {
 privateOrigin: string;
 publicMcpUrl?: string;
 pluginArchive?():Promise<Uint8Array>;
 updateCapabilities?(next:{read:boolean;write:boolean;send:boolean;unsubscribe:boolean},confirmEnable:boolean):Promise<{read:boolean;write:boolean;send:boolean;unsubscribe:boolean}>;
 capabilities?(): {read:boolean;write:boolean;send:boolean;unsubscribe:boolean};
 store: OwnerSecretStore;
 ownerAuth: { ownerSession(headers: Headers): Promise<{user: {id: string}}>; enrollmentSession(headers: Headers): Promise<{user: {id: string}}> };
 diagnostics(): Promise<TailscaleStatus>;
 validateCredential(credential: AppleCredential): Promise<void>;
 setupState?(request:Request):Promise<{bootstrapAuthorized:boolean;passkeyRegistered:boolean}>;
}
const credentialSchema = z.object({user:z.string().email().max(320),appPassword:z.string().min(1).max(256)}).strict();
const ready = (status:TailscaleStatus) => status.installed && status.authenticated && status.online && status.privateReachable;
const headers = { 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer' };
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
async function parseBody(request:Request):Promise<unknown> {
 const reader=request.body?.getReader();if(!reader)throw Error('Invalid body');
 const chunks:Uint8Array[]=[];let length=0;
 try {while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>8192){await reader.cancel();throw Error('Body too large');}chunks.push(item.value);}}
 finally {reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function createPrivateAdmin(options:AdminOptions) {
 return async function handle(request:Request):Promise<Response> {
  const path=new URL(request.url).pathname;
  if(!['/icloud/setup','/icloud/admin','/icloud/setup/status','/icloud/setup/complete','/icloud/admin/credential','/icloud/admin/revoke','/icloud/admin/status','/icloud/admin/capabilities','/icloud/admin/plugin.zip'].includes(path))return json({error:'NOT_FOUND'},404);
  try {
   if(request.method==='GET' && path==='/icloud/admin/plugin.zip'){
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.pluginArchive)return json({error:'NOT_AVAILABLE'},404);
    return new Response(Buffer.from(await options.pluginArchive()),{headers:{...headers,'content-type':'application/zip','content-disposition':'attachment; filename="icloud-plugin.zip"'}});
   }
   if(request.method==='GET' && path==='/icloud/admin/status') {
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    const secret=options.store.readSecret(session.user.id);
    const credentialStored=secret!==null;secret?.fill(0);
    return json({credentialStored,capabilities:options.capabilities?.()??null});
   }
   if(request.method==='GET' && path==='/icloud/setup/status') {
    const status=await options.diagnostics(),enrolled=options.store.ownerId()!==null;
    let passkeyRegistered=false;
    if(!enrolled)try{await options.ownerAuth.enrollmentSession(request.headers);passkeyRegistered=true;}catch{}
    const setup=options.setupState?await options.setupState(request):{bootstrapAuthorized:false,passkeyRegistered};
    return json({prerequisites:status,ready:ready(status),enrolled,...setup});
   }
   if(request.method==='GET' && (path==='/icloud/setup'||path==='/icloud/admin')) {
    const enrolled=options.store.ownerId()!==null;
    if(path==='/icloud/admin') {
     let session: {user: {id:string}};
     try { session=await options.ownerAuth.ownerSession(request.headers); }
     catch { return new Response(null,{status:303,headers:{...headers,location:'/icloud/sign-in'}}); }
     if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    }
    const status=await options.diagnostics();
    return new Response(setupPage({enrolled,ready:ready(status),admin:path==='/icloud/admin',publicMcpUrl:options.publicMcpUrl,pluginDownload:!!options.pluginArchive}),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"}});
   }
   if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   if(request.headers.get('origin')!==options.privateOrigin)return json({error:'ORIGIN_DENIED'},403);
   if(!(request.headers.get('content-type')?.split(';')[0]?.trim()==='application/json'))return json({error:'INVALID_INPUT'},400);
   if(path==='/icloud/setup/complete') {
    if(options.store.ownerId()!==null)return json({error:'ENROLLMENT_CLOSED'},409);
    if(!ready(await options.diagnostics()))return json({error:'PREREQUISITES_REQUIRED'},409);
    options.store.checkBootstrapProof(request.headers.get('x-bootstrap-proof')??'');
    const session=await options.ownerAuth.enrollmentSession(request.headers);
    const parsed=credentialSchema.safeParse(await parseBody(request));if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    try { await options.validateCredential(parsed.data); } catch { return json({error:'PROVIDER_VALIDATION_FAILED'},422); }
    options.store.enroll({proof:request.headers.get('x-bootstrap-proof')??'',ownerId:session.user.id,credential:Buffer.from(JSON.stringify(parsed.data))});
    return json({enrolled:true});
   }
   if(path==='/icloud/admin/capabilities') {
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.capabilities||!options.updateCapabilities)return json({error:'NOT_AVAILABLE'},409);
    const parsed=z.object({policy:z.object({read:z.boolean(),write:z.boolean(),send:z.boolean(),unsubscribe:z.boolean()}).strict(),confirmEnable:z.boolean()}).strict().safeParse(await parseBody(request));
    if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    const current=options.capabilities();
    if(Object.entries(parsed.data.policy).some(([key,value])=>value&&!current[key as keyof typeof current])&&!parsed.data.confirmEnable)return json({error:'CONFIRMATION_REQUIRED'},409);
    return json({capabilities:await options.updateCapabilities(parsed.data.policy,parsed.data.confirmEnable)});
   }
   if(path==='/icloud/admin/credential'||path==='/icloud/admin/revoke') {
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(path==='/icloud/admin/revoke') {
     const body=z.object({}).strict().safeParse(await parseBody(request));if(!body.success)return json({error:'INVALID_INPUT'},400);
     options.store.revokeSecret(session.user.id);return json({revoked:'local-provider-credential'});
    }
    const parsed=credentialSchema.safeParse(await parseBody(request));if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    try { await options.validateCredential(parsed.data); } catch { return json({error:'PROVIDER_VALIDATION_FAILED'},422); }
    options.store.rotateSecret(session.user.id,Buffer.from(JSON.stringify(parsed.data)));return json({updated:true});
   }
   return json({error:'NOT_FOUND'},404);
  } catch { return json({error:'ACCESS_OR_STATE_DENIED'},403); }
 };
}
