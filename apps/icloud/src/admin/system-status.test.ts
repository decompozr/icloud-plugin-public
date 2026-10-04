import {test,expect} from 'bun:test';
import {createSystemStatus,type SystemStatusDependencies} from './system-status.js';
import type {AppSettings} from '../server/settings.js';
const settings:AppSettings={public_origin:'https://example.ts.net',private_origin:'https://example.ts.net:8443',public_port:4100,private_port:4101,host:'127.0.0.1',runtime_mode:'native',state_directory:'/fixture',master_key_file:'/fixture/key',installation_marker:'/fixture/marker',allow_writes:false,allow_send:false,tailscale_binary:'/fixture/tailscale'};
const connectivity={installed:true,authenticated:true,online:true,privateReachable:false};
const fixture: SystemStatusDependencies={prerequisites:async()=>connectivity,command:async()=>({exitCode:1,stdout:''}),now:()=>1000,pid:42,uptime:()=>10.9,version:'0.1.26',runtimeVersion:'fixture',platform:'darwin',uid:501};
const config={TCP:{'443':{HTTPS:true},'8443':{HTTPS:true}},Web:{'example.ts.net:443':{Handlers:{'/icloud':{Proxy:'http://127.0.0.1:4100/icloud'},'/.well-known/oauth-authorization-server/icloud/auth':{Proxy:'http://127.0.0.1:4100/.well-known/oauth-authorization-server/icloud/auth'},'/.well-known/oauth-protected-resource/icloud/mcp':{Proxy:'http://127.0.0.1:4100/.well-known/oauth-protected-resource/icloud/mcp'}}},'example.ts.net:8443':{Handlers:{'/icloud':{Proxy:'http://127.0.0.1:4101/icloud'}}},'other-private-device:8463':{Handlers:{'/':{Proxy:'SECRET'}}}},AllowFunnel:{'example.ts.net:443':true}};
test('separates process, source version, installed artifact, connectivity and unverified exposure',async()=>{
 const value=await createSystemStatus(settings,fixture);
 expect(value.checkedAt).toBe('1970-01-01T00:00:01.000Z');expect(value.process).toEqual({state:'running',pid:42,uptimeSeconds:10,version:'0.1.26',runtime:'Bun fixture'});
 expect(value.installed).toEqual({state:'unknown',version:null});expect(value.connectivity).toEqual({state:'observed',...connectivity});expect(value.exposure.state).toBe('unknown');expect(value.exposure.externalReachability).toBe('unknown');expect(value.supervision.state).toBe('unknown');expect(value.logs.state).toBe('unavailable');
});
test('only sanitizes configured routes and ports; Funnel never proves outside reachability',async()=>{
 const calls:readonly string[][]=[];const value=await createSystemStatus(settings,{...fixture,command:async argv=>{(calls as string[][]).push([...argv]);return{exitCode:0,stdout:argv[1]==='serve'?JSON.stringify(config):' state = running\n pid = 42\n environment = SECRET'};}});
 expect(value.exposure.state).toBe('observed');expect(value.exposure.public.funnelAllowed).toBe(true);expect(value.exposure.public.routes.every(route=>route.mapped)).toBe(true);expect(value.exposure.private.funnelAllowed).toBe(false);expect(value.exposure.private.routes).toEqual([{path:'/icloud',mapped:true},{path:'/',mapped:false}]);expect(value.exposure.externalReachability).toBe('unknown');expect(value.supervision.matchesCurrentProcess).toBe(true);expect(JSON.stringify(value)).not.toContain('SECRET');expect(JSON.stringify(value)).not.toContain('other-private-device');expect(calls).toEqual([['/fixture/tailscale','serve','status','--json'],['/bin/launchctl','print','gui/501/local.icloud-mail-mcp']]);
});
test('unavailable, malformed and oversized config remain unknown, not false-green',async()=>{
 for(const stdout of ['bad','[]','null',JSON.stringify({Web:[]}),JSON.stringify({AllowFunnel:{'example.ts.net:443':'yes'}}),'x'.repeat(65537)]){
  const value=await createSystemStatus(settings,{...fixture,command:async()=>({exitCode:0,stdout})});expect(value.exposure.state).toBe('unknown');expect(value.exposure.public.funnelAllowed).toBeNull();expect(value.exposure.public.routes.every(route=>route.mapped===null)).toBe(true);
 }
});
test('disabled configuration is observed, wrong destinations do not match and no prefix guess',async()=>{
 const empty=await createSystemStatus(settings,{...fixture,command:async()=>({exitCode:0,stdout:'{}'})});expect(empty.exposure.state).toBe('observed');expect(empty.exposure.public.funnelAllowed).toBe(false);expect(empty.exposure.public.routes.every(route=>route.mapped===false)).toBe(true);
 const value=await createSystemStatus(settings,{...fixture,command:async()=>({exitCode:0,stdout:JSON.stringify({TCP:{'443':{HTTPS:true}},Web:{'example.ts.net:443':{Handlers:{'/':{Proxy:'http://127.0.0.1:4100'},'/icloud':{Proxy:'http://127.0.0.1:4101/icloud'}}}}})})});expect(value.exposure.public.routes.every(route=>!route.mapped)).toBe(true);
});
test('supervision requires a running service matching this process',async()=>{
 for(const stdout of ['state = waiting\npid = 42','state = running\npid = 41','state = running','pid = 42']){const value=await createSystemStatus(settings,{...fixture,command:async()=>({exitCode:0,stdout})});expect(value.supervision).toEqual({state:'unknown',label:'local.icloud-mail-mcp',matchesCurrentProcess:null});}
});
test('container does not inspect unrelated host Serve or supervision; snapshot failure stays unknown',async()=>{
 const calls:string[][]=[];const value=await createSystemStatus({...settings,runtime_mode:'container'},{...fixture,platform:'linux',prerequisites:async()=>{throw new Error('SECRET');},command:async argv=>{calls.push([...argv]);throw new Error('SECRET');}});expect(calls).toEqual([]);expect(value.connectivity.state).toBe('unknown');expect(value.exposure.state).toBe('unknown');expect(JSON.stringify(value)).not.toContain('SECRET');
});
test('drops extra prerequisite fields and records verified installed version only explicitly',async()=>{
 const value=await createSystemStatus(settings,{...fixture,installedVersion:'0.1.26',prerequisites:async()=>({...connectivity,inventory:'SECRET'})});expect(JSON.stringify(value)).not.toContain('SECRET');expect(value.installed).toEqual({state:'verified',version:'0.1.26'});
});

test('exact route destinations prevent misleading base or unrelated path mapping',async()=>{
 for(const proxy of ['http://127.0.0.1:4100','http://127.0.0.1:4100/other','http://127.0.0.1:4100/icloud-extra','http://remote:4100/icloud']){
  const value=await createSystemStatus(settings,{...fixture,command:async()=>({exitCode:0,stdout:JSON.stringify({TCP:{'443':{HTTPS:true}},Web:{'example.ts.net:443':{Handlers:{'/icloud':{Proxy:proxy}}}}})})});expect(value.exposure.public.routes[0]?.mapped).toBe(false);
 }
});
test('late malformed configuration clears earlier observations; thrown commands remain unknown',async()=>{
 for(const command of [async()=>({exitCode:0,stdout:JSON.stringify({...config,Web:{...config.Web,'example.ts.net:8443':{Handlers:[]}}})}),async()=>{throw new Error('SECRET');}]){
  const value=await createSystemStatus(settings,{...fixture,command});expect(value.exposure.state).toBe('unknown');expect(value.exposure.public.funnelAllowed).toBeNull();expect(value.exposure.public.routes.every(route=>route.mapped===null)).toBe(true);expect(value.supervision.state).toBe('unknown');expect(JSON.stringify(value)).not.toContain('SECRET');
 }
});

test('Web handlers cannot imply usable HTTPS mappings without matching TCP listener',async()=>{
 for(const TCP of [undefined,[],{}, {'443':{HTTPS:false}}, {'443':{TCPForward:'SECRET'}}]){
  const value=await createSystemStatus(settings,{...fixture,command:async()=>({exitCode:0,stdout:JSON.stringify({...config,TCP})})});expect(value.exposure.state).toBe('unknown');expect(value.exposure.public.funnelAllowed).toBeNull();expect(value.exposure.public.routes.every(route=>route.mapped===null)).toBe(true);
 }
});
