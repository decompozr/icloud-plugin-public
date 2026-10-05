import {createLocalOwnerAccess,createRemoteOwnerPairing} from '../auth/local-owner.js';
import {setupPage} from '../admin/page.js';
import {ReconnectCapture} from '../observability/reconnect.js';
import {runtimeVersions} from './versions.js';
import {createSystemStatus,type SystemStatus} from '../admin/system-status.js';
import {ReadinessEvidence} from '../admin/evidence.js';
import {evidenceState} from '../admin/evidence-state.js';
import {createCalendarModule,type CalendarModuleDependencies} from '../calendar/module.js';
import {createMailModule,type MailModuleDependencies} from '../mail/module.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {configuredPluginArchive} from '../plugin/package.js';
import express from'express';
import {OperationMonitor} from '../observability/operations.js';
import {HttpLifecycle} from './lifecycle.js';
import{Database}from'bun:sqlite';
import{createHash}from'node:crypto';
import{join,dirname}from'node:path';
import{readFileSync}from'node:fs';
import{createBootstrapAccess}from'../auth/bootstrap.js';
import{z}from'zod';
import type{AppSettings}from'./settings.js';
import type{OwnerSecretStore}from'../storage/owner-store.js';
import{createOwnerAuth}from'../auth/owner.js';
import{renderAuthPage}from'../auth/pages.js';
import{createPrivateAdmin,type TailscaleStatus}from'../admin/handler.js';
import{createHttpApp}from'./http.js';
import{fetchBridge,guardHost}from'./bridge.js';
import{prerequisites}from'./prerequisites.js';

export interface ApplicationDependencies{
 calendarProvider?:CalendarModuleDependencies['provider'];
 monitor?:OperationMonitor;lifecycle?:HttpLifecycle;
 store:OwnerSecretStore;masterKey:Uint8Array;authDatabase:Database;assetsDirectory:string;
 outboundProvider?:MailModuleDependencies['outboundProvider'];
 diagnostics?:()=>Promise<TailscaleStatus>;
 systemStatus?:()=>Promise<SystemStatus>;
 bootstrapProof?:()=>string;
 provider?:MailModuleDependencies['provider'];
}
function connectionCommands(settings:AppSettings):string[]{const binary="'"+settings.tailscale_binary.replace(/'/g,"'\\''")+"'",privatePort=new URL(settings.private_origin).port||'443';return [`${binary} serve --bg --https=${privatePort} --set-path=/icloud http://127.0.0.1:${settings.private_port}/icloud`,...['/icloud','/.well-known/oauth-protected-resource/icloud/mcp','/.well-known/oauth-authorization-server/icloud/auth'].map(path=>`${binary} funnel --bg --https=443 --set-path=${path} http://127.0.0.1:${settings.public_port}${path}`)];}
export async function createApplication(settings:AppSettings,deps:ApplicationDependencies):Promise<{publicApp:express.Express;privateApp:express.Express;localApp?:express.Express;auth:Awaited<ReturnType<typeof createOwnerAuth>>;monitor:OperationMonitor;lifecycle:HttpLifecycle;runtime:ModuleRuntime}>{
 const monitor=deps.monitor??new OperationMonitor(),lifecycle=deps.lifecycle??new HttpLifecycle();
 const reconnect=new ReconnectCapture(settings.state_directory);
 const establishedOwner=deps.store.ownerId();
 if(establishedOwner){
  // Never silently rebuild owner authentication after lost/corrupt auth state.
  const row=z.object({count:z.number().int().positive()}).parse(deps.authDatabase.query('SELECT count(*) AS count FROM passkey WHERE userId=?').get(establishedOwner));
  if(!row.count)throw Error('Owner authentication recovery required');
 }
 const mailModule=createMailModule(settings,{...deps,monitor});
 const calendarModule=createCalendarModule(settings,{...deps,monitor,provider:deps.calendarProvider});
 const runtime=new ModuleRuntime().register(mailModule.registration).register(calendarModule.registration);
 await runtime.start();
 try{
 const config=mailModule.config;
 const scopeLabels=Object.fromEntries(runtime.scopeDescriptors.map(scope=>[scope.name,{default:scope.description,...scope.descriptionLocales}]));
 const diagnostics=deps.diagnostics??(()=>prerequisites(settings));
 const pairing=settings.local_origin?createRemoteOwnerPairing(settings.private_origin,()=>deps.store.ownerId()):undefined;
 const auth=await createOwnerAuth({database:deps.authDatabase,...(pairing?{registrationOwnerId:()=>deps.store.ownerId(),checkRegistrationProof:(proof:string)=>{if(deps.store.ownerId()!==null){if(proof!==pairing.proof)throw Error('Remote owner pairing required');}else deps.store.checkBootstrapProof(proof);}}:{}),onOAuthError:reconnect.noteError,publicBaseURL:settings.public_origin,privateOrigin:settings.private_origin,rpID:new URL(settings.public_origin).hostname,secret:createHash('sha256').update(deps.masterKey).update('owner-auth-v1').digest('hex'),resource:settings.public_origin+'/icloud/mcp',scopes:runtime.declaredScopes,allowedScopes:()=>runtime.allowedScopes,ownerId:()=>deps.store.ownerId(),checkBootstrapProof:proof=>deps.store.checkBootstrapProof(proof),accountStore:deps.store,validateCredential:mailModule.admin.validateCredential});
 const bootstrap=createBootstrapAccess({login:settings.bootstrap_owner_login,origin:settings.private_origin,isEnrolled:()=>deps.store.ownerId()!==null});
 const internalProof=deps.bootstrapProof??(()=>readFileSync(join(dirname(settings.master_key_file),'bootstrap-proof'),'utf8'));
 const setupState=async(request:Request)=>{let passkeyRegistered=false;try{const session=await auth.enrollmentSession(request.headers);passkeyRegistered=bootstrap.resumed(request,session.user.id);}catch{}return{bootstrapAuthorized:bootstrap.allowed(request),passkeyRegistered};};
 let policyEpoch=0;
 const evidence=new ReadinessEvidence(evidenceState(deps.authDatabase,deps.store,()=>runtime.allowedScopes,()=>policyEpoch));
 const publicApp=createHttpApp(config,runtime,auth.verifyBearer,lifecycle,evidence,reconnect);
 publicApp.use(guardHost(settings.public_origin,settings.public_port));
 for(const page of ['sign-in','consent','connect'] as const)publicApp.get('/icloud/'+page,(_req,res)=>{res.set({'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}).type('html').send(renderAuthPage(page,false,scopeLabels));});
 publicApp.get('/icloud/assets/inter.ttf',(_req,res)=>res.type('font/ttf').sendFile(join(deps.assetsDirectory,'inter.ttf'),{dotfiles:'allow'}));
 publicApp.get('/icloud/assets/auth-browser.js',(_req,res)=>res.sendFile(join(deps.assetsDirectory,'auth-browser.js'),{dotfiles:'allow'}));
 publicApp.use(express.raw({type:()=>true,limit:'256kb'}),fetchBridge(settings.public_origin,auth.publicHandler,lifecycle));
 const versions=runtimeVersions(deps.assetsDirectory);
 const admin=createPrivateAdmin({systemStatus:deps.systemStatus??(()=>createSystemStatus(settings,{prerequisites:()=>diagnostics(),...versions})),evidence:owner=>evidence.list(owner),privateOrigin:settings.private_origin,pluginArchive:()=>configuredPluginArchive(join(deps.assetsDirectory,'../plugin-template'),settings.public_origin),publicMcpUrl:new URL('/icloud/mcp',settings.public_origin).href,store:deps.store,ownerAuth:auth,diagnostics,setupState,...mailModule.admin,updateCapabilities:async(...args)=>{try{return await mailModule.admin.updateCapabilities!(...args);}finally{policyEpoch++;}},modules:[{...calendarModule.admin,updateCapabilities:async(...args)=>{try{return await calendarModule.admin.updateCapabilities(...args);}finally{policyEpoch++;}}}]});
 const privateApp=express();privateApp.disable('x-powered-by');privateApp.use(lifecycle.admission);privateApp.use(guardHost(settings.private_origin,settings.private_port));
 privateApp.use((req,res,next)=>{
  const address=req.socket.remoteAddress?.replace(/^::ffff:/,'');
  if(address!=='127.0.0.1'&&address!=='::1'&&!(settings.runtime_mode==='container'&&settings.private_proxy_address&&address===settings.private_proxy_address)){res.status(403).end();return;}next();
 });
 privateApp.get('/setup',(_req,res)=>res.redirect(308,'/icloud/setup'));
 privateApp.get('/icloud/sign-in',(_req,res)=>res.set({'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}).type('html').send(renderAuthPage('sign-in',true,scopeLabels)));
 privateApp.get('/icloud/setup/health',(_req,res)=>res.type('text/plain').send('icloud-private'));
 privateApp.get('/icloud/assets/plugin-icon.png',(_req,res)=>res.type('png').sendFile(join(deps.assetsDirectory,'plugin-icon.png'),{dotfiles:'allow'}));
 privateApp.get('/icloud/assets/admin-browser.js',(_req,res)=>res.sendFile(join(deps.assetsDirectory,'admin-browser.js'),{dotfiles:'allow'}));
 privateApp.get('/icloud/assets/inter.ttf',(_req,res)=>res.type('font/ttf').sendFile(join(deps.assetsDirectory,'inter.ttf'),{dotfiles:'allow'}));
 privateApp.get('/icloud/assets/auth-browser.js',(_req,res)=>res.sendFile(join(deps.assetsDirectory,'auth-browser.js'),{dotfiles:'allow'}));
 privateApp.use(express.raw({type:()=>true,limit:'256kb'}),fetchBridge(settings.private_origin,async request=>{
  const path=new URL(request.url).pathname;
  if(pairing&&deps.store.ownerId()!==null){
   if(path==='/icloud/setup'&&new URL(request.url).searchParams.get('mode')==='remote-owner')return new Response(setupPage({enrolled:false,ready:true,admin:false,view:'setup',publicMcpUrl:new URL('/icloud/mcp',settings.public_origin).href}),{headers:{'cache-control':'no-store','referrer-policy':'no-referrer','content-type':'text/html','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"}});
   if(path==='/icloud/setup/status'&&new URL(request.url).searchParams.get('mode')==='remote-owner')return Response.json({prerequisites:await diagnostics(),ready:true,enrolled:false,bootstrapAuthorized:(()=>{try{pairing.authorize(request);return true;}catch{return false;}})(),passkeyRegistered:await auth.enrollmentSession(request.headers).then(current=>pairing.authorize(request).user===current.user.id).catch(()=>false)});
   if(path==='/icloud/setup/begin'){try{if(request.method!=='POST')throw Error('Method denied');try{const grant=pairing.authorize(request);return Response.json({passkeyRegistered:Boolean(grant.user)});}catch{}const body=z.object({proof:z.string()}).strict().parse(await request.json());return Response.json({passkeyRegistered:false},{headers:{'set-cookie':pairing.begin(request,body.proof),'cache-control':'no-store'}});}catch{return Response.json({error:'REMOTE_OWNER_PAIRING_REQUIRED'},{status:403});}}
   if(['/icloud/auth/passkey/generate-register-options','/icloud/auth/passkey/verify-registration','/icloud/setup/complete'].includes(path)){
    try{pairing.authorize(request);if(path==='/icloud/setup/complete'){if(request.method!=='POST'||request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('Explicit completion required');z.object({}).strict().parse(await request.json());const current=await auth.ownerSession(request.headers);pairing.complete(request,current.user.id);return Response.json({enrolled:true});}
     const headers=new Headers(request.headers);headers.set('x-bootstrap-proof',pairing.proof);const response=await auth.privateHandler(new Request(request,{headers}));
     if(path.endsWith('/verify-registration')&&response.ok){const cookies=new Headers(request.headers);cookies.set('cookie',[request.headers.get('cookie')??'',...response.headers.getSetCookie().map(value=>value.split(';')[0])].join('; '));pairing.bind(request,(await auth.ownerSession(cookies)).user.id);}return response;
    }catch{return Response.json({error:'REMOTE_OWNER_PAIRING_REQUIRED'},{status:403});}
   }
  }
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
  if(path==='/icloud/admin/oauth-clients')return auth.privateHandler(request);
  if(path.startsWith('/icloud/auth/')){
   if(path.includes('register')||path.includes('registration')){const status=await diagnostics();if(!Object.values(status).every(Boolean))return new Response('Prerequisites required',{status:409});}
   return auth.privateHandler(request);
  }
  return admin(request);
 },lifecycle));
 let localApp:express.Express|undefined;
 if(settings.local_origin){
  const localOrigin=settings.local_origin,access=createLocalOwnerAccess(settings,()=>deps.store.ownerId());
  const localAuth=await createOwnerAuth({database:deps.authDatabase,publicBaseURL:localOrigin,privateOrigin:localOrigin,rpID:'localhost',sessionOnly:true,cookiePrefix:'icloud_local',accountStore:deps.store,allowedScopes:()=>runtime.allowedScopes,secret:createHash('sha256').update(deps.masterKey).update('local-owner-auth-v1').digest('hex'),resource:settings.public_origin+'/icloud/mcp',scopes:runtime.declaredScopes,ownerId:()=>deps.store.ownerId(),registrationOwnerId:()=>deps.store.ownerId(),checkRegistrationProof:value=>access.checkProof(value),checkBootstrapProof:()=>{throw Error('Local proof required');}});
  const localAdmin=createPrivateAdmin({connectionCommands:connectionCommands(settings),privateOrigin:localOrigin,setupReady:true,localOwner:true,store:deps.store,ownerAuth:localAuth,diagnostics,setupState:async request=>{let passkeyRegistered=false;try{const current=await localAuth.enrollmentSession(request.headers);passkeyRegistered=access.authorize(request).user===current.user.id;}catch{}return{bootstrapAuthorized:(()=>{try{access.authorize(request);return true;}catch{return false;}})(),passkeyRegistered,localOwner:true};},systemStatus:deps.systemStatus??(()=>createSystemStatus(settings,{prerequisites:()=>diagnostics(),...versions})),evidence:owner=>evidence.list(owner),publicMcpUrl:new URL('/icloud/mcp',settings.public_origin).href,...mailModule.admin,modules:[calendarModule.admin]});
  localApp=express();localApp.disable('x-powered-by');localApp.use(lifecycle.admission);
  // A local RP has exactly one Host. Remote/private proxy Hosts never reach it.
  localApp.use((req,res,next)=>{const address=req.socket.remoteAddress?.replace(/^::ffff:/,'');if(req.get('host')!==new URL(localOrigin).host||!['127.0.0.1','::1'].includes(address??'')){res.status(403).end();return;}next();});
  localApp.get('/icloud/sign-in',(_req,res)=>res.set({'cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}).type('html').send(renderAuthPage('sign-in',true,scopeLabels)));
  for(const asset of ['admin-browser.js','auth-browser.js','inter.ttf','plugin-icon.png'])localApp.get('/icloud/assets/'+asset,(_req,res)=>res.sendFile(join(deps.assetsDirectory,asset),{dotfiles:'allow'}));
  localApp.use(express.raw({type:()=>true,limit:'256kb'}),fetchBridge(localOrigin,async request=>{
   const path=new URL(request.url).pathname;
   if(path==='/icloud/admin/remote-owner'){
    try{if(request.method!=='POST'||request.headers.get('origin')!==localOrigin)throw Error('Origin required');const body=z.object({confirm:z.literal(true)}).strict().parse(await request.json());void body;const current=await localAuth.ownerSession(request.headers);return Response.json({url:pairing!.issue(current.user.id),expiresIn:300},{headers:{'cache-control':'no-store'}});}catch{return Response.json({error:'OWNER_CONFIRMATION_REQUIRED'},{status:403});}
   }
   if(path==='/icloud/setup'&&new URL(request.url).searchParams.get('mode')==='local-owner')return new Response(setupPage({localOwner:true,enrolled:false,ready:true,admin:false,view:'setup',publicMcpUrl:new URL('/icloud/mcp',settings.public_origin).href}),{headers:{'cache-control':'no-store','referrer-policy':'no-referrer','content-type':'text/html','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"}});
   if(path==='/icloud/setup/status'&&new URL(request.url).searchParams.get('mode')==='local-owner')return Response.json({prerequisites:await diagnostics(),ready:true,enrolled:false,localOwner:true,bootstrapAuthorized:(()=>{try{access.authorize(request);return true;}catch{return false;}})(),passkeyRegistered:await localAuth.enrollmentSession(request.headers).then(current=>access.authorize(request).user===current.user.id).catch(()=>false)},{headers:{'cache-control':'no-store'}});
   if(path==='/icloud/setup/begin'){
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    try{try{const grant=access.authorize(request);return Response.json({passkeyRegistered:Boolean(grant.user)});}catch{}
     const body=z.object({proof:z.string()}).strict().parse(await request.json());return Response.json({passkeyRegistered:false},{headers:{'set-cookie':access.begin(request,body.proof),'cache-control':'no-store'}});
    }catch{return Response.json({error:'LOCAL_OWNER_PROOF_REQUIRED'},{status:403});}
   }
   const registration=['/icloud/auth/passkey/generate-register-options','/icloud/auth/passkey/verify-registration'].includes(path);
   if(registration||path==='/icloud/setup/complete'){
    try{access.authorize(request);const headers=new Headers(request.headers);headers.set('x-bootstrap-proof',access.proof);const internal=new Request(request,{headers});
     if(path==='/icloud/setup/complete'){if(request.method!=='POST'||request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('Explicit completion required');z.object({}).strict().parse(await request.json());const current=await localAuth.enrollmentSession(request.headers);if(access.authorize(request).user!==current.user.id)throw Error('Owner association required');if(deps.store.ownerId()===null){deps.store.enroll({proof:internalProof(),ownerId:current.user.id});}else if(current.user.id!==deps.store.ownerId())throw Error('Owner required');access.close();return Response.json({enrolled:true});}
     const response=await localAuth.privateHandler(internal);
     if(path.endsWith('/verify-registration')&&response.ok){const cookies=new Headers(request.headers);cookies.set('cookie',[request.headers.get('cookie')??'',...response.headers.getSetCookie().map(value=>value.split(';')[0])].join('; '));access.bind(request,(await localAuth.enrollmentSession(cookies)).user.id);}
     return response;
    }catch{return Response.json({error:'LOCAL_OWNER_PROOF_REQUIRED'},{status:403});}
   }
   if(path==='/icloud/admin/oauth-clients')return localAuth.privateHandler(request);
   if(path.startsWith('/icloud/auth/'))return ['/icloud/auth/passkey/generate-authenticate-options','/icloud/auth/passkey/verify-authentication','/icloud/auth/get-session','/icloud/auth/sign-out'].includes(path)?localAuth.privateHandler(request):new Response('Not found',{status:404});
   return localAdmin(request);
  },lifecycle));
 }
 return{publicApp,privateApp,...(localApp?{localApp}:{}),auth,monitor,lifecycle,runtime};
 }catch(error){try{await runtime.dispose();}catch{}throw error;}
}
