import { z } from 'zod';
import type { OwnerSecretStore } from '../storage/owner-store.js';
import type {SystemStatus} from './system-status.js';
import { setupPage,type AdminPresentation } from './page.js';
export interface TailscaleStatus { installed: boolean; authenticated: boolean; online: boolean; privateReachable: boolean }
export interface AppleCredential { user: string; appPassword: string }
export interface AdminModule {id:string;title:string;fields:readonly {id:string;label:string}[];capabilities():Record<string,boolean>;updateCapabilities(next:Record<string,boolean>,confirm:boolean):Promise<Record<string,boolean>>}
export interface AdminOptions {
 systemStatus?():Promise<SystemStatus>;
 evidence?(ownerId:string):import('./evidence.js').EvidenceRow[];
 modules?:readonly AdminModule[];
 privateOrigin: string;
 publicMcpUrl?: string;
 presentation?:AdminPresentation;
 pluginArchive?():Promise<Uint8Array>;
 updateCapabilities?(next:Record<string,boolean>,confirmEnable:boolean):Promise<Record<string,boolean>>;
 capabilities?(): Record<string,boolean>;
 store: OwnerSecretStore;
 ownerAuth: { ownerSession(headers: Headers): Promise<{user: {id: string}}>; enrollmentSession(headers: Headers): Promise<{user: {id: string}}> };
 diagnostics(): Promise<TailscaleStatus>;
 validateCredential(credential: AppleCredential): Promise<void>;
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
  if(!moduleMatch&&!Object.hasOwn(views,path)&&!['/icloud/admin/system-status','/icloud/admin/accounts/add','/icloud/setup','/icloud/admin','/icloud/setup/status','/icloud/setup/complete','/icloud/admin/credential','/icloud/admin/revoke','/icloud/admin/status','/icloud/admin/capabilities','/icloud/admin/plugin.zip'].includes(path))return json({error:'NOT_FOUND'},404);
  try {
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
    return json({prerequisites:status,ready:ready(status),enrolled,...setup});
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
    return new Response(setupPage({enrolled,ready:ready(status),admin:Object.hasOwn(views,path),view:views[path]??'setup',...(url.searchParams.get('mode')==='account'?{mode:'account' as const}:{}),publicMcpUrl:options.publicMcpUrl,pluginDownload:!!options.pluginArchive,presentation:options.presentation,modules:options.modules}),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"}});
   }
   if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   if(request.headers.get('origin')!==options.privateOrigin)return json({error:'ORIGIN_DENIED'},403);
   if(!(request.headers.get('content-type')?.split(';')[0]?.trim()==='application/json'))return json({error:'INVALID_INPUT'},400);
   if(path==='/icloud/setup/complete') {
    if(options.store.ownerId()!==null)return json({error:'ENROLLMENT_CLOSED'},409);
    if(!ready(await options.diagnostics()))return json({error:'PREREQUISITES_REQUIRED'},409);
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
    if(Object.entries(parsed.data.policy).some(([key,value])=>value&&!current[key as keyof typeof current])&&!parsed.data.confirmEnable)return json({error:'CONFIRMATION_REQUIRED'},409);
    return json({capabilities:await target.updateCapabilities(parsed.data.policy,parsed.data.confirmEnable)});
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
