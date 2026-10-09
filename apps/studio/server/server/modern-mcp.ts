import {createMcpHandler,isLegacyRequest,type McpHttpHandler} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {Principal} from '@decompozr/account/server';
import type {ModuleRuntime} from '../modules/runtime.js';
import {withInvocationContext} from '../modules/context.js';
import {createModernServer} from '../mcp/modern-server.js';
import type {HttpLifecycle} from './lifecycle.js';
import type {IngressContext} from './listener.js';
import type {ReadinessEvidence} from '../admin/evidence.js';
const identity=(p:Principal)=>JSON.stringify([p.subject,p.accountId??null,[...p.scopes].sort()]);
const listen=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string().max(128),z.number().int()]),method:z.literal('subscriptions/listen'),params:z.object({_meta:z.record(z.unknown()),notifications:z.object({toolsListChanged:z.boolean().optional(),promptsListChanged:z.boolean().optional(),resourcesListChanged:z.boolean().optional(),resourceSubscriptions:z.array(z.string().max(1024)).max(32).optional()}).strict()}).passthrough()}).passthrough();
/** Each modern listen owns a private SDK bus, exact principal and native feed removers. */
export class ModernMcp {
 private readonly active=new Set<()=>Promise<void>>();private starting=0;
 constructor(private readonly runtime:ModuleRuntime,private readonly publicUrl:string,private readonly verify:(authorization:string|undefined)=>Promise<Principal>,private readonly lifecycle:HttpLifecycle,private readonly options:{limit?:number;pollMs?:number;ttlMs?:number;notificationLimit?:number}={},private readonly evidence?:ReadinessEvidence){lifecycle.onDrain(()=>this.dispose());}
 async handle(request:Request,ingress:IngressContext,principal:Principal,body:unknown):Promise<Response|undefined>{
  if(await isLegacyRequest(request,body))return;
  const isListen=!!body&&typeof body==='object'&&'method'in body&&body.method==='subscriptions/listen';
  const parsed=isListen?listen.safeParse(body):undefined;
  const error=(code:number,message:string)=>Response.json({jsonrpc:'2.0',id:body&&typeof body==='object'&&'id'in body?body.id:null,error:{code,message}},{status:200});
  if(parsed&&!parsed.success)return error(-32602,'Invalid subscription filter');
  if(isListen&&this.active.size+this.starting>=(this.options.limit??32))return error(-32603,'Subscription limit reached');
  const uris=parsed?.success?[...new Set(parsed.data.params.notifications.resourceSubscriptions??[])]:[];
  const expected=identity(principal),authorization=request.headers.get('authorization')??undefined,start=Date.now(),abort=new AbortController(),removers:Array<()=>Promise<void>>=[],pending=new Set<string>();
  let closed=false,handler:McpHttpHandler|undefined,timer:ReturnType<typeof setInterval>|undefined,count=0,closing:Promise<void>|undefined;
  const close=():Promise<void>=>{if(closing)return closing;closed=true;abort.abort();if(timer)clearInterval(timer);this.active.delete(close);closing=Promise.allSettled([handler?.close(),...removers.map(remove=>remove())]).then(()=>{});return closing;};
  const authorize=async()=>{if(closed||this.lifecycle.isDraining||isListen&&(!this.runtime.hasResourceSubscriptions||Date.now()-start>(this.options.ttlMs??300000)))throw Error('Subscription unavailable');if(identity(await this.verify(authorization))!==expected)throw Error('Authorization changed');for(const uri of uris)await withInvocationContext(context,()=>this.runtime.authorizeResourceSubscription(uri,principal.scopes));};
  const context={ownerId:principal.subject,accountId:principal.accountId,signal:abort.signal,authorize};
  handler=createMcpHandler(()=>createModernServer(this.runtime,this.publicUrl,principal,context,run=>this.lifecycle.track(run),this.evidence),{legacy:'reject',maxSubscriptions:1,keepAliveMs:15000,maxRequestBodySize:256*1024});
  ingress.onClose?.(()=>{void close();});
  if(isListen)this.starting++;
  try{
   await authorize();
   if(parsed?.success){
    for(const uri of uris){
     const updated=()=>{if(closed||pending.has(uri))return;pending.add(uri);void authorize().then(()=>{if(closed)return;if(++count>(this.options.notificationLimit??256)){void close();return;}handler!.notify.resourceUpdated(uri);}).catch(()=>close()).finally(()=>pending.delete(uri));};
     const remove=await withInvocationContext(context,()=>this.runtime.subscribeResource(uri,principal.scopes,updated,()=>{void close();}));
     if(closed){await remove();throw Error('Subscription closed');}removers.push(remove);
    }
   }
   const response=await handler.fetch(request,{parsedBody:body});
   if(isListen&&response.headers.get('content-type')?.includes('text/event-stream')){
    this.active.add(close);ingress.onFinish(()=>{void close();});
    timer=setInterval(()=>{void authorize().catch(()=>close());},this.options.pollMs??30000);timer.unref();
   }else await close();
   return response;
  }catch{await close();return error(-32602,'Resource or authorization unavailable');}
  finally{if(isListen)this.starting--;}
 }
 async dispose(){await Promise.allSettled([...this.active].map(close=>close()));}
}
