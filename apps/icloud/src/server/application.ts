import {configuredPluginArchive} from '../plugin/package.js';
import {SqliteOperatorPolicy} from '../storage/operator-policy.js';
import express from'express';
import {OperationMonitor} from '../observability/operations.js';
import {HttpLifecycle} from './lifecycle.js';
import {ICloudOutboundAdapter} from '../icloud/outbound.js';
import {OutboundService} from '../services/outbound.js';
import {SqliteOutboundLedger} from '../storage/outbound-ledger.js';
import type {OutboundGateway} from '../domain/outbound.js';
import{Database}from'bun:sqlite';
import{createHash}from'node:crypto';
import{join,dirname}from'node:path';
import{readFileSync}from'node:fs';
import{createBootstrapAccess}from'../auth/bootstrap.js';
import{z}from'zod';
import type{AppSettings}from'./settings.js';
import type{OwnerSecretStore}from'../storage/owner-store.js';
import type{MailGateway,MailMessageInput,SendResult}from'../domain/mail.js';
import{MailOperationError}from'../domain/mail.js';
import{createOwnerAuth}from'../auth/owner.js';
import{renderAuthPage}from'../auth/pages.js';
import{createPrivateAdmin,type AppleCredential,type TailscaleStatus}from'../admin/handler.js';
import{ICloudMailAdapter}from'../icloud/adapter.js';
import{MailService}from'../services/mail.js';
import{UnsubscribeService}from'../services/unsubscribe.js';
import{createUnsubscribeGateway}from'../icloud/unsubscribe.js';
import{createHttpApp}from'./http.js';
import{fetchBridge,guardHost}from'./bridge.js';
import{prerequisites}from'./prerequisites.js';

export interface ApplicationDependencies{
 monitor?:OperationMonitor;lifecycle?:HttpLifecycle;
 store:OwnerSecretStore;masterKey:Uint8Array;authDatabase:Database;assetsDirectory:string;
 outboundProvider?:(credential:AppleCredential)=>OutboundGateway;
 diagnostics?:()=>Promise<TailscaleStatus>;
 bootstrapProof?:()=>string;
 provider?:(credential:AppleCredential)=>MailGateway&{send(input:MailMessageInput):Promise<SendResult>};
}
const credentialSchema=z.object({user:z.string().email(),appPassword:z.string().min(1)}).strict();
export async function createApplication(settings:AppSettings,deps:ApplicationDependencies):Promise<{publicApp:express.Express;privateApp:express.Express;auth:Awaited<ReturnType<typeof createOwnerAuth>>;monitor:OperationMonitor;lifecycle:HttpLifecycle}>{
 const monitor=deps.monitor??new OperationMonitor(),lifecycle=deps.lifecycle??new HttpLifecycle();
 const establishedOwner=deps.store.ownerId();
 if(establishedOwner){
  // Never silently rebuild owner authentication after lost/corrupt auth state.
  const row=z.object({count:z.number().int().positive()}).parse(deps.authDatabase.query('SELECT count(*) AS count FROM passkey WHERE userId=?').get(establishedOwner));
  if(!row.count)throw Error('Owner authentication recovery required');
 }
 const operatorPolicy=new SqliteOperatorPolicy(deps.authDatabase,{read:true,write:settings.allow_writes,send:settings.allow_send,unsubscribe:settings.allow_writes});
 const capabilities=()=>operatorPolicy.snapshot();
 const scopes=()=>{const p=capabilities();return p.read?['mail.read',...(p.write?['mail.write']:[]),...(p.send?['mail.send']:[])]:[];};
 const diagnostics=deps.diagnostics??(()=>prerequisites(settings));
 const provider=deps.provider??(credential=>new ICloudMailAdapter({user:credential.user,password:credential.appPassword}));
 const auth=await createOwnerAuth({database:deps.authDatabase,publicBaseURL:settings.public_origin,privateOrigin:settings.private_origin,rpID:new URL(settings.public_origin).hostname,secret:createHash('sha256').update(deps.masterKey).update('owner-auth-v1').digest('hex'),resource:settings.public_origin+'/icloud/mcp',scopes:['mail.read','mail.write','mail.send','offline_access'],allowedScopes:()=>[...scopes(),'offline_access'],ownerId:()=>deps.store.ownerId(),checkBootstrapProof:proof=>deps.store.checkBootstrapProof(proof)});
 const bootstrap=createBootstrapAccess({login:settings.bootstrap_owner_login,origin:settings.private_origin,isEnrolled:()=>deps.store.ownerId()!==null});
 const internalProof=deps.bootstrapProof??(()=>readFileSync(join(dirname(settings.master_key_file),'bootstrap-proof'),'utf8'));
 const setupState=async(request:Request)=>{let passkeyRegistered=false;try{const session=await auth.enrollmentSession(request.headers);passkeyRegistered=bootstrap.resumed(request,session.user.id);}catch{}return{bootstrapAuthorized:bootstrap.allowed(request),passkeyRegistered};};
 const credentials=()=>{const owner=deps.store.ownerId();if(!owner)throw new MailOperationError('forbidden','Owner setup required');const bytes=deps.store.readSecret(owner);if(!bytes)throw new MailOperationError('forbidden','Mail credentials revoked');try{return credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));}finally{bytes.fill(0);}};
 const current=()=>{const owner=deps.store.ownerId();if(!owner)throw new MailOperationError('forbidden','Owner setup required');const bytes=deps.store.readSecret(owner);if(!bytes)throw new MailOperationError('forbidden','Mail credentials revoked');try{return provider(credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))));}finally{bytes.fill(0);}};
 const gateway:MailGateway={withSession:run=>current().withSession(run),parse:source=>current().parse(source)};
 const mail=new MailService({allowWrites:settings.allow_writes},gateway,capabilities);
 const unsubscribe=new UnsubscribeService(mail,createUnsubscribeGateway({sendMail:input=>current().send(input)}),{get enabled(){const p=capabilities();return p.read&&p.write&&p.unsubscribe;}});
 const outboundProvider=()=>{const credential=credentials();return deps.outboundProvider?.(credential)??new ICloudOutboundAdapter({user:credential.user,password:credential.appPassword});};
 const ledger=new SqliteOutboundLedger(deps.authDatabase,deps.masterKey,()=>{const owner=deps.store.ownerId();if(!owner)throw new MailOperationError('forbidden','Owner setup required');credentials();return owner;});
 const outbound=new OutboundService({get allowRead(){return capabilities().read;},get allowSend(){const p=capabilities();return p.read&&p.send;},get allowWrites(){const p=capabilities();return p.read&&p.write;}},gateway,{compose:input=>{const p=outboundProvider();if(!p.compose)throw new Error("Compose unavailable");return p.compose(input);},send:input=>outboundProvider().send(input),draft:(input,mailbox)=>outboundProvider().draft(input,mailbox)},ledger);
 const config={user:'',password:'',get allowRead(){return capabilities().read;},get allowWrites(){const p=capabilities();return p.read&&p.write;},get allowSend(){const p=capabilities();return p.read&&p.send;},get allowUnsubscribe(){return capabilities().unsubscribe;},transport:'http' as const,host:settings.host,port:settings.public_port,publicUrl:settings.public_origin+'/icloud/mcp',issuer:settings.public_origin+'/icloud/auth',audience:settings.public_origin+'/icloud/mcp',jwksUrl:settings.public_origin+'/unused',get scopes(){return scopes();},allowedSubjects:[]};
 const publicApp=createHttpApp(config,mail,auth.verifyBearer,unsubscribe,outbound,monitor,lifecycle);
 publicApp.use(guardHost(settings.public_origin,settings.public_port));
 for(const page of ['sign-in','consent'] as const)publicApp.get('/icloud/'+page,(_req,res)=>{res.set({'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}).type('html').send(renderAuthPage(page));});
 publicApp.get('/icloud/assets/auth-browser.js',(_req,res)=>res.sendFile(join(deps.assetsDirectory,'auth-browser.js'),{dotfiles:'allow'}));
 publicApp.use(express.raw({type:()=>true,limit:'256kb'}),fetchBridge(settings.public_origin,auth.publicHandler,lifecycle));
 const admin=createPrivateAdmin({privateOrigin:settings.private_origin,pluginArchive:()=>configuredPluginArchive(join(deps.assetsDirectory,'../plugin-template'),settings.public_origin),publicMcpUrl:new URL('/icloud/mcp',settings.public_origin).href,store:deps.store,ownerAuth:auth,diagnostics,setupState,capabilities,updateCapabilities:async(next,confirm)=>operatorPolicy.update(next,confirm),validateCredential:async credential=>{await provider(credential).withSession(session=>session.list());}});
 const privateApp=express();privateApp.disable('x-powered-by');privateApp.use(lifecycle.admission);privateApp.use(guardHost(settings.private_origin,settings.private_port));
 privateApp.use((req,res,next)=>{
  const address=req.socket.remoteAddress?.replace(/^::ffff:/,'');
  if(address!=='127.0.0.1'&&address!=='::1'&&!(settings.runtime_mode==='container'&&settings.private_proxy_address&&address===settings.private_proxy_address)){res.status(403).end();return;}next();
 });
 privateApp.get('/setup',(_req,res)=>res.redirect(308,'/icloud/setup'));
 privateApp.get('/icloud/sign-in',(_req,res)=>res.set({'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}).type('html').send(renderAuthPage('sign-in',true)));
 privateApp.get('/icloud/setup/health',(_req,res)=>res.type('text/plain').send('icloud-private'));
 privateApp.get('/icloud/assets/plugin-icon.png',(_req,res)=>res.type('png').sendFile(join(deps.assetsDirectory,'plugin-icon.png'),{dotfiles:'allow'}));
 privateApp.get('/icloud/assets/admin-browser.js',(_req,res)=>res.sendFile(join(deps.assetsDirectory,'admin-browser.js'),{dotfiles:'allow'}));
 privateApp.get('/icloud/assets/auth-browser.js',(_req,res)=>res.sendFile(join(deps.assetsDirectory,'auth-browser.js'),{dotfiles:'allow'}));
 privateApp.use(express.raw({type:()=>true,limit:'256kb'}),fetchBridge(settings.private_origin,async request=>{
  const path=new URL(request.url).pathname;
  const registration=path==='/icloud/auth/passkey/generate-register-options'||path==='/icloud/auth/passkey/verify-registration';
  if(path==='/icloud/setup/begin'||registration||path==='/icloud/setup/complete'){
   if(deps.store.ownerId()!==null)return Response.json({error:'ENROLLMENT_CLOSED'},{status:path==='/icloud/setup/complete'?409:403});
   const status=await diagnostics();if(!Object.values(status).every(Boolean))return Response.json({error:'PREREQUISITES_REQUIRED'},{status:409});
   try{
    if(path==='/icloud/setup/begin'){
     if(request.method!=='POST')return new Response('Method not allowed',{status:405});
     let userId:string|undefined;try{userId=(await auth.enrollmentSession(request.headers)).user.id;}catch{}
     return Response.json({ready:true,passkeyRegistered:Boolean(userId)},{headers:{'set-cookie':bootstrap.begin(request,userId),'cache-control':'no-store'}});
    }
    if(path==='/icloud/setup/complete')bootstrap.authorize(request,(await auth.enrollmentSession(request.headers)).user.id);
    else bootstrap.authorize(request);
    const proof=internalProof();deps.store.checkBootstrapProof(proof);
    const headers=new Headers(request.headers);headers.set('x-bootstrap-proof',proof);
    const internal=new Request(request,{headers});
    const response=registration?await auth.privateHandler(internal):await admin(internal);
    if(path==='/icloud/auth/passkey/verify-registration'&&response.ok){
     const cookies=new Map<string,string>();for(const part of (request.headers.get('cookie')??'').split(';')){const at=part.indexOf('=');if(at>0)cookies.set(part.slice(0,at).trim(),part.slice(at+1));}
     for(const part of response.headers.getSetCookie()){const pair=part.split(';')[0]!;const at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
     const session=await auth.enrollmentSession(new Headers({cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}));bootstrap.bind(request,session.user.id);
    }
    if(path==='/icloud/setup/complete'&&response.ok)bootstrap.close();
    return response;
   }catch{return Response.json({error:'SETUP_AUTHORIZATION_REQUIRED'},{status:403});}
  }
  if(path.startsWith('/icloud/auth/')){
   if(path.includes('register')||path.includes('registration')){const status=await diagnostics();if(!Object.values(status).every(Boolean))return new Response('Prerequisites required',{status:409});}
   return auth.privateHandler(request);
  }
  return admin(request);
 },lifecycle));
 return{publicApp,privateApp,auth,monitor,lifecycle};
}
