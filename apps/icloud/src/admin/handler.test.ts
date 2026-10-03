import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
async function fixture(ready=true){
 const dir=mkdtempSync(join(tmpdir(),'icloud-admin-'));
 const proof=randomBytes(32).toString('hex');
 const proc=Bun.spawn([process.execPath,join(import.meta.dir,'handler.worker.ts')],{stdin:new Blob([JSON.stringify({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32).toString('hex'),bootstrapProof:proof,ready})]),stdout:'pipe',stderr:'pipe'});
 const reader=proc.stdout.getReader();const output=await reader.read();reader.releaseLock();const url=new TextDecoder().decode(output.value).trim();
 return{url,proof,async close(){proc.kill();await proc.exited;expect(await new Response(proc.stderr).text()).toBe('');rmSync(dir,{recursive:true});},post(path:string,body:unknown,session='owner',origin=url){return fetch(url+path,{method:'POST',headers:{origin,'content-type':'application/json','x-bootstrap-proof':proof,'x-fixture-session':session},body:JSON.stringify(body)});}};
}
test('private prerequisites precede credentials and block completion',async()=>{
 const f=await fixture(false);try{
  const html=await(await fetch(f.url+'/icloud/setup')).text();expect(html).toContain('data-step="0"');expect(html).toContain('data-step="1" hidden');expect(html).toContain('data-step="2" hidden');expect(html).not.toContain('id="proof"');
  expect((await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'})).status).toBe(409);
 }finally{await f.close();}
});
test('actual HTTP setup validates first, retries, closes enrollment and protects owner administration',async()=>{
 const f=await fixture();try{
  const invalid=await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'invalid-dummy'});expect(invalid.status).toBe(422);expect(await invalid.text()).not.toContain('provider detail');
  expect((await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'},'owner','https://attacker.invalid')).status).toBe(403);
  const ok=await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'});expect(ok.status).toBe(200);expect(await ok.text()).not.toContain('dummy-secret');
  expect((await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'},'orphan')).status).toBe(409);
  expect((await f.post('/icloud/admin/credential',{user:'owner@example.invalid',appPassword:'rotated-dummy'},'other')).status).toBe(403);
  expect((await f.post('/icloud/admin/credential',{user:'owner@example.invalid',appPassword:'rotated-dummy'})).status).toBe(200);
  expect((await f.post('/icloud/admin/revoke',{},'other')).status).toBe(403);
  expect(await(await f.post('/icloud/admin/revoke',{})).json()).toEqual({revoked:'local-provider-credential'});
  expect((await(await fetch(f.url+'/icloud/setup/status')).json()).enrolled).toBe(true);
 }finally{await f.close();}
});

test('admin browser navigation redirects missing session to fixed private sign-in; API stays denied',async()=>{
 const f=await fixture();try{
  const navigation=await fetch(f.url+'/icloud/admin?returnURL=https://attacker.invalid',{redirect:'manual'});
  expect(navigation.status).toBe(303);expect(navigation.headers.get('location')).toBe('/icloud/sign-in');
  expect((await fetch(f.url+'/icloud/admin',{headers:{'x-fixture-session':'other'},redirect:'manual'})).status).toBe(403);
  expect((await f.post('/icloud/admin/revoke',{},'')).status).toBe(403);
 }finally{await f.close();}
});

test('dashboard status and capability mutations require owner and explicit elevation consent',async()=>{
 const f=await fixture();try{
  await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'});
  expect((await fetch(f.url+'/icloud/admin/status')).status).toBe(403);
  const get=()=>fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}});
  const initial=await(await get()).text();expect(initial).toContain('credentialStored');expect(initial).not.toContain('dummy-secret');expect(initial).not.toContain('owner@example');
  const policy={read:true,write:true,send:true,unsubscribe:false};
  expect((await f.post('/icloud/admin/capabilities',{policy:{...policy,undeclared:true},confirmEnable:true})).status).toBe(400);
  expect((await f.post('/icloud/admin/capabilities',{policy:{read:true},confirmEnable:true})).status).toBe(400);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:false})).status).toBe(409);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true},'other')).status).toBe(403);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true},'owner','https://evil.invalid')).status).toBe(403);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true})).status).toBe(200);
  expect((await(await get()).json()).capabilities.send).toBe(true);
  expect((await f.post('/icloud/admin/capabilities',{policy:{...policy,send:false},confirmEnable:false})).status).toBe(200);
  await f.post('/icloud/admin/revoke',{});expect((await(await get()).json()).credentialStored).toBe(false);
 }finally{await f.close();}
});
