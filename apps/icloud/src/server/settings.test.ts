import{test,expect}from'bun:test';
import{mkdtempSync,writeFileSync,readFileSync,rmSync,statSync,chmodSync,renameSync,symlinkSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{readSettings}from'./settings.js';
import{installation}from'./installation.js';
import{prerequisites}from'./prerequisites.js';
test('TOML runtime uses separate origins, owner-only external custody, explicit one-time installation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'icloud-settings-'));
 const path=join(dir,'app.toml');const source='public_origin="https://host.example"\nprivate_origin="https://host.example:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"';
 try{
  writeFileSync(path,source);const settings=readSettings(path);
  expect(()=>installation(settings)).toThrow();
  const first=installation(settings,true);expect(first.store.ownerId()).toBeNull();first.store.close();first.masterKey.fill(0);
  expect(statSync(settings.master_key_file).mode&0o077).toBe(0);
  const reopened=installation(settings);reopened.store.checkBootstrapProof(readFileSync(join(dir,'custody/bootstrap-proof'),'utf8'));reopened.store.close();reopened.masterKey.fill(0);
  expect(()=>installation(settings,true)).toThrow();
  writeFileSync(path,source+'\nhost="0.0.0.0"');expect(()=>readSettings(path)).toThrow();
  writeFileSync(path,source+'\nhost="0.0.0.0"\nruntime_mode="container"');expect(readSettings(path).runtime_mode).toBe('container');
  writeFileSync(path,source.replace(':8443',''));expect(()=>readSettings(path)).toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('container prerequisites require fresh host diagnostics and actual private endpoint reachability',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'icloud-prerequisites-')),statusPath=join(dir,'status');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('icloud-private')});
 const settings={public_origin:'https://fixture.invalid',private_origin:`http://127.0.0.1:${server.port}`,public_port:4100,private_port:4101,host:'127.0.0.1' as const,runtime_mode:'container' as const,state_directory:dir,master_key_file:join(dir,'key'),installation_marker:join(dir,'marker'),allow_send:false,allow_writes:false,tailscale_binary:'unavailable',tailscale_status_file:statusPath};
 try{
  writeFileSync(statusPath,JSON.stringify({installed:true,authenticated:true,online:true,checkedAt:new Date().toISOString()}));
  expect(await prerequisites(settings)).toEqual({installed:true,authenticated:true,online:true,privateReachable:true});
  writeFileSync(statusPath,JSON.stringify({installed:true,authenticated:true,online:true,checkedAt:new Date(Date.now()-120000).toISOString()}));
  expect((await prerequisites(settings)).authenticated).toBe(false);
  await server.stop(true);expect((await prerequisites(settings)).privateReachable).toBe(false);
 }finally{await server.stop(true);rmSync(dir,{recursive:true,force:true});}
});

test('startup rejects widened state/custody and symlinks without repairing them',()=>{
 const dir=mkdtempSync(join(tmpdir(),'icloud-custody-'));
 try{
  const path=join(dir,'app.toml');writeFileSync(path,'public_origin="https://host.example"\nprivate_origin="https://host.example:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"');
  const settings=readSettings(path),first=installation(settings,true);first.store.close();first.masterKey.fill(0);
  const auth=join(settings.state_directory,'auth.sqlite');writeFileSync(auth,'',{mode:0o600});
  for(const target of [settings.state_directory,join(dir,'custody'),settings.master_key_file,settings.installation_marker,join(settings.state_directory,'owner.sqlite'),auth]){
   const original=statSync(target).mode&0o777;chmodSync(target,original|0o040);
   expect(()=>installation(settings)).toThrow();expect(statSync(target).mode&0o777).toBe(original|0o040);chmodSync(target,original);
  }
  for(const target of [settings.master_key_file,settings.installation_marker,auth,settings.state_directory]){
   const saved=target+'.saved';renameSync(target,saved);symlinkSync(saved,target);
   expect(()=>installation(settings)).toThrow();rmSync(target);renameSync(saved,target);
  }
  const reopened=installation(settings);reopened.store.close();reopened.masterKey.fill(0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
