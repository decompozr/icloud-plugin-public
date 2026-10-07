import {Server,ProtocolError,ProtocolErrorCode,specTypeSchemas} from '@modelcontextprotocol/server';
import type {ModuleRuntime} from '../modules/runtime.js';
import {withInvocationContext,type InvocationContext} from '../modules/context.js';
import {implementationVersion} from './server.js';
import type {ReadinessEvidence} from '../admin/evidence.js';
import type {Principal} from '../../../../modules/account/dist/index.js';
/** Modern wire framing belongs to the official SDK; domain policy stays in ModuleRuntime. */
export function createModernServer(runtime:ModuleRuntime,publicUrl:string,principal:Principal,context:InvocationContext,track:<T>(run:()=>Promise<T>)=>Promise<T>,evidence?:ReadinessEvidence){
 const scopes=principal.scopes;
 const server=new Server({name:'icloud',version:implementationVersion()},{capabilities:{tools:{},...runtime.hasResources?{resources:{...runtime.hasResourceSubscriptions&&scopes.has('homekit.read')?{subscribe:true}:{}}}:{}}});
 const invoke=<T>(run:()=>Promise<T>)=>track(()=>withInvocationContext(context,run));
 server.setRequestHandler('tools/list',async()=>({tools:runtime.listTools().map(tool=>{const parsed=specTypeSchemas.Tool["~standard"].validate(tool);if(parsed.issues)throw Error("Invalid tool registration");return parsed.value;})}));
 if(runtime.hasResources){
 server.setRequestHandler('resources/list',async()=>({resources:[]}));
 server.setRequestHandler('resources/templates/list',async()=>({resourceTemplates:await invoke(()=>runtime.resourceTemplates(scopes))}));
 server.setRequestHandler('resources/read',async request=>{try{return await invoke(()=>runtime.readResource(request.params.uri,scopes));}catch{throw new ProtocolError(ProtocolErrorCode.InvalidParams,'Resource unavailable');}});
 }
 server.setRequestHandler('tools/call',async(request,extra)=>{
  const entry=runtime.tool(request.params.name);if(!entry)return{isError:true,content:[{type:'text',text:'Unknown or unavailable tool'}]};
  const input=request.params.arguments??{},invalid=entry.validateIntent?.(input);if(invalid)return invalid;
  if(entry.requiredScopes.some(scope=>!scopes.has(scope))){
   const allowed=new Set(runtime.allowedScopes),stepUpScopes=[...new Set([...scopes].filter(scope=>allowed.has(scope)).concat([...entry.requiredScopes]))].sort().join(' ');
   return{isError:true,_meta:{'mcp/www_authenticate':`Bearer error="insufficient_scope", error_description="Additional permission required", resource_metadata="${new URL('/.well-known/oauth-protected-resource/icloud/mcp',publicUrl).href}", scope="${stepUpScopes}"`},content:[{type:'text',text:'Additional permission required'}]};
  }
  const completed=evidence?.start(principal,request.params.name);
  return track(async()=>{const result=await withInvocationContext({...context,signal:AbortSignal.any([extra.mcpReq.signal,...context.signal?[context.signal]:[]])},()=>runtime.invoke(entry,input,scopes));completed?.(result);return result;});
 });return server;
}
