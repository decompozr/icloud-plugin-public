import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
async function fixture(ready=true,seedAccount=false){
 const dir=mkdtempSync(join(tmpdir(),'icloud-admin-'));
 const proof=randomBytes(32).toString('hex');
 const proc=Bun.spawn([process.execPath,join(import.meta.dir,'handler.worker.ts')],{stdin:new Blob([JSON.stringify({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32).toString('hex'),bootstrapProof:proof,ready,seedAccount})]),stdout:'pipe',stderr:'pipe'});
 const reader=proc.stdout.getReader();const output=await reader.read();reader.releaseLock();const url=new TextDecoder().decode(output.value).trim();
 return{url,proof,async close(){proc.kill();await proc.exited;try{expect(await new Response(proc.stderr).text()).toBe('');}finally{rmSync(dir,{recursive:true});}},post(path:string,body:unknown,session='owner',origin=url){return fetch(url+path,{method:'POST',headers:{origin,'content-type':'application/json','x-bootstrap-proof':proof,'x-fixture-session':session},body:JSON.stringify(body)});}};
}
test('private prerequisites precede credentials and block completion',async()=>{
 const f=await fixture(false);try{
  const html=await(await fetch(f.url+'/icloud/setup')).text();expect(html).toContain('data-step="0"');expect(html).toContain('data-step="1" hidden');expect(html).toContain('data-step="2" hidden');expect(html.match(/data-step=/g)).toHaveLength(3);expect(html).not.toContain('id="proof"');
  expect((await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'})).status).toBe(409);
 }finally{await f.close();}
});
test('owner-only setup closes bootstrap without collecting credentials',async()=>{
 const f=await fixture();try{
  expect((await f.post('/icloud/setup/complete',{user:'owner@example.invalid',appPassword:'dummy-secret'})).status).toBe(400);
  expect((await f.post('/icloud/setup/complete',{},'owner','https://attacker.invalid')).status).toBe(403);
  expect((await f.post('/icloud/setup/complete',{})).status).toBe(200);
  expect((await f.post('/icloud/setup/complete',{})).status).toBe(409);
  expect((await(await fetch(f.url+'/icloud/setup/status')).json()).enrolled).toBe(true);
  const status=await(await fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}})).json();expect(status.accounts).toEqual([]);
  expect((await f.post('/icloud/admin/credential',{accountId:'missing',appPassword:'dummy'})).status).toBe(404);
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
  await f.post('/icloud/setup/complete',{});
  expect((await fetch(f.url+'/icloud/admin/status')).status).toBe(403);
  const get=()=>fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}});
  const initial=await(await get()).text();expect(initial).toContain('accounts');expect(initial).not.toContain('dummy-secret');expect(initial).not.toContain('owner@example');
  const policy={read:true,write:true,send:true,unsubscribe:false};
  expect((await f.post('/icloud/admin/capabilities',{policy:{...policy,undeclared:true},confirmEnable:true})).status).toBe(400);
  expect((await f.post('/icloud/admin/capabilities',{policy:{read:true},confirmEnable:true})).status).toBe(400);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:false})).status).toBe(409);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true},'other')).status).toBe(403);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true},'owner','https://evil.invalid')).status).toBe(403);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true})).status).toBe(200);
  expect((await(await get()).json()).capabilities.send).toBe(true);
  expect((await f.post('/icloud/admin/capabilities',{policy:{...policy,send:false},confirmEnable:false})).status).toBe(200);
  expect((await f.post('/icloud/admin/revoke',{})).status).toBe(400);expect((await(await get()).json()).accounts).toEqual([]);
 }finally{await f.close();}
});

 test('per-account administration rotates only selected login and revokes local credentials',async()=>{
 const f=await fixture(true,true);try{
 const get=()=>fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}});
 const first=await(await get()).json();expect(first.accounts).toHaveLength(1);const account=first.accounts[0];expect(account.user).toBe('owner@example.invalid');expect(account.label).toBe('Personal');expect(account.credentialStored).toBe(true);
 expect((await f.post('/icloud/admin/credential',{accountId:account.id,user:'other@example.invalid',appPassword:'rotated'})).status).toBe(400);
 const invalid=await f.post('/icloud/admin/credential',{accountId:account.id,appPassword:'invalid-dummy'});expect(invalid.status).toBe(422);expect(await invalid.text()).not.toContain('provider detail');
 expect((await f.post('/icloud/admin/credential',{accountId:account.id,appPassword:'rotated'})).status).toBe(200);
 expect((await f.post('/icloud/admin/revoke',{accountId:account.id},'other')).status).toBe(403);
 expect((await f.post('/icloud/admin/revoke',{accountId:account.id})).status).toBe(200);
 const after=await(await get()).json();expect(after.accounts[0]).toEqual({...account,credentialStored:false});
 }finally{await f.close();}
 });
