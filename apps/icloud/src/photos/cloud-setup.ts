import {mkdir,lstat,rmdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import type {OwnerSecretStore,ProviderSessionCustody} from '../storage/owner-store.js';
import {PhotosError} from './contracts.js';
import {runProcess} from './provider.js';
import {SHARED_READ_TIMEOUT_MS,SHARED_WRITE_TIMEOUT_MS,sharedStreamURL,type SharedStreamSession} from './shared-stream-protocol.js';
import {verificationMethod} from './cloud-verification.js';

const actorResult=z.object({phase:z.enum(['awaiting_2fa','authenticated','verification_failed','delivery_failed','unsupported_authentication','authentication_required']),privateState:z.record(z.unknown()).optional(),sharedServiceAdvertised:z.boolean().optional(),dsid:z.string().optional(),serviceOrigin:z.string().nullable().optional()}).strict();
const savedSession=z.object({schemaVersion:z.literal(1),username:z.string(),phase:z.enum(['awaiting_2fa','authenticated']),pendingExpiresAt:z.number(),privateState:z.record(z.unknown()),sharedServiceAdvertised:z.boolean(),dsid:z.string().optional(),serviceOrigin:z.string().nullable().optional()}).strict();
type SavedSession=z.infer<typeof savedSession>;
type Actor=(input:unknown)=>Promise<unknown>;
type SessionStore=OwnerSecretStore&ProviderSessionCustody;
export interface PhotosCloudAdmin {
 status(accountId?:string):Promise<unknown>;
 setup():Promise<unknown>;
 action(input:{action:'login'|'verify'|'send_code'|'recheck'|'revoke';accountId:string;password?:string;code?:string;confirm?:true}):Promise<unknown>;
}
export function supportsProviderSessions(store:OwnerSecretStore):store is SessionStore {
 return ['providerSessionState','readProviderSession','replaceProviderSession','revokeProviderSession'].every(key=>typeof (store as any)[key]==='function');
}

/** Private owner setup only. Does not grant OAuth or execute any photo write. */
export class PhotosCloudSetup implements PhotosCloudAdmin {
 private actor:Actor;
 constructor(private options:{store:SessionStore;owner:()=>string;python:string;runtimeDirectory:string;customPython?:boolean;actor?:Actor;requestActor?:Actor;prepareRuntime?:()=>Promise<void>}){
  const directory=dirname(fileURLToPath(import.meta.url));
  const script=join(existsSync(join(directory,'cloud-session.py'))?directory:join(directory,'photos'),'cloud-session.py');
  this.actor=options.actor??(input=>runProcess([options.python,script],input,60000));
 }
 private account(accountId:string){const owner=this.options.owner();const account=this.options.store.account(owner,accountId);return {owner,account,username:account.user.trim().toLowerCase()};}
 private load(owner:string,accountId:string,username:string):SavedSession|null {
  const stored=this.options.store.readProviderSession(owner,accountId,'photos_web');if(!stored)return null;
  try{const parsed=savedSession.parse(JSON.parse(Buffer.from(stored.bytes).toString()));if(parsed.username!==username)throw new PhotosError('cloud_session_identity_mismatch');return parsed;}
  finally{stored.bytes.fill(0);}
 }
 private async dependency(){try{return z.object({dependencyReady:z.boolean()}).parse(await this.actor({action:'check'})).dependencyReady;}catch{return false;}}
 /** Server-only transport. Never expose session/cookies through MCP results. */
 sharedSession(accountId:string):SharedStreamSession&{generation:number;accountRevision:number}{
  const {owner,username}=this.account(accountId),expected=this.options.store.providerSessionState(owner,accountId,'photos_web');
  const saved=this.load(owner,accountId,username);
  if(!saved||saved.phase!=='authenticated')throw new PhotosError('cloud_login_required');
  if(!saved.sharedServiceAdvertised||!saved.dsid||!saved.serviceOrigin)throw new PhotosError('shared_album_service_unavailable');
  const unchanged=()=>{
   if(this.options.owner()!==owner)throw new PhotosError('owner_changed');
   const now=this.options.store.providerSessionState(owner,accountId,'photos_web');
   if(now.accountRevision!==expected.accountRevision||now.generation!==expected.generation)throw new PhotosError('cloud_session_changed');
  };
  const session:SharedStreamSession&{generation:number;accountRevision:number}={accountId,protocol:'legacy_shared_streams',dsid:saved.dsid,serviceOrigin:saved.serviceOrigin,generation:expected.generation,accountRevision:expected.accountRevision,request:async(url,init)=>{
   unchanged();if(init.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||init.signal?.aborted)throw new PhotosError('invalid_shared_album_request');
   const endpoint=new URL(url).pathname.split('/').at(-1)!;
   if(url!==sharedStreamURL(session,accountId,endpoint))throw new PhotosError('invalid_shared_album_request');
   const directory=dirname(fileURLToPath(import.meta.url));
   const script=join(existsSync(join(directory,'shared-stream-request.py'))?directory:join(directory,'photos'),'shared-stream-request.py');
   const input={username,state:saved.privateState,dsid:saved.dsid,serviceOrigin:saved.serviceOrigin,endpoint,body:init.body,...(endpoint.startsWith('webget')?{transport:'system_http2'}:{})};
   const deadline=endpoint.startsWith('webget')?SHARED_READ_TIMEOUT_MS:SHARED_WRITE_TIMEOUT_MS;
   const result=z.object({status:z.number().int().min(200).max(599),body:z.string().max(1024*1024),httpVersion:z.enum(['1.0','1.1','2','3']).optional()}).strict().parse(await (this.options.requestActor?this.options.requestActor(input):runProcess([this.options.python,script],input,deadline,init.signal??undefined)));
   // A revocation during dispatch may follow an actual server write: callers
   // retain unknown outcomes rather than treating it as a safe retry.
   unchanged();return new Response([204,205,304].includes(result.status)?null:result.body,{status:result.status,...(result.httpVersion?{headers:{'x-photos-transport-http-version':result.httpVersion}}:{})});
  }};
  session.webAccessState=async()=>{
   unchanged();
   const directory=dirname(fileURLToPath(import.meta.url));
   const script=join(existsSync(join(directory,'shared-stream-request.py'))?directory:join(directory,'photos'),'shared-stream-request.py');
   const input={username,state:saved.privateState,dsid:saved.dsid,serviceOrigin:saved.serviceOrigin,endpoint:'requestWebAccessState',body:'{}',transport:'system_http2'};
   const raw=await (this.options.requestActor?this.options.requestActor(input):runProcess([this.options.python,script],input,SHARED_READ_TIMEOUT_MS));
   unchanged();
   const result=z.object({status:z.number().int(),body:z.string().max(1024*1024)}).parse(raw);
   if(result.status!==200)throw new PhotosError('photos_web_access_read_failed');
   const body=z.record(z.unknown()).parse(JSON.parse(result.body));
   return {isICDRSDisabled:typeof body.isICDRSDisabled==='boolean'?body.isICDRSDisabled:null,isDeviceConsentedForPCS:typeof body.isDeviceConsentedForPCS==='boolean'?body.isDeviceConsentedForPCS:null};
  };
  sharedStreamURL(session,accountId,'webgetalbumslist');return session;
 }
 async status(accountId?:string){
  const owner=this.options.owner(),dependencyReady=await this.dependency();
  if(this.options.owner()!==owner)throw new PhotosError('owner_changed');
  if(!accountId)return {dependencyReady,setupAvailable:!this.options.customPython,managementReady:false,changesPerformed:false};
  const {username}=this.account(accountId),saved=this.load(owner,accountId,username);
  return {accountId,dependencyReady,setupAvailable:!this.options.customPython,phase:!saved?'not_connected':saved.phase==='awaiting_2fa'&&saved.pendingExpiresAt<Date.now()?'challenge_expired':saved.phase,
   sharedServiceAdvertised:saved?.sharedServiceAdvertised??false,verificationMethod:verificationMethod.catch('unknown').parse(saved?.privateState.delivery??'unknown'),managementReady:false,changesPerformed:false};
 }
 async setup(){
  const owner=this.options.owner();if(await this.dependency())return this.status();
  if(this.options.customPython)throw new PhotosError('cloud_custom_runtime_unavailable');
  if(this.options.owner()!==owner)throw new PhotosError('owner_changed');
  if(this.options.prepareRuntime)await this.options.prepareRuntime();else{
   const root=this.options.runtimeDirectory;
   await mkdir(root,{mode:0o700}).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='EEXIST')throw e;});
   const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o077))throw new PhotosError('cloud_runtime_unavailable');
   const lock=join(root,'.setup-in-progress');await mkdir(lock,{mode:0o700}).catch(()=>{throw new PhotosError('cloud_setup_in_progress');});
   await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n',{mode:0o600,flag:'wx'});
   // Partial setup is retained for recovery; never replace an existing environment.
   if(await lstat(join(root,'venv')).then(()=>true).catch(()=>false))throw new PhotosError('cloud_setup_recovery_required');
   const command=async(argv:string[])=>{
    const child=Bun.spawn(argv,{stdout:'ignore',stderr:'ignore'});
    let timedOut=false;
    const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},120000);
    try{if(await child.exited!==0||timedOut)throw new PhotosError('cloud_setup_failed');}finally{clearTimeout(deadline);}
   };
   await command(['uv','venv','--python','3.12',join(root,'venv')]);
   const directory=dirname(fileURLToPath(import.meta.url));
   await command(['uv','pip','install','--python',this.options.python,'-r',join(existsSync(join(directory,'cloud-session-requirements.txt'))?directory:join(directory,'photos'),'cloud-session-requirements.txt')]);
   if(!await this.dependency())throw new PhotosError('cloud_setup_failed');
   const {unlink}=await import('node:fs/promises');await unlink(join(lock,'owner.json'));await rmdir(lock);
  }
  if(this.options.owner()!==owner)throw new PhotosError('owner_changed');return this.status();
 }
 async action(input:{action:'login'|'verify'|'send_code'|'recheck'|'revoke';accountId:string;password?:string;code?:string;confirm?:true}){
  const {owner,username}=this.account(input.accountId);
  const expected=this.options.store.providerSessionState(owner,input.accountId,'photos_web');
  if(input.action==='revoke'){
   if(input.confirm!==true)throw new PhotosError('confirmation_required');
   this.options.store.revokeProviderSession(owner,input.accountId,'photos_web',expected);
   return {accountId:input.accountId,phase:'not_connected',managementReady:false,changesPerformed:false};
  }
  if(!await this.dependency())throw new PhotosError('cloud_dependency_missing');
  const saved=input.action==='login'?null:this.load(owner,input.accountId,username);
  if(input.action!=='login'&&!saved)throw new PhotosError('cloud_login_required');
  if(saved?.phase==='awaiting_2fa'&&saved.pendingExpiresAt<Date.now())throw new PhotosError('cloud_challenge_expired');
  if(['verify','send_code'].includes(input.action)&&saved?.phase!=='awaiting_2fa')throw new PhotosError('cloud_verification_not_required');
  if(input.action==='login'&&(!input.password||input.password.length>1024))throw new PhotosError('invalid_input');
  if(input.action==='verify'&&!/^[0-9]{6}$/.test(input.code??''))throw new PhotosError('invalid_input');
  if(this.options.owner()!==owner)throw new PhotosError('owner_changed');
  const result=actorResult.parse(await this.actor({action:input.action,username,...(input.action==='login'?{password:input.password}:{state:saved!.privateState}),...(input.action==='verify'?{code:input.code}:{})}));
  if(this.options.owner()!==owner)throw new PhotosError('owner_changed');
  const current=this.options.store.providerSessionState(owner,input.accountId,'photos_web');
  if(current.accountRevision!==expected.accountRevision||current.generation!==expected.generation)throw new PhotosError('cloud_session_changed');
  if(result.phase==='authentication_required')this.options.store.revokeProviderSession(owner,input.accountId,'photos_web',expected);
  const failedChallenge=['verification_failed','delivery_failed'].includes(result.phase)&&!!result.privateState;
  if(!['authenticated','awaiting_2fa'].includes(result.phase)&&!failedChallenge)return {accountId:input.accountId,phase:result.phase,managementReady:false,changesPerformed:false};
  if(!result.privateState||result.privateState.username!==username)throw new PhotosError('cloud_session_identity_mismatch');
  if(result.phase==='authenticated'&&!/^[0-9]{1,30}$/.test(result.dsid??''))throw new PhotosError('cloud_identity_unverified');
  const phase=failedChallenge?'awaiting_2fa':result.phase as SavedSession['phase'];
  const state:SavedSession={schemaVersion:1,username,phase,pendingExpiresAt:phase==='awaiting_2fa'?(saved?.pendingExpiresAt??Date.now()+15*60000):0,privateState:result.privateState,sharedServiceAdvertised:result.sharedServiceAdvertised??false,...(result.dsid?{dsid:result.dsid}:{}),...(result.serviceOrigin?{serviceOrigin:result.serviceOrigin}:{})};
  const bytes=Buffer.from(JSON.stringify(state));
  try{this.options.store.replaceProviderSession(owner,input.accountId,'photos_web',expected,bytes);}finally{bytes.fill(0);}
  return {accountId:input.accountId,phase:result.phase,sharedServiceAdvertised:state.sharedServiceAdvertised,verificationMethod:verificationMethod.catch('unknown').parse(state.privateState.delivery??'unknown'),managementReady:false,changesPerformed:false};
 }
}
