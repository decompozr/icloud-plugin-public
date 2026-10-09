import {z} from 'zod';
import type {TailscaleStatus} from '../admin/handler.js';
import type {AppSettings} from './settings.js';
import {openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
const status=z.object({BackendState:z.string(),Self:z.object({Online:z.boolean()}).optional()});
interface DiagnosticProcess {stdout:ReadableStream<Uint8Array>;exited:Promise<number>;kill:()=>unknown}
export interface PrerequisiteDependencies {
 spawn?:(argv:readonly string[])=>DiagnosticProcess;
 fetch?:(input:string,init?:RequestInit)=>Promise<Response>;
 /** Fixture override; production retains its five-second subprocess deadline. */
 commandTimeoutMs?:number;
}
async function boundedText(stream:ReadableStream<Uint8Array>,limit:number,signal:AbortSignal):Promise<string>{
 const reader=stream.getReader();const chunks:Uint8Array[]=[];let length=0;
 let abort:()=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('Diagnostic deadline'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 try{
  while(true){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;length+=part.value.byteLength;if(length>limit)throw new Error('Diagnostic output limit');chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
 }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
function boundedStatusFile(path:string):string {
 const fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);
 try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>64*1024)throw new Error('Invalid status file');
  const bytes=Buffer.alloc(64*1024+1);let length=0;
  while(length<bytes.length){const count=readSync(fd,bytes,length,bytes.length-length,null);if(count===0)break;length+=count;}
  if(length>64*1024)throw new Error('Status file limit');return bytes.subarray(0,length).toString('utf8');
 }finally{closeSync(fd);}
}
export async function prerequisites(settings:AppSettings,deps:PrerequisiteDependencies={}):Promise<TailscaleStatus>{
 const result:TailscaleStatus={installed:false,authenticated:false,online:false,privateReachable:false};
 if(settings.tailscale_status_file){
  try{const value=z.object({installed:z.boolean(),authenticated:z.boolean(),online:z.boolean(),checkedAt:z.string().datetime()}).parse(JSON.parse(boundedStatusFile(settings.tailscale_status_file)));const age=Date.now()-Date.parse(value.checkedAt);if(age>=-5000&&age<=60000)Object.assign(result,{installed:value.installed,authenticated:value.authenticated,online:value.online});}catch{}
 }else try{
  const process=(deps.spawn??(argv=>Bun.spawn([...argv],{stdout:'pipe',stderr:'ignore'})))([settings.tailscale_binary,'status','--json']);
  const controller=new AbortController();const kill=()=>{try{process.kill();}catch{}};let exited=false;const timeout=setTimeout(()=>{controller.abort();kill();},deps.commandTimeoutMs??5000);
  try{const text=await boundedText(process.stdout,64*1024,controller.signal);result.installed=true;const code=await Promise.race([process.exited,new Promise<never>((_,reject)=>{if(controller.signal.aborted)reject(new Error('Diagnostic deadline'));else controller.signal.addEventListener('abort',()=>reject(new Error('Diagnostic deadline')),{once:true});})]);exited=true;if(code===0){const value=status.parse(JSON.parse(text));result.authenticated=value.BackendState==='Running';result.online=value.Self?.Online===true;}}
  finally{clearTimeout(timeout);if(!exited)kill();}
 }catch{/* An unavailable binary is a setup prerequisite, never a startup failure. */}
 try{const signal=AbortSignal.timeout(3000);const response=await(deps.fetch??fetch)(settings.private_origin+'/icloud/setup/health',{signal,redirect:'error'});if(response.ok&&response.body)result.privateReachable=await boundedText(response.body,14,signal)==='icloud-private';else void response.body?.cancel().catch(()=>{});}catch{}
 return result;
}
