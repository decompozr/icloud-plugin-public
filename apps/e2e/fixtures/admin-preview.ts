// Local-only visual/interaction fixture. No account credentials or provider calls.
import {createStudio} from '../../studio/dist/transport.js';
const studio=await createStudio(resolve(import.meta.dir,'../../icloud/dist/studio'));
import {mailAdminPresentation} from '../../icloud/dist/mail/admin.js';
import {resolve} from 'node:path';
let failCalendar=process.env.ICLOUD_PREVIEW_FAIL_CALENDAR==='1';
let mail={read:true,write:true,send:false,unsubscribe:false};
let calendar={read:true,write:true,schedule:false,share:false};
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
 const asset=await studio.asset(request);if(asset)return asset;const path=new URL(request.url).pathname;
 if(path==='/icloud/admin')return studio.admin(request,{enrolled:true,ready:true,admin:true,presentation:mailAdminPresentation,modules:[{id:'calendar',title:'Calendar',fields:[{id:'read',label:'Read calendars'},{id:'write',label:'Manage calendars and events'},{id:'schedule',label:'Send invitations and responses'},{id:'share',label:'Share calendars'}]}]});
 if(path==='/icloud/admin/status')return Response.json({accounts:[{id:'fixture',user:'preview@example.com',label:'Preview account',credentialStored:true}],capabilities:mail,modules:{calendar}});
 if(path==='/icloud/admin/capabilities'&&request.method==='POST'){const body=await request.json() as {policy:typeof mail};mail=body.policy;return Response.json({ok:true});}
 if(path==='/icloud/admin/modules/calendar/capabilities'&&request.method==='POST'){const body=await request.json() as {policy:typeof calendar;confirmEnable:boolean};if(failCalendar){failCalendar=false;return Response.json({error:'PROVIDER_VALIDATION_FAILED'},{status:502});}calendar=body.policy;return Response.json({ok:true});}
 if(path==='/icloud/sign-in'||path==='/icloud/consent')return studio.auth(request,path.endsWith('consent')?'consent':'sign-in',true,{});
 if(['/icloud/assets/inter.ttf'].includes(path))return new Response(Bun.file(resolve(import.meta.dir,'../../icloud/dist'+path.replace('/icloud',''))));
 return new Response('Preview fixture: operation unavailable',{status:404});
}});
console.log(server.url.origin+'/icloud/admin');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void server.stop(true).then(()=>process.exit(0));});
