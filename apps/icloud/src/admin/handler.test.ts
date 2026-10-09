import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPrivateAdmin,type AppleCredential} from './handler.js';
import {SqliteOwnerStore} from '@decompozr/account/server';
async function fixture(ready=true,seedAccount=false){
 const dir=mkdtempSync(join(tmpdir(),'icloud-admin-'));
 const proof=randomBytes(32).toString('hex');
 const proc=Bun.spawn([process.execPath,join(import.meta.dir,'handler.worker.ts')],{stdin:new Blob([JSON.stringify({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32).toString('hex'),bootstrapProof:proof,ready,seedAccount})]),stdout:'pipe',stderr:'pipe'});
 const reader=proc.stdout.getReader();const output=await reader.read();reader.releaseLock();const url=new TextDecoder().decode(output.value).trim();
 return{url,proof,async close(){proc.kill();await proc.exited;try{expect(await new Response(proc.stderr).text()).toBe('');}finally{rmSync(dir,{recursive:true});}},post(path:string,body:unknown,session='owner',origin=url){return fetch(url+path,{method:'POST',headers:{origin,'content-type':'application/json','x-bootstrap-proof':proof,'x-fixture-session':session},body:JSON.stringify(body)});}};
}
test('private prerequisites precede credentials and block completion',async()=>{
 const f=await fixture(false);try{
  const html=await(await fetch(f.url+'/icloud/setup')).text();expect(html).toContain('Setup requirements');expect(html).not.toContain('data-step=');expect(html).not.toContain('id="proof"');
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
  await f.post('/icloud/setup/complete',{});
  const navigation=await fetch(f.url+'/icloud/admin?returnURL=https://attacker.invalid',{redirect:'manual'});
  expect(navigation.status).toBe(303);expect(navigation.headers.get('location')).toBe('/icloud/sign-in');
  expect((await fetch(f.url+'/icloud/admin',{headers:{'x-fixture-session':'other'},redirect:'manual'})).status).toBe(403);
  expect((await f.post('/icloud/admin/revoke',{},'')).status).toBe(403);
 }finally{await f.close();}
});

test('dashboard status and capability mutations require owner and explicit elevation consent',async()=>{
 const f=await fixture(true,true);try{
  expect((await fetch(f.url+'/icloud/admin/status')).status).toBe(403);
  const get=()=>fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}});
  const initial=await(await get()).text();expect(initial).toContain('accounts');expect(initial).not.toContain('dummy-secret');expect(initial).not.toContain('appPassword');
  const policy={read:true,write:true,send:true,unsubscribe:false};
  expect((await f.post('/icloud/admin/capabilities',{policy:{...policy,undeclared:true},confirmEnable:true})).status).toBe(400);
  expect((await f.post('/icloud/admin/capabilities',{policy:{read:true},confirmEnable:true})).status).toBe(400);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:false})).status).toBe(409);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true},'other')).status).toBe(403);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true},'owner','https://evil.invalid')).status).toBe(403);
  expect((await f.post('/icloud/admin/capabilities',{policy,confirmEnable:true})).status).toBe(200);
  expect((await(await get()).json()).capabilities.send).toBe(true);
  expect((await f.post('/icloud/admin/capabilities',{policy:{...policy,send:false},confirmEnable:false})).status).toBe(200);
  expect((await f.post('/icloud/admin/revoke',{})).status).toBe(400);expect((await(await get()).json()).accounts).toHaveLength(1);
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
test('Calendar capability administration is separate from Mail and owner protected',async()=>{const f=await fixture(true,true);try{const policy={read:true,write:true,schedule:false,share:false};const endpoint='/icloud/admin/modules/calendar/capabilities';expect((await f.post(endpoint,{policy,confirmEnable:true},'other')).status).toBe(403);expect((await f.post(endpoint,{policy,confirmEnable:false})).status).toBe(409);expect((await f.post(endpoint,{policy,confirmEnable:true})).status).toBe(200);const status=await(await fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}})).json();expect(status.modules.calendar).toEqual(policy);expect(status.capabilities.send).toBe(false);}finally{await f.close();}});

function credentialFixture(validateCredential:(credential:AppleCredential)=>Promise<void>){
 const dir=mkdtempSync(join(tmpdir(),'icloud-admin-race-')),proof=randomBytes(32).toString('hex');
 const store=SqliteOwnerStore.provision({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32),bootstrapProof:proof});
 store.enroll({proof,ownerId:'owner'});
 const account=store.addAccount('owner',{user:'fixture@example.invalid',credential:Buffer.from(JSON.stringify({user:'fixture@example.invalid',appPassword:'original'}))});
 const session=async()=>({user:{id:'owner'}}),origin='https://private.invalid';
 const handler=createPrivateAdmin({privateOrigin:origin,store,ownerAuth:{ownerSession:session,enrollmentSession:session},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential});
 return{store,account,post(path:string,appPassword?:string){return handler(new Request(origin+'/icloud/admin/'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({accountId:account.id,...(appPassword===undefined?{}:{appPassword})})}));},password(){const bytes=store.readAccountSecret('owner',account.id);if(!bytes)return null;try{return JSON.parse(Buffer.from(bytes).toString()).appPassword;}finally{bytes.fill(0);}},close(){store.close();rmSync(dir,{recursive:true,force:true});}};
}
function validationBarrier(){
 let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),pending=new Promise<void>(resolve=>{release=resolve;});
 return{entered,release,async validate(){enter();await pending;}};
}

test('credential validation cannot restore credentials after a concurrent local revocation',async()=>{
 for(const initiallyRevoked of [false,true]){
  const barrier=validationBarrier(),f=credentialFixture(barrier.validate);
  try{
   if(initiallyRevoked)f.store.revokeAccountSecret('owner',f.account.id);
   const replacement=f.post('credential','stale');await barrier.entered;
   expect((await f.post('revoke')).status).toBe(200);barrier.release();
   const response=await replacement;expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'CREDENTIAL_STATE_CHANGED'});
   expect(f.password()).toBeNull();expect(f.store.account('owner',f.account.id).credentialStored).toBe(false);
  }finally{barrier.release();f.close();}
 }
});

test('a slow credential replacement cannot overwrite a newer validated replacement',async()=>{
 const barrier=validationBarrier(),f=credentialFixture(async credential=>{if(credential.appPassword==='stale')await barrier.validate();});
 try{
  const stale=f.post('credential','stale');await barrier.entered;
  expect((await f.post('credential','newer')).status).toBe(200);barrier.release();
  expect((await stale).status).toBe(409);expect(f.password()).toBe('newer');
 }finally{barrier.release();f.close();}
});

test('credential replacement requires generation support and clears temporary storage bytes',async()=>{
 const f=credentialFixture(async()=>{});let bytes:Uint8Array|undefined;
 const rotate=f.store.rotateAccountSecret.bind(f.store);
 f.store.rotateAccountSecret=(owner,account,credential)=>{bytes=credential;rotate(owner,account,credential);};
 try{
  expect((await f.post('credential','updated')).status).toBe(200);expect(f.password()).toBe('updated');expect(bytes).toBeDefined();expect(bytes!.every(value=>value===0)).toBe(true);
  f.store.rotateAccountSecret=(_owner,_account,credential)=>{bytes=credential;throw Error('Synthetic storage failure');};
  expect((await f.post('credential','failed')).status).toBe(403);expect(bytes!.every(value=>value===0)).toBe(true);expect(f.password()).toBe('updated');
  Object.defineProperty(f.store,'accountGeneration',{value:undefined});
  expect((await f.post('credential','unsupported')).status).toBe(409);expect(f.password()).toBe('updated');
 }finally{f.close();}
});

test('owner shell routes and enrolled wizard never expose accounts to anonymous navigation',async()=>{
 const f=await fixture(true,true);try{
  for(const path of ['/','/icloud/admin','/icloud/admin/accounts','/icloud/admin/connections','/icloud/admin/system','/icloud/setup?mode=account']){
   const response=await fetch(f.url+path,{redirect:'manual'});expect(response.status).toBe(303);expect(response.headers.get('location')).toBe(path==='/'?'/icloud/admin':'/icloud/sign-in');expect(await response.text()).not.toContain('owner@example.invalid');
   expect((await fetch(f.url+path,{headers:{'x-fixture-session':'other'},redirect:'manual'})).status).toBe(path==='/'?303:403);
   const owner=await fetch(f.url+path,{headers:{'x-fixture-session':'owner'}});expect(owner.status).toBe(200);expect(owner.headers.get('cache-control')).toBe('no-store');expect(owner.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  }
  expect((await fetch(f.url+'/icloud/admin/system-status')).status).toBe(403);
  const setup=await(await fetch(f.url+'/icloud/setup/status')).text();expect(setup).not.toContain('owner@example.invalid');expect(setup).not.toContain('accounts');
 }finally{await f.close();}
});
test('private root directs an uninitialized owner to resumable setup',async()=>{
 const f=await fixture();try{const response=await fetch(f.url+'/',{redirect:'manual'});expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('/icloud/setup');}finally{await f.close();}
});
test('account-only addition requires owner, exact origin, validates and never revives a saved account',async()=>{
 const f=await fixture(true,true);try{
  const path='/icloud/admin/accounts/add',body={user:'new@example.invalid',label:'Fixture',appPassword:'dummy-fixture'};
  expect((await f.post(path,body,'other')).status).toBe(403);expect((await f.post(path,body,'owner','https://evil.invalid')).status).toBe(403);
  expect((await f.post(path,{...body,unexpected:true})).status).toBe(400);expect((await f.post(path,{...body,appPassword:'invalid-dummy'})).status).toBe(422);
  const created=await f.post(path,body);expect(created.status).toBe(201);const result=await created.json();expect(result.account.user).toBe(body.user);expect(JSON.stringify(result)).not.toContain(body.appPassword);
  expect((await f.post(path,body)).status).toBe(409);await f.post('/icloud/admin/revoke',{accountId:result.account.id});expect((await f.post(path,body)).status).toBe(409);
  const status=await(await fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}})).json();expect(status.accounts.find((a:{id:string})=>a.id===result.account.id).credentialStored).toBe(false);
 }finally{await f.close();}
});
test('concurrent account additions recheck duplicates after asynchronous provider validation',async()=>{
 const barrier=validationBarrier(),f=credentialFixture(async credential=>{if(credential.appPassword==='slow')await barrier.validate();});
 const post=(password:string)=>createRequest(password);
 const handler=createPrivateAdmin({privateOrigin:'https://private.invalid',store:f.store,ownerAuth:{ownerSession:async()=>({user:{id:'owner'}}),enrollmentSession:async()=>({user:{id:'owner'}})},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async credential=>{if(credential.appPassword==='slow')await barrier.validate();}});
 function createRequest(appPassword:string){return handler(new Request('https://private.invalid/icloud/admin/accounts/add',{method:'POST',headers:{origin:'https://private.invalid','content-type':'application/json'},body:JSON.stringify({user:'new@example.invalid',appPassword})}));}
 try{const slow=post('slow');await barrier.entered;expect((await post('fast')).status).toBe(201);barrier.release();expect((await slow).status).toBe(409);expect(f.store.listAccounts('owner').filter(a=>a.user==='new@example.invalid')).toHaveLength(1);}finally{barrier.release();f.close();}
});

test('missing app passwords block fresh Mail and Calendar activation but allow disabling',async()=>{
 const f=await fixture();try{
  expect((await f.post('/icloud/setup/complete',{})).status).toBe(200);
  const get=()=>fetch(f.url+'/icloud/admin/status',{headers:{'x-fixture-session':'owner'}});
  const initial=await(await get()).json();expect(Object.values(initial.capabilities).every(v=>v===false)).toBe(true);
  for(const [path,policy] of [['/icloud/admin/capabilities',{read:true,write:false,send:false,unsubscribe:false}],['/icloud/admin/modules/calendar/capabilities',{read:true,write:false,schedule:false,share:false}]] as const){
   const blocked=await f.post(path,{policy,confirmEnable:true});expect(blocked.status).toBe(409);expect(await blocked.json()).toEqual({error:'CREDENTIAL_REQUIRED'});
   expect((await f.post(path,{policy:Object.fromEntries(Object.keys(policy).map(k=>[k,false])),confirmEnable:false})).status).toBe(200);
  }
  expect((await(await get()).json()).capabilities).toEqual(initial.capabilities);
 }finally{await f.close();}
});

test('authorized capability save synchronizes after persistence; invalid origin/confirmation never invokes sync',async()=>{
 const f=credentialFixture(async()=>{}),origin='https://private.invalid';let policy={read:false,write:false,send:false,unsubscribe:false},calls=0;
 const handler=createPrivateAdmin({privateOrigin:origin,store:f.store,ownerAuth:{ownerSession:async()=>({user:{id:'owner'}}),enrollmentSession:async()=>({user:{id:'owner'}})},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async()=>{},capabilities:()=>policy,updateCapabilities:async next=>{policy=next as typeof policy;return policy;},synchronizeClientPermissions:async()=>{expect(policy.read).toBe(true);calls++;return{status:'synced',clients:1,grants:3,skipped:0}}});
 const request=(confirmEnable:boolean,requestOrigin=origin)=>handler(new Request(origin+'/icloud/admin/capabilities',{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify({policy:{read:true,write:false,send:false,unsubscribe:false},confirmEnable})}));
 try{expect((await request(true,'https://attacker.invalid')).status).toBe(403);expect((await request(false)).status).toBe(409);expect(calls).toBe(0);const result=await request(true);expect(result.status).toBe(200);expect((await result.json()).permissionSync).toEqual({status:'synced',clients:1,grants:3,skipped:0});expect(calls).toBe(1);}finally{f.close()}
});
test('sync failure reports persisted settings separately from failed permissions',async()=>{
 const f=credentialFixture(async()=>{}),origin='https://private.invalid';let policy={read:false};const handler=createPrivateAdmin({privateOrigin:origin,store:f.store,ownerAuth:{ownerSession:async()=>({user:{id:'owner'}}),enrollmentSession:async()=>({user:{id:'owner'}})},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async()=>{},capabilities:()=>policy,updateCapabilities:async next=>{policy=next as typeof policy;return policy;},synchronizeClientPermissions:async()=>{throw Error('Fixture failure')}});
 try{const response=await handler(new Request(origin+'/icloud/admin/capabilities',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({policy:{read:true},confirmEnable:true})}));expect(response.status).toBe(200);expect(await response.json()).toEqual({capabilities:{read:true},permissionSync:{status:'failed'}});expect(policy.read).toBe(true);}finally{f.close()}
});
