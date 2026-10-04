import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema,type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {withInvocationContext,type InvocationContext} from '../modules/context.js';
import type {ModuleRuntime} from '../modules/runtime.js';
/** Protocol host; authorization and availability derive exclusively from registrations. */
export function createServer(runtime:ModuleRuntime,publicUrl:string,scopes:ReadonlySet<string>,track:(operation:()=>Promise<CallToolResult>)=>Promise<CallToolResult>=operation=>operation(),context?:InvocationContext){
 const server=new Server({name:'icloud',version:'0.1.23'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:runtime.listTools()}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  const entry=runtime.tool(request.params.name);
  if(!entry)return {isError:true,content:[{type:'text',text:'Unknown or unavailable tool'}]};
  const input=request.params.arguments??{},invalid=entry.validateIntent?.(input);if(invalid)return invalid;
  if(entry.requiredScopes.some(scope=>!scopes.has(scope))){
   const allowed=new Set(runtime.allowedScopes);
   const stepUpScopes=[...new Set([...scopes].filter(scope=>allowed.has(scope)).concat([...entry.requiredScopes]))].sort().join(' ');
   const metadata=new URL('/.well-known/oauth-protected-resource/icloud/mcp',publicUrl).href;
   return {isError:true,_meta:{'mcp/www_authenticate':`Bearer error="insufficient_scope", error_description="Additional permission required", resource_metadata="${metadata}", scope="${stepUpScopes}"`},content:[{type:'text',text:'Additional permission required'}]};
  }
  return track(()=>context?withInvocationContext(context,()=>runtime.invoke(entry,input,scopes)):runtime.invoke(entry,input,scopes));
 });return server;
}
