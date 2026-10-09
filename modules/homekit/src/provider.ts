import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {isAbsolute,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {nativeEventResourceUri,type EventAddress} from './resources.js';
import {HOMEKIT_PROTOCOL_VERSION,HOMEKIT_SUPPORTED_PROTOCOLS,inspectHomeKitHelper} from './preflight.js';
import {EventSubscriptions} from './subscriptions.js';
export class HomeKitError extends Error {constructor(readonly code:string,readonly nativeOutcome?:unknown){super(code);}}
export interface NativeHomeKitProvider {call(tool:string,input:unknown,signal?:AbortSignal,beforeDispatch?:()=>Promise<void>):Promise<unknown>;subscribeEvents?(address:EventAddress,listener:{updated:()=>void;failed:(error:HomeKitError)=>void}):Promise<()=>Promise<void>>;readEvents?(address:EventAddress,signal?:AbortSignal):Promise<unknown>;dispose():Promise<void>}
export interface NativeSettings {python:string;app:string;sourceSHA256:string;signingTeam:string;localUserId:number;stateDirectory:string;lifecycle:boolean;control?:boolean;homeId?:string;timeoutMs?:number;adapter?:string}
const envelope=z.object({jsonrpc:z.literal('2.0'),id:z.number().int(),result:z.unknown().optional(),error:z.unknown().optional()}).passthrough();
const initialization=z.object({serverInfo:z.object({name:z.enum(['homekit-experiment-probe','icloud-homekit-helper']),version:z.enum(HOMEKIT_SUPPORTED_PROTOCOLS),sourceSHA256:z.string().regex(/^[a-f0-9]{64}$/)}).passthrough()}).passthrough();
const health=z.object({ready:z.boolean(),authorized:z.boolean(),localUserId:z.number().int().nonnegative(),physicalControlEnabled:z.boolean()}).passthrough();
const toolResult=z.object({isError:z.boolean().optional(),content:z.array(z.object({type:z.literal('text'),text:z.string().max(8*1024*1024)}).strict()).length(1)}).passthrough();
const allowed=new Set(['homekit_status','homekit_list','homekit_automation_inventory','homekit_lifecycle_preview','homekit_read','homekit_lifecycle_mutate','homekit_lifecycle_recover_creation','homekit_control_preview','homekit_control_apply','homekit_control_outcome']);
/** No shell/network port; signed bundle via LaunchServices. Never retry a lost response. */
export class StdioHomeKitProvider implements NativeHomeKitProvider {
 private process?:Bun.Subprocess<'pipe','pipe','pipe'>;
 private starting?:Promise<void>;private closed=false;private counter=0;
 private pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
 private failure?:HomeKitError;
 private readonly subscriptions=new EventSubscriptions((method,uri)=>this.request(method,{uri}));
 constructor(private readonly settings:NativeSettings){if(settings.control&&!settings.lifecycle)throw new HomeKitError('invalid_helper_configuration');if(![settings.python,settings.app,settings.stateDirectory].every(isAbsolute)||!settings.app.endsWith('.app')||! /^[A-Z0-9]{10}$/.test(settings.signingTeam)||! /^[a-f0-9]{64}$/.test(settings.sourceSHA256))throw new HomeKitError('invalid_helper_configuration');}
 private fail(code:string){this.failure=new HomeKitError(code);this.subscriptions.fail(this.failure);for(const request of this.pending.values())request.reject(this.failure);this.pending.clear();}
 private async start(){
  if(this.closed)throw new HomeKitError('provider_disposed');
  const verified=await inspectHomeKitHelper({native_app:this.settings.app,python:this.settings.python,source_sha256:this.settings.sourceSHA256,signing_team:this.settings.signingTeam});if(verified.status!=='pass')throw new HomeKitError('helper_preflight_'+verified.stage);
  if(this.settings.control&&!['0.15.0',HOMEKIT_PROTOCOL_VERSION].includes(verified.protocolVersion))throw new HomeKitError('helper_control_protocol_required');
  if(this.closed)throw new HomeKitError('provider_disposed');
  await mkdir(this.settings.stateDirectory,{recursive:true,mode:0o700});
  const directory=dirname(fileURLToPath(import.meta.url));const adjacent=join(directory,'stdio-adapter.py');const adapter=this.settings.adapter??(existsSync(adjacent)?adjacent:join(directory,'homekit/stdio-adapter.py'));if(!isAbsolute(adapter)||!existsSync(adapter))throw new HomeKitError('packaged_adapter_missing');
  const mode=['--mode',this.settings.control?'control':this.settings.lifecycle?'definitions':this.settings.homeId?'read':'enrollment',...(this.settings.homeId?['--home-id',this.settings.homeId]:[]),...(this.settings.lifecycle?['--lifecycle-directory',join(this.settings.stateDirectory,'ledger')]:[])];
  const child=Bun.spawn([this.settings.python,adapter,'--app',this.settings.app,'--state-directory',join(this.settings.stateDirectory,'sessions'),...mode],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});this.process=child;
  void this.read(child.stdout).catch(e=>this.fail(e instanceof HomeKitError?e.code:'invalid_helper_output'));
  void this.stderr(child.stderr).catch(()=>{});
  void child.exited.then(()=>this.fail('helper_disconnected'));
  try{
   const initial=initialization.parse(await this.request('initialize',{}));
   if(this.settings.control&&!['0.15.0',HOMEKIT_PROTOCOL_VERSION].includes(initial.serverInfo.version))throw new HomeKitError('helper_control_protocol_required');
   if(initial.serverInfo.name!==(initial.serverInfo.version==='1.0.0'?'icloud-homekit-helper':'homekit-experiment-probe'))throw new HomeKitError('helper_identity_mismatch');
   if(initial.serverInfo.sourceSHA256!==this.settings.sourceSHA256)throw new HomeKitError('helper_source_mismatch');
   const deadline=Date.now()+Math.min(this.settings.timeoutMs??30000,15000);
   while(true){const status=health.parse(await this.raw('homekit_status',{}));if(status.physicalControlEnabled!==!!this.settings.control)throw new HomeKitError('helper_control_mode_mismatch');if(status.localUserId!==this.settings.localUserId)throw new HomeKitError('helper_user_mismatch');if(status.authorized&&status.ready)break;if(Date.now()>deadline)throw new HomeKitError('helper_not_authorized_or_ready');await new Promise(r=>setTimeout(r,100));}
  }catch(error){await this.stop();throw error instanceof HomeKitError?error:new HomeKitError('invalid_helper_handshake');}
 }
 private async read(stream:ReadableStream<Uint8Array>){
  const reader=stream.getReader();let buffer=Buffer.alloc(0);
  try{while(true){const item=await reader.read();if(item.done)break;buffer=Buffer.concat([buffer,item.value]);if(buffer.length>8*1024*1024)throw new HomeKitError('helper_output_limit');let newline:number;while((newline=buffer.indexOf(10))>=0){const line=buffer.subarray(0,newline);buffer=buffer.subarray(newline+1);if(!line.length)continue;let raw:unknown;try{raw=JSON.parse(line.toString());}catch{throw new HomeKitError('invalid_helper_output');}if(!raw||typeof raw!=='object')throw new HomeKitError('invalid_helper_output');if(!Object.hasOwn(raw,'id')){const notification=z.object({jsonrpc:z.literal('2.0'),method:z.literal('notifications/resources/updated'),params:z.object({uri:z.string().max(1024)}).strict()}).strict().safeParse(raw);if(notification.success)this.subscriptions.updated(notification.data.params.uri);continue;}const response=envelope.parse(raw),pending=this.pending.get(response.id);if(!pending)continue;this.pending.delete(response.id);if(response.error!==undefined)pending.reject(new HomeKitError('native_protocol_error'));else pending.resolve(response.result);}}}finally{reader.releaseLock();}
 }
 private async stderr(stream:ReadableStream<Uint8Array>){const reader=stream.getReader();let kept=0;const chunks:Uint8Array[]=[];try{while(true){const item=await reader.read();if(item.done)break;if(kept<65536){const chunk=item.value.subarray(0,65536-kept);chunks.push(chunk);kept+=chunk.length;}}await writeFile(join(this.settings.stateDirectory,'adapter-stderr.log'),Buffer.concat(chunks),{mode:0o600});}finally{reader.releaseLock();}}
 private async request(method:string,params:unknown,signal?:AbortSignal):Promise<unknown>{
  const child=this.process;if(!child||this.failure||this.closed)throw this.failure??new HomeKitError('provider_unavailable');
  if(signal?.aborted)throw new HomeKitError('request_cancelled');
  const id=++this.counter,encoded=JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n';if(Buffer.byteLength(encoded)>65536)throw new HomeKitError('native_input_limit');
  return new Promise((resolve,reject)=>{
   const finish=(error?:Error,value?:unknown)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.pending.delete(id);error?reject(error):resolve(value);};
   const abort=()=>finish(new HomeKitError('native_outcome_unknown'));
   const timer=setTimeout(()=>finish(new HomeKitError('native_outcome_unknown')),this.settings.timeoutMs??30000);
   this.pending.set(id,{resolve:value=>finish(undefined,value),reject:error=>finish(error)});signal?.addEventListener('abort',abort,{once:true});
   try{child.stdin.write(encoded);child.stdin.flush();}catch{finish(new HomeKitError('helper_disconnected'));}
  });
 }
 private async raw(tool:string,input:unknown,signal?:AbortSignal){return decodeNativeToolResult(tool,await this.request('tools/call',{name:tool,arguments:input},signal));}
 async call(tool:string,input:unknown,signal?:AbortSignal,beforeDispatch?:()=>Promise<void>){if(!allowed.has(tool)||['homekit_lifecycle_mutate','homekit_lifecycle_recover_creation'].includes(tool)&&!this.settings.lifecycle||tool.startsWith('homekit_control_')&&(!this.settings.lifecycle||!this.settings.control))throw new HomeKitError('native_tool_denied');this.starting??=this.start();await this.starting;await beforeDispatch?.();if(this.closed||this.failure)throw this.failure??new HomeKitError('provider_disposed');return this.raw(tool,input,signal);}
 async subscribeEvents(address:EventAddress,listener:{updated:()=>void;failed:(error:HomeKitError)=>void}){this.starting??=this.start();await this.starting;return this.subscriptions.subscribe(address,listener);}
 async readEvents(address:EventAddress,signal?:AbortSignal){
  const uri=nativeEventResourceUri(address);this.starting??=this.start();await this.starting;
  const result=z.object({contents:z.array(z.object({uri:z.literal(uri),mimeType:z.literal('application/json'),text:z.string().max(8*1024*1024)}).strict()).length(1)}).strict().parse(await this.request('resources/read',{uri},signal));
  try{return JSON.parse(result.contents[0]!.text);}catch{throw new HomeKitError('invalid_native_result');}
 }
 private async stop(){const child=this.process;if(!child)return;this.process=undefined;child.stdin.end();const done=await Promise.race([child.exited.then(()=>true),new Promise<false>(r=>setTimeout(()=>r(false),8000))]);if(!done){child.kill('SIGTERM');}const exit=await child.exited;this.fail('provider_disposed');if(exit!==0)throw new HomeKitError('helper_cleanup_unverified');}
 async dispose(){this.closed=true;await this.starting?.catch(()=>{});await this.stop();}
}

/** Preserve bounded definition rejection evidence; do not expose unrelated native failures. */
export function decodeNativeToolResult(tool:string,raw:unknown):unknown {
 const result=toolResult.parse(raw);let value:unknown;
 try{value=JSON.parse(result.content[0]!.text);}catch{throw new HomeKitError('invalid_native_result');}
 if(tool==='homekit_control_apply')return{isError:result.isError??false,payload:value};
 if(result.isError){if(tool==='homekit_lifecycle_mutate'&&Buffer.byteLength(JSON.stringify(value))>65536)throw new HomeKitError('native_result_limit');throw new HomeKitError('native_operation_rejected',tool==='homekit_lifecycle_mutate'?value:undefined);}
 return value;
}
