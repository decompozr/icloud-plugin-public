import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {SqliteOwnerStore} from '../storage/owner-store.js';
import {PhotosCloudSetup} from './cloud-setup.js';
import {createPrivateAdmin} from '../admin/handler.js';

function fixture(actor:(input:any)=>Promise<unknown>,requestActor?:(input:any)=>Promise<unknown>,uploadActor?:(input:any)=>Promise<unknown>){
 const root=mkdtempSync(join(tmpdir(),'icloud-cloud-setup-'));
 const options={databasePath:join(root,'owner.sqlite'),markerPath:join(root,'marker'),masterKey:randomBytes(32),bootstrapProof:randomBytes(32).toString('hex')};
 const store=SqliteOwnerStore.provision(options);store.enroll({proof:options.bootstrapProof,ownerId:'owner'});
 const account=store.addAccount('owner',{user:'owner@example.test',credential:Buffer.from('mail-fixture')});
 const service=new PhotosCloudSetup({store,owner:()=>store.ownerId()!,python:'/fixture/python',runtimeDirectory:join(root,'cloud'),actor:input=>actor(input),requestActor,uploadActor});
 return {root,store,account,service,cleanup:()=>{store.close();rmSync(root,{recursive:true});}};
}
const pending={phase:'awaiting_2fa',privateState:{username:'owner@example.test',sessionData:{scnt:'private-token-fixture'}},sharedServiceAdvertised:false};
const authenticated={phase:'authenticated',privateState:{username:'owner@example.test',sessionData:{token:'private-token-fixture'}},dsid:'123456789',sharedServiceAdvertised:true,serviceOrigin:'https://p37-sharedstreams.icloud.com'};
test('sealed transport rejects account/URL substitution and revocation before or during dispatch',async()=>{
 let calls=0,revokeDuring=false;let f:ReturnType<typeof fixture>;
 f=fixture(async input=>input.action==='check'?{dependencyReady:true}:authenticated,async input=>{
  calls++;expect(input.username).toBe('owner@example.test');expect(input.state.sessionData.token).toBe('private-token-fixture');expect(input).not.toHaveProperty('password');
  if(revokeDuring)f.store.revokeProviderSession('owner',f.account.id,'photos_web',f.store.providerSessionState('owner',f.account.id,'photos_web'));
  return {status:200,body:'{"albums":[]}'};
 });
 try{
  expect(()=>f.service.sharedSession(f.account.id)).toThrow('cloud_login_required');
  await f.service.action({action:'login',accountId:f.account.id,password:'fixture'});
  const s=f.service.sharedSession(f.account.id),url=`https://p37-sharedstreams.icloud.com/${s.dsid}/sharedstreams/webgetalbumslist`,init={method:'POST',redirect:'error' as const,body:'{}'};
  await expect(s.request('https://evil.test/',init)).rejects.toThrow();expect(calls).toBe(0);
  expect(await (await s.request(url,init)).json()).toEqual({albums:[]});
  revokeDuring=true;await expect(s.request(url,init)).rejects.toThrow('cloud_session_changed');expect(calls).toBe(2);
  await expect(s.request(url,init)).rejects.toThrow('cloud_session_changed');expect(calls).toBe(2);
 }finally{f.cleanup();}
});
test('remote login and verification persist only private session material and redact public status',async()=>{
 const calls:any[]=[];const f=fixture(async input=>{calls.push(input);return input.action==='check'?{dependencyReady:true}:input.action==='login'?pending:authenticated;});
 try{
  const a=await f.service.action({action:'login',accountId:f.account.id,password:'transient-password-fixture'});
  expect(a.phase).toBe('awaiting_2fa');expect(JSON.stringify(a)).not.toContain('private-token-fixture');
  const b=await f.service.action({action:'verify',accountId:f.account.id,code:'654321'});expect(b.phase).toBe('authenticated');expect(b.managementReady).toBe(false);
  const status=await f.service.status(f.account.id);expect(JSON.stringify(status)).not.toContain('private-token-fixture');
  const raw=f.store.readProviderSession('owner',f.account.id,'photos_web')!;
  try{const serialized=Buffer.from(raw.bytes).toString();expect(serialized).not.toContain('transient-password-fixture');expect(serialized).not.toContain('654321');}finally{raw.bytes.fill(0);}
  expect(readFileSync(join(f.root,'owner.sqlite')).includes(Buffer.from('private-token-fixture'))).toBe(false);
  expect(calls.find(v=>v.action==='verify').password).toBeUndefined();
  expect(Buffer.from(f.store.readAccountSecret('owner',f.account.id)!).toString()).toBe('mail-fixture');
 }finally{f.cleanup();}
});
test('private Admin identifies SMS verification without exposing the challenge',async()=>{
 const f=fixture(async input=>input.action==='check'?{dependencyReady:true}:{...pending,privateState:{...pending.privateState,delivery:'sms'}});
 try{
  const result=await f.service.action({action:'login',accountId:f.account.id,password:'fixture-password'});
  expect(result.verificationMethod).toBe('sms');
  const status=await f.service.status(f.account.id);expect(status.verificationMethod).toBe('sms');expect(JSON.stringify(status)).not.toContain('private-token-fixture');
 }finally{f.cleanup();}
});
test('delayed login cannot resurrect a revoked account or session',async()=>{
 let resolve!:(value:unknown)=>void;let started!:()=>void;const entered=new Promise<void>(r=>started=r);
 const f=fixture(async input=>{if(input.action==='check')return {dependencyReady:true};started();return new Promise(r=>resolve=r);});
 try{
  const login=f.service.action({action:'login',accountId:f.account.id,password:'fixture-password'});await entered;
  f.store.revokeAccountSecret('owner',f.account.id);resolve(authenticated);
  await expect(login).rejects.toThrow('cloud_session_changed');expect(f.store.readProviderSession('owner',f.account.id,'photos_web')).toBeNull();
 }finally{f.cleanup();}
});
test('recheck expires invalid authentication and preserves updated failed challenges',async()=>{
 let response:any=pending;const f=fixture(async input=>input.action==='check'?{dependencyReady:true}:response);
 try{
  await f.service.action({action:'login',accountId:f.account.id,password:'fixture-password'});
  response={phase:'verification_failed',privateState:{username:'owner@example.test',sessionData:{scnt:'updated-token'}}};
  expect((await f.service.action({action:'verify',accountId:f.account.id,code:'654321'})).phase).toBe('verification_failed');
  expect(JSON.stringify(await f.service.status(f.account.id))).toContain('awaiting_2fa');
  response=authenticated;await f.service.action({action:'verify',accountId:f.account.id,code:'654321'});
  response={phase:'authentication_required'};expect((await f.service.action({action:'recheck',accountId:f.account.id})).phase).toBe('authentication_required');
  expect(f.store.readProviderSession('owner',f.account.id,'photos_web')).toBeNull();
 }finally{f.cleanup();}
});
test('unverified principal and missing dependency do not store sessions or attempt login',async()=>{
 let ready=false,calls=0;const f=fixture(async input=>{if(input.action==='check')return {dependencyReady:ready};calls++;return {...authenticated,dsid:''};});
 try{
  await expect(f.service.action({action:'login',accountId:f.account.id,password:'fixture'})).rejects.toThrow('cloud_dependency_missing');expect(calls).toBe(0);
  ready=true;await expect(f.service.action({action:'login',accountId:f.account.id,password:'fixture'})).rejects.toThrow('cloud_identity_unverified');
  expect(f.store.readProviderSession('owner',f.account.id,'photos_web')).toBeNull();
 }finally{f.cleanup();}
});
test('private Admin routes require owner, exact origin and bounded strict inputs; provider failures are redacted',async()=>{
 let calls=0;const accountId=crypto.randomUUID();
 const handle=createPrivateAdmin({privateOrigin:'https://private.example',store:{ownerId:()=> 'owner'} as any,ownerAuth:{ownerSession:async h=>{if(!h.has('x-fixture-owner'))throw Error('denied');return {user:{id:h.get('x-fixture-owner')!}};},enrollmentSession:async()=>{throw Error();}},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async()=>{},photosCloud:{status:async()=>({dependencyReady:false,managementReady:false}),setup:async()=>{calls++;return {};},action:async()=>{calls++;throw Error('private-cookie-must-not-leak');}}});
 const request=(path:string,body:unknown,origin='https://private.example',owner='owner')=>new Request('https://private.example/icloud/admin/photos/cloud/'+path,{method:'POST',headers:{origin,'content-type':'application/json',...(owner?{'x-fixture-owner':owner}:{})},body:JSON.stringify(body)});
 expect((await handle(request('login',{accountId,password:'fixture'},undefined,''))).status).toBe(403);
 expect((await handle(request('login',{accountId,password:'fixture'},undefined,'foreign'))).status).toBe(403);
 expect((await handle(request('login',{accountId,password:'fixture'},'https://evil.example'))).status).toBe(403);
 expect((await handle(request('login',{accountId,password:'fixture',username:'different@example.test'}))).status).toBe(400);expect(calls).toBe(0);
 const result=await handle(request('login',{accountId,password:'fixture'}));expect(result.status).toBe(409);expect(await result.text()).not.toContain('private-cookie');expect(calls).toBe(1);
 expect((await handle(request('revoke',{accountId}))).status).toBe(400);
});

test('web access diagnostic projects booleans only and rejects revoked in-flight results',async()=>{
 let body:any={isICDRSDisabled:true,isDeviceConsentedForPCS:false,token:'must-not-escape'},revoke=false,calls=0;
 let f:ReturnType<typeof fixture>;
 f=fixture(async input=>input.action==='check'?{dependencyReady:true}:authenticated,async input=>{
  calls++;expect(input.endpoint).toBe('requestWebAccessState');expect(input.body).toBe('{}');
  if(revoke)f.store.revokeProviderSession('owner',f.account.id,'photos_web',f.store.providerSessionState('owner',f.account.id,'photos_web'));
  return {status:200,body:JSON.stringify(body)};
 });
 try{
  await f.service.action({action:'login',accountId:f.account.id,password:'fixture'});
  const session=f.service.sharedSession(f.account.id);
  expect(await session.webAccessState!()).toEqual({responseKind:'flags',recognizedFields:['isICDRSDisabled','isDeviceConsentedForPCS'],isICDRSDisabled:true,isDeviceConsentedForPCS:false});
  body={isICDRSDisabled:'true'};
  expect(await session.webAccessState!()).toEqual({responseKind:'unrecognized',recognizedFields:['isICDRSDisabled'],isICDRSDisabled:null,isDeviceConsentedForPCS:null});
  body={errorCode:'secret-error',secretField:'secret'};
  const error=await session.webAccessState!();expect(error.responseKind).toBe('provider_error');expect(JSON.stringify(error)).not.toContain('secret');
  revoke=true;await expect(session.webAccessState!()).rejects.toThrow('cloud_session_changed');
  await expect(session.webAccessState!()).rejects.toThrow('cloud_session_changed');expect(calls).toBe(4);
 }finally{f.cleanup();}
});

test('normal Photos diagnostic reveals count only and never accepts malformed zones as success',async()=>{
 let reply={status:200,body:JSON.stringify({zones:[{zoneID:{zoneName:'private-fixture'},syncToken:'secret'}]})};
 const f=fixture(async input=>input.action==='check'?{dependencyReady:true}:authenticated,async input=>{expect(input.endpoint).toBe('photosZonesList');return reply;});
 try{
  await f.service.action({action:'login',accountId:f.account.id,password:'fixture'});
  const session=f.service.sharedSession(f.account.id);
  expect(await session.photosServiceState!()).toEqual({status:'zones_observed',httpStatus:200,zoneCount:1});
  reply={status:200,body:'{"zones":[{}]}'};expect((await session.photosServiceState!()).status).toBe('unrecognized');
  reply={status:401,body:'secret'};expect(await session.photosServiceState!()).toEqual({status:'http_error',httpStatus:401});
  f.store.revokeProviderSession('owner',f.account.id,'photos_web',f.store.providerSessionState('owner',f.account.id,'photos_web'));
  await expect(session.photosServiceState!()).rejects.toThrow('cloud_session_changed');
 }finally{f.cleanup();}
});


test('private binary upload transport binds custody generation and never returns receipts through status',async()=>{
 let calls=0,revoke=false;let f:ReturnType<typeof fixture>;
 f=fixture(async input=>input.action==='check'?{dependencyReady:true}:authenticated,undefined,async input=>{
  calls++;expect(input.username).toBe('owner@example.test');expect(input).not.toHaveProperty('password');
  if(revoke)f.store.revokeProviderSession('owner',f.account.id,'photos_web',f.store.providerSessionState('owner',f.account.id,'photos_web'));
  return {body:JSON.stringify({singleFile:{fileChecksum:'fixture',size:3,referenceChecksum:'fixture',receipt:'private-upload-receipt'}})};
 });
 try{
  await f.service.action({action:'login',accountId:f.account.id,password:'fixture'});
  const session=f.service.sharedSession(f.account.id),source={albumGuid:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',privatePath:'/private/fixture/content',bytes:3,sha256:'a'.repeat(64)};
  expect((await session.uploadBytes!(source)).size).toBe(3);expect(calls).toBe(1);
  expect(JSON.stringify(await f.service.status(f.account.id))).not.toContain('private-upload-receipt');
  revoke=true;await expect(session.uploadBytes!(source)).rejects.toThrow('cloud_session_changed');expect(calls).toBe(2);
  await expect(session.uploadBytes!(source)).rejects.toThrow('cloud_session_changed');expect(calls).toBe(2);
 }finally{f.cleanup();}
});
