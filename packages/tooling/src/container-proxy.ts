import {z} from 'zod';
const inspectionSchema=z.array(z.object({status:z.object({state:z.string(),networks:z.array(z.object({ipv4Address:z.string()}))})})).min(1);
/** Host loopback proxy. Never configures Tailscale or accepts arbitrary destinations. */
export function createProxy(port:number,target:()=>Promise<string>){
 const pending=new Set<AbortController>();
 const server=Bun.serve({hostname:'127.0.0.1',port,async fetch(request){
  const incoming=new URL(request.url);
  const allowed=incoming.pathname==='/icloud'||incoming.pathname.startsWith('/icloud/')||['/.well-known/oauth-protected-resource/icloud/mcp','/.well-known/oauth-authorization-server/icloud/auth'].includes(incoming.pathname);
  if(!allowed)return new Response('Not found',{status:404});
  const abort=new AbortController();pending.add(abort);
  const cancel=()=>abort.abort();request.signal.addEventListener('abort',cancel,{once:true});
  let streaming=false;
  const finish=()=>{request.signal.removeEventListener('abort',cancel);pending.delete(abort);};
  try{
   const destination=new URL(await target());
   destination.pathname=incoming.pathname;destination.search=incoming.search;
   const headers=new Headers(request.headers);
   for(const key of ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'])headers.delete(key);
   const response=await fetch(destination,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',signal:abort.signal});
   const outgoing=new Headers(response.headers);outgoing.delete('transfer-encoding');outgoing.delete('connection');
   let body:ReadableStream<Uint8Array>|null=null;
   if(response.body){
    streaming=true;const reader=response.body.getReader();
    body=new ReadableStream<Uint8Array>({async pull(controller){try{const chunk=await reader.read();if(chunk.done){finish();controller.close();}else controller.enqueue(chunk.value);}catch(error){finish();controller.error(error);}},async cancel(){abort.abort();await reader.cancel().catch(()=>{});finish();}});
   }
   return new Response(body,{status:response.status,statusText:response.statusText,headers:outgoing});
  }catch{return Response.json({error:'UPSTREAM_UNAVAILABLE'},{status:502});}
  finally{if(!streaming)finish();}
 }});
 return{server,async close(){for(const abort of pending)abort.abort();await server.stop(true);}};
}
if(import.meta.main){
 const [container,publicValue='4100',privateValue='4101']=process.argv.slice(2);
 if(!container||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container))throw Error('Usage: container-proxy.ts container-name [public-port] [private-port]');
 const ports=[Number(publicValue),Number(privateValue)];
 if(ports.some(port=>!Number.isInteger(port)||port<1||port>65535)||ports[0]===ports[1])throw Error('Distinct valid loopback ports required');
 async function address(){
  const child=Bun.spawn(['container','inspect',container!],{stdout:'pipe',stderr:'ignore'});
  const timer=setTimeout(()=>child.kill(),3000);
  try{
   const data=inspectionSchema.parse(await new Response(child.stdout).json() as unknown);
   if(await child.exited!==0||data[0]?.status?.state!=='running')throw Error('Container is not running');
   const ip=data[0]?.status.networks[0]?.ipv4Address.split('/')[0];
   if(!ip||!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))throw Error('Missing container IPv4 address');
   return ip;
  }finally{clearTimeout(timer);}
 }
 const proxies=[createProxy(ports[0]!,async()=>`http://${await address()}:4100`),createProxy(ports[1]!,async()=>`http://${await address()}:4101`)];
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void Promise.all(proxies.map(proxy=>proxy.close())).then(()=>process.exit(0));});
 console.error('Separate public/private loopback proxies started. No Tailscale route was configured.');
}
