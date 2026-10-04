import {AccountRoutingError} from '../accounts/access.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema,type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {withInvocationContext,type InvocationContext} from '../modules/context.js';
import type {ModuleRuntime} from '../modules/runtime.js';
/** Protocol host; authorization and availability derive exclusively from registrations. */
export function createServer(runtime:ModuleRuntime,publicUrl:string,scopes:ReadonlySet<string>,track:(operation:()=>Promise<CallToolResult>)=>Promise<CallToolResult>=operation=>operation(),context?:InvocationContext,observeRead?:(tool:string,context?:InvocationContext)=>((result:CallToolResult)=>void)|undefined){
 const server=new Server({name:'icloud',version:'0.1.26'},{capabilities:{tools:{}}});
 const accountsTool={name:'icloud_accounts',description:'List only iCloud accounts authorized by this connection, stable account_id values, labels, registered service availability and eligible defaults. Select by user intent, an eligible configured default or the sole eligible account; ask the user when ambiguous. Availability never grants write/send permission.',inputSchema:{type:'object' as const,properties:{},additionalProperties:false},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false}};
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...(runtime.accounts?[accountsTool]:[]),...runtime.listTools(context)]}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  if(request.params.name==='icloud_accounts'&&runtime.accounts){
   if(Object.keys(request.params.arguments??{}).length)return {isError:true,content:[{type:'text',text:'No arguments expected'}]};
   const result=runtime.accounts.catalog(context);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
  }
  const entry=runtime.tool(request.params.name,context);
  if(!entry)return {isError:true,content:[{type:'text',text:'Unknown or unavailable tool'}]};
  let routed:ReturnType<ModuleRuntime['route']>;
  try{routed=runtime.route(entry,request.params.arguments??{},context);}catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({error:{code:error instanceof AccountRoutingError?error.code:'service_unavailable'},message:error instanceof AccountRoutingError&&error.code==='account_selection_required'?'Ask the user which eligible account to use; list choices with icloud_accounts.':'The selected account cannot be used. No other account was selected.'})}]};}
  const input=routed.input,invalid=entry.validateIntent?.(input);if(invalid)return invalid;
  if(entry.requiredScopes.some(scope=>!scopes.has(scope))){
   const allowed=new Set(runtime.allowedScopes);
   const stepUpScopes=[...new Set([...scopes].filter(scope=>allowed.has(scope)).concat([...entry.requiredScopes]))].sort().join(' ');
   const metadata=new URL('/.well-known/oauth-protected-resource/icloud/mcp',publicUrl).href;
   return {isError:true,_meta:{'mcp/www_authenticate':`Bearer error="insufficient_scope", error_description="Additional permission required", resource_metadata="${metadata}", scope="${stepUpScopes}"`},content:[{type:'text',text:'Additional permission required'}]};
  }
  const completed=observeRead?.(request.params.name,routed.context);
  return track(async()=>{const result=await(routed.context?withInvocationContext(routed.context,()=>runtime.invoke(entry,input,scopes)):runtime.invoke(entry,input,scopes));completed?.(result);return result;});
 });return server;
}
