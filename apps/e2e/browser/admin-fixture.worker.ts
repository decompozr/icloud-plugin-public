import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {renderAuthPage} from '../../icloud/src/auth/pages.js';
import {createPrivateAdmin} from '../../icloud/src/admin/handler.js';
import {mailAdminPresentation} from '../../icloud/src/mail/admin.js';
import {SqliteOwnerStore} from '../../icloud/src/storage/owner-store.js';
import {createSystemStatus} from '../../icloud/src/admin/system-status.js';
import type {AppSettings} from '../../icloud/src/server/settings.js';
const dir=mkdtempSync(join(tmpdir(),'icloud-ui-fixture-')),proof=randomBytes(32).toString('hex');
const store=SqliteOwnerStore.provision({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32),bootstrapProof:proof});store.enroll({proof,ownerId:'owner'});
const account=store.addAccount('owner',{user:'owner@example.invalid',label:'Personal fixture',credential:Buffer.from(JSON.stringify({user:'owner@example.invalid',appPassword:'fixture-dummy'}))});
const status={installed:true,authenticated:true,online:true,privateReachable:true};
const policy={read:true,write:true,send:false,unsubscribe:false};let photosPolicy={read:true,write:false,delete:false};let photoChecks=0,photoActions=0;let calendarPolicy={read:true,write:false,schedule:false,share:false};
const session=async(headers:Headers)=>{if(headers.get('x-fixture-session')!=='owner'&&!(headers.get('cookie')??'').split(';').some(part=>part.trim()==='fixture-owner=owner'))throw Error('Fixture denied');return{user:{id:'owner'}};};
let handler:(request:Request)=>Promise<Response>;
const assets=resolve(import.meta.dir,'../../icloud/dist/assets');
let evidence=true;let authorized=true;let registered=true;let upgraded=false;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{const path=new URL(request.url).pathname;
 if(['/icloud/connect','/icloud/consent','/icloud/sign-in'].includes(path))return new Response(renderAuthPage(path.endsWith('consent')?'consent':path.endsWith('connect')?'connect':'sign-in',path.endsWith('sign-in'),{'mail.read':'Read and search mail','mail.send':'Send and reply','calendar.read':'Read calendars','calendar.write':'Manage calendars and events'}),{headers:{'content-type':'text/html'}});
 if(path==='/fixture/photos-counts')return Response.json({photoChecks,photoActions});
 if(path==='/icloud/connect/status')return Response.json({accounts:store.listAccounts('owner'),selectedAccount:store.listAccounts('owner')[0],client:{id:'fixture-client',name:'ChatGPT fixture'},permissions:['mail.read','mail.send','calendar.read','calendar.write','photos.read','photos.write','photos.delete','offline_access']});
 if(path==='/icloud/connect/select'){const body=await request.json() as {oauth_query:string};return Response.json({url:server.url.origin+'/icloud/consent?'+body.oauth_query});}
 if(path==='/icloud/auth/oauth2/consent'){const body=await request.json() as {accept:boolean;scope:string};return Response.json({url:server.url.origin+'/fixture/'+(body.accept?'authorized?scope='+encodeURIComponent(body.scope):'denied')});}
 if(path.startsWith('/fixture/authorized')||path==='/fixture/denied')return new Response('Fixture completed');
 if(path.startsWith('/icloud/assets/')){const name=path.split('/').at(-1);if(!['admin-browser.js','auth-browser.js','inter.ttf','plugin-icon.png'].includes(name??''))return new Response(null,{status:404});return new Response(Bun.file(join(assets,name!)));}
 if(path==='/fixture/revoke-all'&&request.method==='POST'){await session(request.headers);for(const account of store.listAccounts('owner'))store.revokeAccountSecret('owner',account.id);evidence=false;return Response.json({ok:true});}
 if(path==='/fixture/invalidate'){await session(request.headers);evidence=false;return Response.json({ok:true});}
 if(path==='/icloud/admin/oauth-clients'){try{await session(request.headers);}catch{return Response.json({error:'DENIED'},{status:403});}
 const url=new URL(request.url),action=url.searchParams.get('action');if(action)return Response.json({impact:{clientId:'fixture-client',name:'ChatGPT fixture',action,accountIds:[account.id],accessTokens:authorized?1:0,refreshTokens:authorized?1:0,consents:authorized?1:0,authorizationCodes:0,registrationRemoved:action==='remove',accountsPreserved:true,removable:true,additionalScopes:action==='upgrade'?['photos.read']:[],upgradable:true},confirmation:'fixture-confirmation'});
 if(request.method==='POST'){const body=await request.json() as {confirm?:boolean;confirmation?:string;action?:string};if(!body.confirm||body.confirmation!=='fixture-confirmation')return Response.json({error:'DENIED'},{status:403});if(body.action==='upgrade')upgraded=true;else authorized=false;if(body.action==='remove')registered=false;return Response.json({ok:true});}
 return Response.json({clients:registered?[{clientId:'fixture-client',name:'ChatGPT fixture',registeredScopes:upgraded?['mail.read','calendar.read','photos.read']:['mail.read','calendar.read'],missingEnabledScopes:upgraded?[]:['photos.read'],upgradeAvailable:!upgraded,recovery:upgraded?'fresh_consent_and_tool_refresh':'explicit_client_update_then_consent'}]:[],connections:authorized?[{clientId:'fixture-client',name:'ChatGPT fixture',accountId:account.id,grantedScopes:['mail.read','calendar.read'],authorizedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}]:[]});}

 return handler(request);
}});
const settings:AppSettings={public_origin:'https://public.example.invalid',private_origin:server.url.origin,public_port:4100,private_port:server.port!,host:'127.0.0.1',runtime_mode:'native',state_directory:dir,master_key_file:join(dir,'key'),installation_marker:join(dir,'marker'),allow_writes:false,allow_send:false,tailscale_binary:'/fixture/tailscale'};
handler=createPrivateAdmin({photosSetup:{status:async()=>{photoChecks++;return {libraryReadable:true,libraryStatus:'ready',authorization:'not_requested',ready:false};},action:async()=>{photoActions++;return {opened:true,ready:false};}},privateOrigin:server.url.origin,publicMcpUrl:settings.public_origin+'/icloud/mcp',store,ownerAuth:{ownerSession:session,enrollmentSession:session},diagnostics:async()=>status,systemStatus:()=>createSystemStatus(settings,{prerequisites:async()=>status,command:async()=>({exitCode:1,stdout:''}),version:'fixture-source',installedVersion:'fixture-artifact',pid:42,uptime:()=>120}),evidence:()=>evidence?[{accountId:account.id,clientId:'fixture-client',service:'mail',authorizedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),reads:{mail_list_mailboxes:new Date().toISOString()}}]:[],presentation:mailAdminPresentation,capabilities:()=>policy,updateCapabilities:async next=>{Object.assign(policy,next);evidence=false;return policy;},modules:[{id:'calendar',title:'Calendar',fields:['read','write','schedule','share'].map(id=>({id,label:id})),capabilities:()=>calendarPolicy,updateCapabilities:async next=>{calendarPolicy=next as typeof calendarPolicy;evidence=false;return calendarPolicy;}},{id:'photos',title:'Mac Photos library',fields:['read','write','delete'].map(id=>({id,label:id})),capabilities:()=>photosPolicy,updateCapabilities:async next=>{photosPolicy=next as typeof photosPolicy;return photosPolicy;}}],validateCredential:async credential=>{if(credential.appPassword==='invalid-dummy')throw Error('Fixture invalid');}});
const close=()=>{server.stop(true);store.close();rmSync(dir,{recursive:true,force:true});process.exit(0);};process.on('SIGTERM',close);process.on('SIGINT',close);
console.log(server.url.origin);
