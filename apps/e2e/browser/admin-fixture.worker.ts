import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPrivateAdmin} from '../../icloud/src/admin/handler.js';
import {mailAdminPresentation} from '../../icloud/src/mail/admin.js';
import {SqliteOwnerStore} from '../../icloud/src/storage/owner-store.js';
import {createSystemStatus} from '../../icloud/src/admin/system-status.js';
import type {AppSettings} from '../../icloud/src/server/settings.js';
const dir=mkdtempSync(join(tmpdir(),'icloud-ui-fixture-')),proof=randomBytes(32).toString('hex');
const store=SqliteOwnerStore.provision({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32),bootstrapProof:proof});store.enroll({proof,ownerId:'owner'});
const account=store.addAccount('owner',{user:'owner@example.invalid',label:'Personal fixture',credential:Buffer.from(JSON.stringify({user:'owner@example.invalid',appPassword:'fixture-dummy'}))});
const status={installed:true,authenticated:true,online:true,privateReachable:true};
const policy={read:true,write:true,send:false,unsubscribe:false};let calendarPolicy={read:true,write:false,schedule:false,share:false};
const session=async(headers:Headers)=>{if(headers.get('x-fixture-session')!=='owner'&&!(headers.get('cookie')??'').split(';').some(part=>part.trim()==='fixture-owner=owner'))throw Error('Fixture denied');return{user:{id:'owner'}};};
let handler:(request:Request)=>Promise<Response>;
const assets=resolve(import.meta.dir,'../../icloud/dist/assets');
let evidence=true;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{const path=new URL(request.url).pathname;
 if(path.startsWith('/icloud/assets/')){const name=path.split('/').at(-1);if(!['admin-browser.js','inter.ttf','plugin-icon.png'].includes(name??''))return new Response(null,{status:404});return new Response(Bun.file(join(assets,name!)));}
 if(path==='/fixture/revoke-all'&&request.method==='POST'){await session(request.headers);for(const account of store.listAccounts('owner'))store.revokeAccountSecret('owner',account.id);evidence=false;return Response.json({ok:true});}
 if(path==='/fixture/invalidate'){await session(request.headers);evidence=false;return Response.json({ok:true});}
 if(path==='/icloud/admin/oauth-clients'){try{await session(request.headers);}catch{return Response.json({error:'DENIED'},{status:403});}return Response.json({clients:[{clientId:'fixture-client',name:'ChatGPT fixture',registeredScopes:['mail.read','calendar.read'],recovery:'fresh_consent_and_tool_refresh'}]});}
 return handler(request);
}});
const settings:AppSettings={public_origin:'https://public.example.invalid',private_origin:server.url.origin,public_port:4100,private_port:server.port!,host:'127.0.0.1',runtime_mode:'native',state_directory:dir,master_key_file:join(dir,'key'),installation_marker:join(dir,'marker'),allow_writes:false,allow_send:false,tailscale_binary:'/fixture/tailscale'};
handler=createPrivateAdmin({privateOrigin:server.url.origin,publicMcpUrl:settings.public_origin+'/icloud/mcp',store,ownerAuth:{ownerSession:session,enrollmentSession:session},diagnostics:async()=>status,systemStatus:()=>createSystemStatus(settings,{prerequisites:async()=>status,command:async()=>({exitCode:1,stdout:''}),version:'fixture-source',installedVersion:'fixture-artifact',pid:42,uptime:()=>120}),evidence:()=>evidence?[{accountId:account.id,clientId:'fixture-client',service:'mail',authorizedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),reads:{mail_list_mailboxes:new Date().toISOString()}}]:[],presentation:mailAdminPresentation,capabilities:()=>policy,updateCapabilities:async next=>{Object.assign(policy,next);evidence=false;return policy;},modules:[{id:'calendar',title:'Calendar',fields:['read','write','schedule','share'].map(id=>({id,label:id})),capabilities:()=>calendarPolicy,updateCapabilities:async next=>{calendarPolicy=next as typeof calendarPolicy;evidence=false;return calendarPolicy;}}],validateCredential:async credential=>{if(credential.appPassword==='invalid-dummy')throw Error('Fixture invalid');}});
const close=()=>{server.stop(true);store.close();rmSync(dir,{recursive:true,force:true});process.exit(0);};process.on('SIGTERM',close);process.on('SIGINT',close);
console.log(server.url.origin);
