// Explicit browser fixture: real UI/assets with synthetic provider responses.
import{setupPage}from'../../icloud/dist/admin/page.js';
import{resolve}from'node:path';
let enrolled=false;
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.WIZARD_PREVIEW_PORT??0),async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/icloud/setup')return new Response(setupPage({enrolled,ready:true,admin:false}),{headers:{'content-type':'text/html'}});
 if(path==='/icloud/setup/status')return Response.json({ready:true,enrolled,passkeyRegistered:true,bootstrapAuthorized:true,prerequisites:{installed:true,authenticated:true,online:true,privateReachable:true}});
 if(path==='/icloud/setup/begin'&&request.method==='POST')return Response.json({ready:true,passkeyRegistered:true});
 if(path==='/icloud/setup/complete'&&request.method==='POST'){
  const body:unknown=await request.json();
  if(typeof body==='object'&&body!==null&&'appPassword'in body&&body.appPassword==='fixture-success'){enrolled=true;return Response.json({enrolled:true});}
  return Response.json({error:'PROVIDER_VALIDATION_FAILED'},{status:422});
 }
 if(path==='/icloud/assets/admin-browser.js'||path==='/icloud/assets/auth-browser.js')return new Response(Bun.file(resolve(import.meta.dir,'../../icloud/dist'+path.replace('/icloud',''))),{headers:{'content-type':'text/javascript'}});
 return new Response('Not found',{status:404});
}});
console.log(server.url.origin+'/icloud/setup');
for(const signal of['SIGINT','SIGTERM']as const)process.once(signal,()=>{void server.stop(true).then(()=>process.exit(0));});
