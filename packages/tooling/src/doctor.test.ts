import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {diagnose} from './doctor.js';
import type {AppSettings} from '../../../apps/icloud/src/server/settings.js';
test('doctor performs only bounded GET checks and does not follow redirects or expose file contents',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'icloud-doctor-'));const requests:string[]=[];
 await mkdir(join(dir,'state'),{mode:0o700});for(const name of ['key','marker'])await writeFile(join(dir,name),'SECRET-FILE-CANARY',{mode:0o600});
 const origin='https://configured.example.invalid';
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){requests.push(request.method+' '+new URL(request.url).pathname);const path=new URL(request.url).pathname;
 if(path==='/.well-known/oauth-protected-resource/icloud/mcp')return Response.json({resource:origin+'/icloud/mcp',authorization_servers:[origin+'/icloud/auth']});
 if(path==='/.well-known/oauth-authorization-server/icloud/auth')return Response.json({issuer:origin+'/icloud/auth',registration_endpoint:origin+'/icloud/auth/oauth2/register',scopes_supported:['mail.read','mail.send','PRIVATE-CANARY']});
 if(path==='/icloud/mcp')return new Response(null,{status:401,headers:{'www-authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/icloud/mcp"`}});
 if(path==='/icloud/setup/health')return new Response('healthy');return new Response(null,{status:404});}});
 const settings:AppSettings={public_origin:origin,private_origin:'https://configured.example.invalid:8443',public_port:4100,private_port:4101,host:'127.0.0.1',runtime_mode:'native',state_directory:join(dir,'state'),master_key_file:join(dir,'key'),installation_marker:join(dir,'marker'),allow_writes:true,allow_send:true,tailscale_binary:'unused'};
 try{const results=await diagnose(settings,url=>fetch(`http://127.0.0.1:${server.port}${new URL(url).pathname}`,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(1000)}));expect(results.every(r=>r.status==='pass')).toBe(true);expect(requests).toHaveLength(7);expect(requests.every(r=>r.startsWith('GET '))).toBe(true);expect(JSON.stringify(results)).not.toContain('CANARY');
 const redirects=await diagnose(settings,async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));expect(redirects.some(r=>r.status==='fail')).toBe(true);
 const badChallenge=await diagnose(settings,async()=>new Response(null,{status:401,headers:{'www-authenticate':`Basic resource_metadata="${origin}/.well-known/oauth-protected-resource/icloud/mcp"`}}));expect(badChallenge.find(r=>r.name==='Anonymous MCP')?.status).toBe('fail');
 const oversized=await diagnose(settings,async()=>new Response('x'.repeat(65537)));expect(oversized.some(r=>r.status==='fail')).toBe(true);
 }finally{server.stop(true);await rm(dir,{recursive:true,force:true});}
});
