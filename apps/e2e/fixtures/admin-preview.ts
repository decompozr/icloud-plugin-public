// Local-only visual/interaction fixture. No account credentials or provider calls.
import {setupPage} from '../../icloud/dist/admin/page.js';
import {mailAdminPresentation} from '../../icloud/dist/mail/admin.js';
import {renderAuthPage} from '../../icloud/dist/auth/pages.js';
import {resolve} from 'node:path';
let calendar={read:true,write:true,schedule:false,share:false};
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/icloud/admin')return new Response(setupPage({enrolled:true,ready:true,admin:true,presentation:mailAdminPresentation,modules:[{id:'calendar',title:'Calendar',fields:[{id:'read',label:'Read calendars'},{id:'write',label:'Manage calendars and events'},{id:'schedule',label:'Send invitations and responses'},{id:'share',label:'Share calendars'}]}]}),{headers:{'content-type':'text/html'}});
 if(path==='/icloud/admin/status')return Response.json({accounts:[{id:'fixture',user:'preview@example.com',label:'Preview account',credentialStored:true}],capabilities:{read:true,write:true,send:false,unsubscribe:false},modules:{calendar}});
 if(path==='/icloud/admin/modules/calendar/capabilities'&&request.method==='POST'){const body=await request.json() as {policy:typeof calendar;confirmEnable:boolean};calendar=body.policy;return Response.json({ok:true});}
 if(path==='/icloud/sign-in'||path==='/icloud/consent')return new Response(renderAuthPage(path.endsWith('consent')?'consent':'sign-in'),{headers:{'content-type':'text/html'}});
 if(['/icloud/assets/admin-browser.js','/icloud/assets/auth-browser.js','/icloud/assets/inter.ttf'].includes(path))return new Response(Bun.file(resolve(import.meta.dir,'../../icloud/dist'+path.replace('/icloud',''))));
 return new Response('Preview fixture: operation unavailable',{status:404});
}});
console.log(server.url.origin+'/icloud/admin');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void server.stop(true).then(()=>process.exit(0));});
