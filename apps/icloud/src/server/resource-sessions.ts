import {randomUUID} from 'node:crypto';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type {JSONRPCMessage} from '@modelcontextprotocol/sdk/types.js';
import type {Principal} from '../../../../modules/account/dist/index.js';
import type {ModuleRuntime} from '../modules/runtime.js';
import {createServer} from '../mcp/server.js';
import type {HttpLifecycle} from './lifecycle.js';
import type {IngressContext} from './listener.js';
import type {ReadinessEvidence} from '../admin/evidence.js';
type Session={transport:WebStandardStreamableHTTPServerTransport;server:ReturnType<typeof createServer>;identity:string;authorization:string|undefined;touched:number;close:()=>Promise<void>};
const identity=(p:Principal)=>JSON.stringify([p.subject,p.accountId??null,[...p.scopes].sort()]);
/** Verified owner/account/scopes on every request and push; Web-standard transport. */
export class ResourceSessions {
 private readonly sessions=new Map<string,Session>();private starting=0;
 constructor(private readonly runtime:ModuleRuntime,private readonly publicUrl:string,private readonly verify:(authorization:string|undefined)=>Promise<Principal>,private readonly lifecycle:HttpLifecycle,private readonly options:{limit?:number;ttlMs?:number;pollMs?:number}={},private readonly evidence?:ReadinessEvidence){}
 async handle(request:Request,context:IngressContext,principal:Principal,body?:JSONRPCMessage):Promise<Response|undefined>{
  const id=request.headers.get('mcp-session-id');
  if(id){const session=this.sessions.get(id);if(!session)return Response.json({error:'Session unavailable'},{status:404});if(session.identity!==identity(principal))return Response.json({error:'Session principal mismatch'},{status:403});session.authorization=request.headers.get('authorization')??undefined;session.touched=Date.now();try{const response=await session.transport.handleRequest(request,{parsedBody:body});if(request.method==='GET'&&response.status===200)context.onClose?context.onClose(()=>{void session.close();}):context.onFinish(()=>{void session.close();});if(request.method==='DELETE')await session.close();return response;}catch{await session.close();return Response.json({error:'MCP request failed'},{status:500});}}
  if(request.method!=='POST'||!body||!('method'in body)||body.method!=='initialize'||!this.runtime.hasResourceSubscriptions||!principal.scopes.has('homekit.read'))return;
  if(this.sessions.size+this.starting>=(this.options.limit??32))return Response.json({error:'Resource session limit'},{status:503});this.starting++;
  const expected=identity(principal);let sessionId:string|undefined,closed=false,timer:ReturnType<typeof setInterval>|undefined;
  const authorize=async()=>{if(closed||!this.runtime.hasResourceSubscriptions||Date.now()-session.touched>(this.options.ttlMs??300000))throw Error('Resource session expired');if(identity(await this.verify(session.authorization))!==expected)throw Error('Resource principal changed');};
  const server=createServer(this.runtime,this.publicUrl,principal.scopes,operation=>this.lifecycle.track(operation),{ownerId:principal.subject,accountId:principal.accountId},tool=>this.evidence?.start(principal,tool),{authorize});
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),enableJsonResponse:true,onsessioninitialized:id=>{sessionId=id;if(closed)return;this.sessions.set(id,session);timer=setInterval(()=>{void authorize().catch(()=>session.close());},this.options.pollMs??30000);timer.unref();}});
  const session:Session={server,transport,identity:expected,authorization:request.headers.get('authorization')??undefined,touched:Date.now(),close:async()=>{if(closed)return;closed=true;if(timer)clearInterval(timer);if(sessionId)this.sessions.delete(sessionId);await Promise.allSettled([transport.close(),server.close()]);}};
  const previous=server.onclose;server.onclose=()=>{previous?.();void session.close();};
  try{await server.connect(transport);return await transport.handleRequest(request,{parsedBody:body});}catch{await session.close();return Response.json({error:'MCP request failed'},{status:500});}finally{this.starting--;if(!sessionId)await session.close();}
 }
}
