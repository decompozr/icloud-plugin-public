import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema,ListResourcesRequestSchema,ListResourceTemplatesRequestSchema,ReadResourceRequestSchema,SubscribeRequestSchema,UnsubscribeRequestSchema,McpError,ErrorCode,type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {withInvocationContext,type InvocationContext} from '../modules/context.js';
import type {ModuleRuntime} from '../modules/runtime.js';
/** Protocol host; authorization and availability derive exclusively from registrations. */
export function createServer(runtime:ModuleRuntime,publicUrl:string,scopes:ReadonlySet<string>,track:<T>(operation:()=>Promise<T>)=>Promise<T>=operation=>operation(),context?:InvocationContext,observeRead?:(tool:string)=>((result:CallToolResult)=>void)|undefined,resourceSession?:{authorize:()=>Promise<void>}){
 const server=new Server({name:'icloud',version:'0.1.26'},{capabilities:{tools:{},...runtime.hasResources?{resources:{...resourceSession?{subscribe:true}:{}}}:{}}});
 const disconnect=new AbortController();
 const subscriptions=new Map<string,()=>Promise<void>>();let resourceClosed=false;let resourceQueue:Promise<unknown>=Promise.resolve();
 let clearing:Promise<void>|undefined;const clearSubscriptions=()=>{if(clearing)return clearing;resourceClosed=true;const all=[...subscriptions.values()];subscriptions.clear();clearing=Promise.allSettled(all.map(remove=>remove())).then(()=>{});return clearing;};
 const close=server.close.bind(server);server.close=async()=>{disconnect.abort();await clearSubscriptions();await close();};
 const previousClose=server.onclose;server.onclose=()=>{disconnect.abort();previousClose?.();void clearSubscriptions();};
 if(resourceSession){
  const serial=<T>(operation:()=>Promise<T>)=>{const result=resourceQueue.then(operation);resourceQueue=result.catch(()=>{});return result;};
  server.setRequestHandler(SubscribeRequestSchema,async request=>serial(async()=>{const uri=request.params.uri;if(resourceClosed)throw new McpError(ErrorCode.InvalidRequest,'Session closed');await resourceSession.authorize();if(subscriptions.has(uri))return{};if(subscriptions.size>=32)throw new McpError(ErrorCode.InvalidParams,'Subscription limit');const updated=()=>{void resourceSession.authorize().then(()=>{if(!resourceClosed&&subscriptions.has(uri))return server.notification({method:'notifications/resources/updated',params:{uri}});}).catch(()=>{void clearSubscriptions().then(()=>server.close());});};const failed=()=>{void clearSubscriptions().then(()=>server.close());};let remove:()=>Promise<void>;try{remove=await(context?withInvocationContext(context,()=>runtime.subscribeResource(uri,scopes,updated,failed)):runtime.subscribeResource(uri,scopes,updated,failed));}catch{throw new McpError(ErrorCode.InvalidParams,'Resource unavailable');}if(resourceClosed){await remove();throw new McpError(ErrorCode.InvalidRequest,'Session closed');}subscriptions.set(uri,remove);return{};}));
  server.setRequestHandler(UnsubscribeRequestSchema,async request=>serial(async()=>{const remove=subscriptions.get(request.params.uri);subscriptions.delete(request.params.uri);await remove?.();return{};}));
 }
 if(runtime.hasResources){
  const invokeResource=<T>(run:()=>Promise<T>)=>track(()=>context?withInvocationContext(context,run):run());
  server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:[]}));
  server.setRequestHandler(ListResourceTemplatesRequestSchema,async()=>({resourceTemplates:await invokeResource(()=>runtime.resourceTemplates(scopes))}));
  server.setRequestHandler(ReadResourceRequestSchema,async request=>{try{return await invokeResource(()=>runtime.readResource(request.params.uri,scopes));}catch{throw new McpError(ErrorCode.InvalidParams,'Resource unavailable');}});
 }
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:runtime.listTools()}));
 server.setRequestHandler(CallToolRequestSchema,async (request,extra)=>{
  const entry=runtime.tool(request.params.name);
  if(!entry)return {isError:true,content:[{type:'text',text:'Unknown or unavailable tool'}]};
  const input=request.params.arguments??{},invalid=entry.validateIntent?.(input);if(invalid)return invalid;
  if(entry.requiredScopes.some(scope=>!scopes.has(scope))){
   const allowed=new Set(runtime.allowedScopes);
   const stepUpScopes=[...new Set([...scopes].filter(scope=>allowed.has(scope)).concat([...entry.requiredScopes]))].sort().join(' ');
   const metadata=new URL('/.well-known/oauth-protected-resource/icloud/mcp',publicUrl).href;
   return {isError:true,_meta:{'mcp/www_authenticate':`Bearer error="insufficient_scope", error_description="Additional permission required", resource_metadata="${metadata}", scope="${stepUpScopes}"`},content:[{type:'text',text:'Additional permission required'}]};
  }
  const completed=observeRead?.(request.params.name);
  return track(async()=>{const result=await(context?withInvocationContext({...context,signal:AbortSignal.any([extra.signal,disconnect.signal,...context.signal?[context.signal]:[]]),authorize:context.authorize??resourceSession?.authorize},()=>runtime.invoke(entry,input,scopes)):runtime.invoke(entry,input,scopes));completed?.(result);return result;});
 });return server;
}
