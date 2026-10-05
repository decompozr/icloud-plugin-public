import type {AppSettings} from '../server/settings.js';
import type {TailscaleStatus} from './handler.js';
import {prerequisites} from '../server/prerequisites.js';

const MAX_OUTPUT=64*1024;
const TIMEOUT_MS=3000;
const SERVICE_LABEL='local.icloud-mail-mcp';
type ObservedState='observed'|'unknown';
export interface SystemRouteStatus {path:string;mapped:boolean|null}
export interface SystemOriginStatus {origin:string;port:number;funnelAllowed:boolean|null;routes:SystemRouteStatus[]}
export interface SystemStatus {
 checkedAt:string;
 process:{state:'running';pid:number;uptimeSeconds:number;version:string|null;runtime:string};
 installed:{state:'unknown'|'verified';version:string|null};
 connectivity:{state:ObservedState;installed:boolean|null;authenticated:boolean|null;online:boolean|null;privateReachable:boolean|null};
 exposure:{state:ObservedState;public:SystemOriginStatus;private:SystemOriginStatus;externalReachability:'unknown'};
 supervision:{state:'verified'|'unknown';label:string;matchesCurrentProcess:boolean|null};
 logs:{state:'unavailable'};
}
export interface StatusCommandResult {exitCode:number;stdout:string}
export interface SystemStatusDependencies {
 prerequisites?:(settings:AppSettings)=>Promise<TailscaleStatus>;
 command?:(argv:readonly string[])=>Promise<StatusCommandResult>;
 now?:()=>number;pid?:number;uptime?:()=>number;runtimeVersion?:string;version?:string;
 /** Only supply this after verifying the selected artifact metadata; source version is insufficient. */
 installedVersion?:string;
 platform?:string;uid?:number;
}
/** Fixed arguments, a wall-clock deadline and bounded stdout; never return stderr or raw output. */
async function boundedCommand(argv:readonly string[]):Promise<StatusCommandResult>{
 const child=Bun.spawn([...argv],{stdout:'pipe',stderr:'ignore'});
 const kill=()=>{try{child.kill();}catch{}};
 const reader=child.stdout.getReader();const chunks:Uint8Array[]=[];let length=0;
 let timer:ReturnType<typeof setTimeout>;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{kill();reject(new Error('Diagnostic deadline'));},TIMEOUT_MS);});
 try{
  while(true){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;length+=part.value.byteLength;if(length>MAX_OUTPUT){kill();throw new Error('Output limit');}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return{exitCode:await Promise.race([child.exited,deadline]),stdout:new TextDecoder().decode(bytes)};
 }finally{clearTimeout(timer!);void reader.cancel().catch(()=>{});reader.releaseLock();}

}
function record(value:unknown):Record<string,unknown>|undefined{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
function originStatus(origin:string,paths:string[]):SystemOriginStatus {
 const url=new URL(origin);return{origin,port:Number(url.port||443),funnelAllowed:null,routes:paths.map(path=>({path,mapped:null}))};
}
function applyServe(value:unknown,result:SystemStatus,settings:AppSettings):boolean {
 const config=record(value);if(!config)return false;
 // A missing section is a valid disabled configuration; malformed sections stay unknown.
 const web=config.Web===undefined?{}:record(config.Web);const funnel=config.AllowFunnel===undefined?{}:record(config.AllowFunnel);const tcp=config.TCP===undefined?{}:record(config.TCP);
 if(!web||!funnel||!tcp)return false;
 for(const [target,backendPort] of [[result.exposure.public,settings.public_port],[result.exposure.private,settings.private_port]] as const){
  const hostPort=new URL(target.origin).hostname+':'+target.port;
  const endpoint=web[hostPort]===undefined?{}:record(web[hostPort]);if(!endpoint)return false;
  if(web[hostPort]!==undefined){const listener=record(tcp[String(target.port)]);if(!listener||listener.HTTPS!==true)return false;}
  const handlers=endpoint.Handlers===undefined?{}:record(endpoint.Handlers);if(!handlers)return false;
  const allowed=funnel[hostPort];if(allowed!==undefined&&typeof allowed!=='boolean')return false;
  target.funnelAllowed=allowed===true;
  for(const route of target.routes){
   const handler=record(handlers[route.path]);const proxy=handler?.Proxy;
   // Compare only exact configured loopback destinations; ignore all other inventory.
   const destinations=[`http://127.0.0.1:${backendPort}`,`http://[::1]:${backendPort}`].flatMap(base=>route.path==='/'?[base,base+'/']:[base+route.path,base+route.path+'/']);
   route.mapped=typeof proxy==='string'&&destinations.includes(proxy);
  }
 }
 return true;
}
/** On-demand observations only. External MCP success belongs to account/client evidence. */
export async function createSystemStatus(settings:AppSettings,deps:SystemStatusDependencies={}):Promise<SystemStatus>{
 const result:SystemStatus={checkedAt:new Date((deps.now??Date.now)()).toISOString(),process:{state:'running',pid:deps.pid??process.pid,uptimeSeconds:Math.max(0,Math.floor((deps.uptime??(()=>process.uptime()))())),version:deps.version??null,runtime:'Bun '+(deps.runtimeVersion??Bun.version)},installed:{state:deps.installedVersion?'verified':'unknown',version:deps.installedVersion??null},connectivity:{state:'unknown',installed:null,authenticated:null,online:null,privateReachable:null},exposure:{state:'unknown',public:originStatus(settings.public_origin,['/icloud','/.well-known/oauth-authorization-server/icloud/auth','/.well-known/oauth-protected-resource/icloud/mcp']),private:originStatus(settings.private_origin,['/icloud','/']),externalReachability:'unknown'},supervision:{state:'unknown',label:SERVICE_LABEL,matchesCurrentProcess:null},logs:{state:'unavailable'}};
 const command=deps.command??boundedCommand;
 const safeCommand=async(argv:readonly string[])=>{const value=await command(argv);if(value.stdout.length>MAX_OUTPUT)throw new Error('Output limit');return value;};
 await Promise.all([
  (async()=>{try{const value=await(deps.prerequisites??prerequisites)(settings);if(['installed','authenticated','online','privateReachable'].every(key=>typeof value[key as keyof TailscaleStatus]==='boolean'))result.connectivity={state:'observed',installed:value.installed,authenticated:value.authenticated,online:value.online,privateReachable:value.privateReachable};}catch{}})(),
  (async()=>{if(settings.runtime_mode!=='native')return;try{const value=await safeCommand([settings.tailscale_binary,'serve','status','--json']);if(value.exitCode===0&&applyServe(JSON.parse(value.stdout),result,settings))result.exposure.state='observed';else throw new Error('Unverified config');}catch{for(const origin of [result.exposure.public,result.exposure.private]){origin.funnelAllowed=null;for(const route of origin.routes)route.mapped=null;}}})(),
  (async()=>{const uid=deps.uid??process.getuid?.();if((deps.platform??process.platform)!=='darwin'||uid===undefined)return;try{const value=await safeCommand(['/bin/launchctl','print',`gui/${uid}/${SERVICE_LABEL}`]);if(value.exitCode!==0)return;const state=/^\s*state = running\s*$/m.test(value.stdout);const pid=/^\s*pid = (\d+)\s*$/m.exec(value.stdout);if(state&&pid&&Number(pid[1])===result.process.pid)result.supervision={state:'verified',label:SERVICE_LABEL,matchesCurrentProcess:true};}catch{}})(),
 ]);
 return result;
}
