import { z } from 'zod';
interface PhotosCloudAdmin {status(accountId?:string):Promise<unknown>;setup():Promise<unknown>;action(input:{action:'login'|'verify'|'send_code'|'recheck'|'revoke';accountId:string;password?:string;code?:string;confirm?:true}):Promise<unknown>;}

import type { OwnerSecretStore } from '@decompozr/account/server';
import type {SystemStatus} from './system-status.js';
import { setupPage,type AdminPresentation } from './page.js';
export interface TailscaleStatus { installed: boolean; authenticated: boolean; online: boolean; privateReachable: boolean }
export interface AppleCredential { user: string; appPassword: string }
export interface AdminModule {id:string;title:string;fields:readonly {id:string;label:string;available?:boolean}[];capabilities():Record<string,boolean>;updateCapabilities(next:Record<string,boolean>,confirm:boolean):Promise<Record<string,boolean>>}
export interface AdminOptions {
 homekit?:{status():Promise<unknown>;enroll(input:unknown):Promise<unknown>;revoke(input:unknown):Promise<unknown>};
 photosCloud?:PhotosCloudAdmin;
 resetRuntime?:(mode:'connections'|'factory')=>string;
 resetStatus?:(id:string)=>{mode:'connections'|'factory';phase:string}|null;
 renderPage?(request:Request,state:Parameters<typeof setupPage>[0]):Promise<Response>;
 systemStatus?():Promise<SystemStatus>;
 evidence?(ownerId:string):import('./evidence.js').EvidenceRow[];
 modules?:readonly AdminModule[];
 privateOrigin: string;
 photosSetup?:{status():Promise<unknown>;action(action:'photos'|'files'|'automation'|'authorize'):Promise<unknown>};
 publicMcpUrl?: string;
 presentation?:AdminPresentation;
 pluginArchive?():Promise<Uint8Array>;
 updateCapabilities?(next:Record<string,boolean>,confirmEnable:boolean):Promise<Record<string,boolean>>;
 capabilities?(): Record<string,boolean>;
 store: OwnerSecretStore;
 ownerAuth: { synchronizeCapabilities?():Promise<void>; ownerSession(headers: Headers): Promise<{user: {id: string}}>; enrollmentSession(headers: Headers): Promise<{user: {id: string}}> };
 diagnostics(): Promise<TailscaleStatus>;
 validateCredential(credential: AppleCredential): Promise<void>;
 setupReady?:boolean;
 localOwner?:boolean;
 connectionCommands?:readonly string[];
 setupState?(request:Request):Promise<{bootstrapAuthorized:boolean;passkeyRegistered:boolean}>;
}
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
 // Include local revocations of already-revoked accounts: their persisted
 // credential generation is undefined before and after removal.
 const credentialMutations=new Map<string,number>();
 const mutationKey=(owner:string,account:string)=>JSON.stringify([owner,account]);
 const noteMutation=(key:string)=>credentialMutations.set(key,(credentialMutations.get(key)??0)+1);
 return async function handle(request:Request):Promise<Response> {
  const url=new URL(request.url),path=url.pathname;
  const views:Record<string,'overview'|'accounts'|'connections'|'system'>={'/':'overview','/icloud/admin':'overview','/icloud/admin/accounts':'accounts','/icloud/admin/connections':'connections','/icloud/admin/system':'system'};
  const moduleMatch=/^\/icloud\/admin\/modules\/([a-z]+)\/capabilities$/.exec(path);
  const homekitAction=/^\/icloud\/admin\/homekit\/(status|enroll|revoke)$/.exec(path)?.[1];
  const cloudAction=/^\/icloud\/admin\/photos\/cloud\/(status|setup|login|verify|send-code|recheck|revoke)$/.exec(path)?.[1];
  if(!homekitAction&&!cloudAction&&!moduleMatch&&!Object.hasOwn(views,path)&&!['/icloud/admin/reset','/icloud/admin/reset/status','/icloud/admin/system-status','/icloud/admin/accounts/add','/icloud/setup','/icloud/admin','/icloud/setup/status','/icloud/setup/complete','/icloud/admin/credential','/icloud/admin/revoke','/icloud/admin/status','/icloud/admin/capabilities','/icloud/admin/plugin.zip','/icloud/admin/photos/status','/icloud/admin/photos/action'].includes(path))return json({error:'NOT_FOUND'},404);
  try {
   if(path==='/icloud/admin/reset/status'){
    if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
    const value=options.resetStatus?.(url.searchParams.get('id')??'');return value?json(value):json({error:'NOT_FOUND'},404);
   }
   if(homekitAction){
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.homekit)return json({error:'NOT_AVAILABLE'},404);
    if(homekitAction==='status'&&request.method==='GET')return json(await options.homekit.status());
    if(homekitAction==='status'||request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
    if(request.headers.get('origin')!==options.privateOrigin)return json({error:'ORIGIN_DENIED'},403);
    if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return json({error:'INVALID_INPUT'},400);
    const input=await parseBody(request);
    return json(await (homekitAction==='enroll'?options.homekit.enroll(input):options.homekit.revoke(input)));
   }
   if(cloudAction){
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.photosCloud)return json({error:'NOT_AVAILABLE'},404);
    try{
     if(cloudAction==='status'&&request.method==='GET'){
      const id=url.searchParams.get('accountId');if(id&&!z.string().uuid().safeParse(id).success)return json({error:'INVALID_INPUT'},400);
      return json(await options.photosCloud.status(id??undefined));
     }
     if(cloudAction==='status'||request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
     if(request.headers.get('origin')!==options.privateOrigin)return json({error:'ORIGIN_DENIED'},403);
     if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return json({error:'INVALID_INPUT'},400);
     const schemas={setup:z.object({}).strict(),login:z.object({accountId:z.string().uuid(),password:z.string().min(1).max(1024)}).strict(),verify:z.object({accountId:z.string().uuid(),code:z.string().regex(/^[0-9]{6}$/)}).strict(),'send-code':z.object({accountId:z.string().uuid()}).strict(),recheck:z.object({accountId:z.string().uuid()}).strict(),revoke:z.object({accountId:z.string().uuid(),confirm:z.literal(true)}).strict()};
     const parsed=schemas[cloudAction as keyof typeof schemas].safeParse(await parseBody(request));if(!parsed.success)return json({error:'INVALID_INPUT'},400);
     if(cloudAction==='setup')return json(await options.photosCloud.setup());
     return json(await options.photosCloud.action({...parsed.data as {accountId:string},action:cloudAction==='send-code'?'send_code':cloudAction as 'login'|'verify'|'recheck'|'revoke'}));
    }catch(e){return json({error:e instanceof Error && e.constructor.name==='PhotosError' && 'code' in e && typeof e.code==='string'?e.code:'cloud_setup_failed'},409);}
   }
   if(path.startsWith('/icloud/admin/photos/')){
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.photosSetup)return json({error:'NOT_AVAILABLE'},404);
    if(path.endsWith('/status')&&request.method==='GET')return json(await options.photosSetup.status());
    if(path.endsWith('/action')&&request.method==='POST'){
     if(request.headers.get('origin')!==options.privateOrigin)return json({error:'ORIGIN_DENIED'},403);
     if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return json({error:'INVALID_INPUT'},400);
     const body=z.object({action:z.enum(['photos','files','automation','authorize'])}).strict().safeParse(await parseBody(request));
     if(!body.success)return json({error:'INVALID_INPUT'},400);
     return json(await options.photosSetup.action(body.data.action));
    }
    return json({error:'METHOD_NOT_ALLOWED'},405);
   }
   if(request.method==='GET' && path==='/icloud/admin/plugin.zip'){
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.pluginArchive)return json({error:'NOT_AVAILABLE'},404);
    return new Response(Buffer.from(await options.pluginArchive()),{headers:{...headers,'content-type':'application/zip','content-disposition':'attachment; filename="icloud-plugin.zip"'}});
   }
   if(request.method==='GET' && path==='/icloud/admin/system-status'){
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.systemStatus)return json({error:'NOT_AVAILABLE'},404);
    return json(await options.systemStatus());
   }
   if(request.method==='GET' && path==='/icloud/admin/status') {
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    return json({accounts:options.store.listAccounts(session.user.id),evidence:options.evidence?.(session.user.id)??[],capabilities:options.capabilities?.()??null,modules:Object.fromEntries((options.modules??[]).map(module=>[module.id,module.capabilities()]))});
   }
   if(request.method==='GET' && path==='/icloud/setup/status') {
    const status=await options.diagnostics(),enrolled=options.store.ownerId()!==null;
    let passkeyRegistered=false;
    if(!enrolled)try{await options.ownerAuth.enrollmentSession(request.headers);passkeyRegistered=true;}catch{}
    const setup=options.setupState?await options.setupState(request):{bootstrapAuthorized:false,passkeyRegistered};
    return json({prerequisites:status,ready:options.setupReady??ready(status),enrolled,...setup});
   }
   if(request.method==='GET' && (path==='/icloud/setup'||Object.hasOwn(views,path))) {
    const enrolled=options.store.ownerId()!==null;
    // Owner cookies remain scoped to /icloud. Enter that protected namespace
    // before authenticating so root navigation works without broadening cookies.
    if(path==='/')return new Response(null,{status:303,headers:{...headers,location:enrolled?'/icloud/admin':'/icloud/setup'}});
    if(enrolled||Object.hasOwn(views,path)) {
     let session: {user: {id:string}};
     try { session=await options.ownerAuth.ownerSession(request.headers); }
     catch { return new Response(null,{status:303,headers:{...headers,location:'/icloud/sign-in'}}); }
     if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    }
    const status=await options.diagnostics();
    const state:Parameters<typeof setupPage>[0]={homekitConfigured:!!options.homekit,resetAvailable:!!options.resetRuntime,photosCloudConfigured:!!options.photosCloud,photosConfigured:!!options.photosSetup,enrolled,ready:options.setupReady??ready(status),admin:Object.hasOwn(views,path),view:views[path]??'setup',...(url.searchParams.get('mode')==='account'?{mode:'account' as const}:{}),publicMcpUrl:options.publicMcpUrl,pluginDownload:!!options.pluginArchive,localOwner:options.localOwner,connectionCommands:options.connectionCommands,presentation:options.presentation,modules:options.modules};
    if(options.renderPage)return options.renderPage(request,state);
    return new Response(setupPage(state),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"}});
   }
   if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   if(request.headers.get('origin')!==options.privateOrigin)return json({error:'ORIGIN_DENIED'},403);
   if(!(request.headers.get('content-type')?.split(';')[0]?.trim()==='application/json'))return json({error:'INVALID_INPUT'},400);
   if(path==='/icloud/admin/reset'){
    const session=await options.ownerAuth.ownerSession(request.headers);if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!options.resetRuntime)return json({error:'NOT_AVAILABLE'},409);
    const parsed=z.object({mode:z.enum(['connections','factory']),confirmation:z.string(),confirm:z.literal(true)}).strict().safeParse(await parseBody(request));
    if(!parsed.success||parsed.data.confirmation!==(parsed.data.mode==='factory'?'RESET ALL':'RESET CONNECTIONS'))return json({error:'RESET_CONFIRMATION_REQUIRED'},400);
    try{return json({id:options.resetRuntime(parsed.data.mode),phase:'queued'},202);}catch{return json({error:'RESET_BUSY'},409);}
   }
   if(path==='/icloud/setup/complete') {
    if(options.store.ownerId()!==null)return json({error:'ENROLLMENT_CLOSED'},409);
    if(!(options.setupReady??ready(await options.diagnostics())))return json({error:'PREREQUISITES_REQUIRED'},409);
    options.store.checkBootstrapProof(request.headers.get('x-bootstrap-proof')??'');
    const session=await options.ownerAuth.enrollmentSession(request.headers);
    const parsed=z.object({}).strict().safeParse(await parseBody(request));if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    options.store.enroll({proof:request.headers.get('x-bootstrap-proof')??'',ownerId:session.user.id});
    return json({enrolled:true});
   }
   if(path==='/icloud/admin/accounts/add') {
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    const parsed=z.object({user:z.string().trim().email().max(254),label:z.string().trim().max(100).optional(),appPassword:z.string().min(1).max(256)}).strict().safeParse(await parseBody(request));
    if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    const user=parsed.data.user.toLowerCase();
    const exists=()=>options.store.listAccounts(session.user.id).some(account=>account.user.toLowerCase()===user);
    // Existing or revoked accounts are maintained through the generation-guarded
    // credential endpoint. Never resurrect them via the add-account wizard.
    if(exists())return json({error:'ACCOUNT_EXISTS'},409);
    const credential={user,appPassword:parsed.data.appPassword};
    try{await options.validateCredential(credential);}catch{return json({error:'PROVIDER_VALIDATION_FAILED'},422);}
    if(options.store.ownerId()!==session.user.id)return json({error:'OWNER_REQUIRED'},403);
    if(exists())return json({error:'ACCOUNT_EXISTS'},409);
    const bytes=Buffer.from(JSON.stringify(credential));
    try{return json({account:options.store.addAccount(session.user.id,{user,label:parsed.data.label,credential:bytes})},201);}finally{bytes.fill(0);}
   }
   if(path==='/icloud/admin/capabilities'||moduleMatch) {
    const target=moduleMatch?options.modules?.find(module=>module.id===moduleMatch[1]):options;
    if(!target)return json({error:'NOT_AVAILABLE'},404);
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(!target.capabilities||!target.updateCapabilities)return json({error:'NOT_AVAILABLE'},409);
    const parsed=z.object({policy:z.record(z.string(),z.boolean()),confirmEnable:z.boolean()}).strict().safeParse(await parseBody(request));
    if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    const current=target.capabilities();
    if(Object.keys(parsed.data.policy).length!==Object.keys(current).length||Object.keys(parsed.data.policy).some(key=>!Object.hasOwn(current,key)))return json({error:'INVALID_INPUT'},400);
    const enabling=Object.entries(parsed.data.policy).some(([key,value])=>value&&!current[key as keyof typeof current]);
    if(enabling&&!parsed.data.confirmEnable)return json({error:'CONFIRMATION_REQUIRED'},409);
    if(enabling&&(moduleMatch?.[1]!=='photos')&&!options.store.listAccounts(session.user.id).some(account=>account.credentialStored))return json({error:'CREDENTIAL_REQUIRED'},409);
    if(enabling&&moduleMatch?.[1]==='photos'){
     if(!options.photosSetup)return json({error:'PHOTOS_PERMISSIONS_REQUIRED'},409);
     const permission=await options.photosSetup.status();
     if(typeof permission!=='object'||permission===null||!('ready'in permission)||permission.ready!==true)return json({error:'PHOTOS_PERMISSIONS_REQUIRED'},409);
    }
    try{const capabilities=await target.updateCapabilities(parsed.data.policy,parsed.data.confirmEnable);await options.ownerAuth.synchronizeCapabilities?.();return json({capabilities});}catch(error){if(error instanceof Error&&'code' in error&&error.code==='configured_capability_disabled')return json({error:'CONFIGURED_CAPABILITY_DISABLED'},409);throw error;}
   }
   if(path==='/icloud/admin/credential'||path==='/icloud/admin/revoke') {
    const session=await options.ownerAuth.ownerSession(request.headers);
    if(session.user.id!==options.store.ownerId())return json({error:'OWNER_REQUIRED'},403);
    if(path==='/icloud/admin/revoke') {
     const body=z.object({accountId:z.string().min(1)}).strict().safeParse(await parseBody(request));if(!body.success)return json({error:'INVALID_INPUT'},400);
     options.store.revokeAccountSecret(session.user.id,body.data.accountId);noteMutation(mutationKey(session.user.id,body.data.accountId));return json({revoked:'local-provider-credential'});
    }
    const parsed=z.object({accountId:z.string().min(1),appPassword:z.string().min(1).max(256)}).strict().safeParse(await parseBody(request));if(!parsed.success)return json({error:'INVALID_INPUT'},400);
    const account=options.store.listAccounts(session.user.id).find(item=>item.id===parsed.data.accountId);if(!account)return json({error:'ACCOUNT_NOT_FOUND'},404);
    if(!options.store.accountGeneration)return json({error:'CREDENTIAL_STATE_UNAVAILABLE'},409);
    const generation=options.store.accountGeneration(session.user.id,account.id),key=mutationKey(session.user.id,account.id),mutation=credentialMutations.get(key)??0;
    const credential={user:account.user,appPassword:parsed.data.appPassword};
    try { await options.validateCredential(credential); } catch { return json({error:'PROVIDER_VALIDATION_FAILED'},422); }
    if(options.store.ownerId()!==session.user.id||options.store.accountGeneration(session.user.id,account.id)!==generation||(credentialMutations.get(key)??0)!==mutation)return json({error:'CREDENTIAL_STATE_CHANGED'},409);
    const bytes=Buffer.from(JSON.stringify(credential));
    try{options.store.rotateAccountSecret(session.user.id,account.id,bytes);noteMutation(key);}finally{bytes.fill(0);}
    return json({updated:true});
   }
   return json({error:'NOT_FOUND'},404);
  } catch { return json({error:'ACCESS_OR_STATE_DENIED'},403); }
 };
}
