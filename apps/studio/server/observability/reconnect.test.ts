import {test,expect} from 'bun:test';
import {EventEmitter} from 'node:events';
import {mkdtempSync,writeFileSync,readFileSync,lstatSync,rmSync,chmodSync,utimesSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReconnectCapture,reconnectErrorCode,reconnectRedirectError,RECONNECT_LIMIT,RECONNECT_WINDOW_MS} from './reconnect.js';

const canary='secret@example.com_ACCESS_TOKEN_AUTH_CODE_PASSWORD';
test('authorization redirect extraction returns only an exact error enum and never secrets',()=>{
 expect(reconnectRedirectError('https://client.invalid/callback?error=invalid_scope&state='+canary+'&code='+canary+'&error_description='+canary)).toBe('invalid_scope');
 expect(reconnectRedirectError('/error?error=invalid_client&description='+canary)).toBe('invalid_client');
 for(const value of ['https://client.invalid/callback?code='+canary,'https://client.invalid/callback?error='+canary,'https://client.invalid/callback?error=invalid_scope&error=invalid_client','https://client.invalid/callback#code='+canary+'&error=invalid_scope','x'.repeat(8193),{toString(){throw Error(canary);}},null])expect(reconnectRedirectError(value)).toBe('unavailable');
});
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'reconnect-capture-'));
 const marker=join(directory,'reconnect-diagnostics.enable'),output=join(directory,'reconnect-diagnostics.json');
 const now=Date.now();let clock=now;
 const capture=new ReconnectCapture(directory,()=>clock);
 const enable=()=>{writeFileSync(marker,'',{mode:0o600});utimesSync(marker,now/1000,now/1000);};
 const request=(path:string,status=200,error?:unknown,complete=true)=>{
  const req={path} ;
  for(const key of ['headers','body','query','originalUrl','url'])Object.defineProperty(req,key,{get(){throw Error('Diagnostic accessed forbidden request field '+key);}});
  const res=Object.assign(new EventEmitter(),{statusCode:status}) as EventEmitter & {statusCode:number};
  let called=false;
  void capture.run(req.path,async()=>{called=true;if(error!==undefined)capture.noteError(error);},callback=>res.once('finish',()=>callback(res.statusCode)));
  expect(called).toBe(true);res.emit(complete?'finish':'close');return res;
 };
 return{directory,marker,output,now,capture,enable,request,setClock:(n:number)=>{clock=n;},read:()=>JSON.parse(readFileSync(output,'utf8')),dispose:()=>rmSync(directory,{recursive:true,force:true})};
}
test('disabled by default and unknown routes never read or retain secret input',()=>{
 const f=fixture();try{
  f.request('/icloud/auth/oauth2/token',400,canary);expect(existsSync(f.output)).toBe(false);
  f.enable();for(const route of ['/icloud/admin','/icloud/connect/add','/icloud/auth/oauth2/token/'+canary,'https://host/icloud/mcp','/icloud/mcp?code='+canary])f.request(route,400,canary);
  expect(existsSync(f.output)).toBe(false);
 }finally{f.dispose();}
});
test('strict schema and exact OAuth enum drop arbitrary values without serializing them',()=>{
 const f=fixture();try{
  f.enable();const hostile={toString(){throw Error('secret object serialized');},error:canary};
  for(const error of [canary,'invalid_scope '+canary,'INVALID_SCOPE',hostile,null,12])f.request('/icloud/auth/oauth2/token',400,error);
  f.request('/icloud/auth/oauth2/register',400,'invalid_scope');
  f.request('/icloud/auth/oauth2/authorize',302);f.request('/icloud/mcp',401,'invalid_token');
  for(const record of f.read())expect(Object.keys(record)).toEqual(['timestamp','stage','route','status','errorCode']);
  expect(f.read().slice(0,6).every((r:{errorCode:string})=>r.errorCode==='unavailable')).toBe(true);
  expect(f.read().slice(-3).map((r:{errorCode:string})=>r.errorCode)).toEqual(['invalid_scope','unavailable','invalid_token']);
  expect(readFileSync(f.output,'utf8')).not.toContain(canary);expect(lstatSync(f.output).mode&0o777).toBe(0o600);
  expect(reconnectErrorCode(hostile)).toBe('unavailable');
 }finally{f.dispose();}
});
test('all five stages, finite record and byte retention, and aborts do not invent HTTP results',()=>{
 const f=fixture();try{
  f.enable();for(const route of ['/.well-known/oauth-protected-resource/icloud/mcp','/icloud/auth/oauth2/register','/icloud/auth/oauth2/authorize','/icloud/auth/oauth2/token','/icloud/mcp'])f.request(route);
  expect(f.read().map((r:{stage:string})=>r.stage)).toEqual(['discovery','registration','authorization','token','mcp']);
  f.request('/icloud/auth/oauth2/token',200,undefined,false);expect(f.read()).toHaveLength(5);
  for(let n=0;n<RECONNECT_LIMIT+10;n++)f.request('/icloud/auth/oauth2/token',400,'invalid_grant');
  expect(f.read()).toHaveLength(RECONNECT_LIMIT);expect(lstatSync(f.output).size).toBeLessThan(128*1024);
 }finally{f.dispose();}
});
test('30 minute expiry and owner-only regular enable marker fail closed',()=>{
 const f=fixture();try{
  f.enable();chmodSync(f.marker,0o644);f.request('/icloud/mcp');expect(existsSync(f.output)).toBe(false);
  chmodSync(f.marker,0o600);f.setClock(f.now-1);f.request('/icloud/mcp');expect(existsSync(f.output)).toBe(false);
  f.setClock(f.now);f.request('/icloud/mcp');const before=readFileSync(f.output,'utf8');
  f.setClock(f.now+RECONNECT_WINDOW_MS);f.request('/icloud/mcp');expect(readFileSync(f.output,'utf8')).toBe(before);
  rmSync(f.marker);symlinkSync(f.output,f.marker);f.setClock(f.now);f.request('/icloud/mcp');expect(readFileSync(f.output,'utf8')).toBe(before);
 }finally{f.dispose();}
});
test('unsafe output and temporary paths are untouched and diagnostic failure preserves handler behavior',()=>{
 const f=fixture();try{
  f.enable();const unrelated=join(f.directory,'unrelated');writeFileSync(unrelated,canary);symlinkSync(unrelated,f.output);
  f.request('/icloud/mcp');expect(readFileSync(unrelated,'utf8')).toBe(canary);
  rmSync(f.output);const temp=join(f.directory,`.reconnect-diagnostics-${process.pid}.tmp`);writeFileSync(temp,canary);
  f.request('/icloud/mcp');expect(readFileSync(temp,'utf8')).toBe(canary);expect(existsSync(f.output)).toBe(false);
 }finally{f.dispose();}
});
test('overlapping asynchronous requests retain independent error codes',async()=>{
 const f=fixture();try{
  f.enable();const run=(code:string,delay:number)=>new Promise<void>(resolve=>{
   const res=Object.assign(new EventEmitter(),{statusCode:400}) as EventEmitter & {statusCode:number};
   void f.capture.run('/icloud/auth/oauth2/token',async()=>{setTimeout(()=>{f.capture.noteError(code);res.emit('finish');resolve();},delay);},callback=>res.once('finish',()=>callback(res.statusCode)));
  });
  await Promise.all([run('invalid_grant',15),run('invalid_client',1)]);
  expect(f.read().map((r:{errorCode:string})=>r.errorCode)).toEqual(['invalid_client','invalid_grant']);
 }finally{f.dispose();}
});
