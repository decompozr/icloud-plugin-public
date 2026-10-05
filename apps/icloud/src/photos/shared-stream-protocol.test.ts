import {describe,expect,test} from 'bun:test';
import {executeSharedStreamMutation,sharedStreamRequest,sharedStreamURL,type SharedStreamSession} from './shared-stream-protocol.js';
const albumGuid='11111111-1111-4111-8111-111111111111';
const mutation={action:'create_shared_album' as const,albumGuid,title:'Disposable protocol fixture'};
function session(request:SharedStreamSession['request']):SharedStreamSession{return {accountId:'owner-account',protocol:'legacy_shared_streams',dsid:'123456789',serviceOrigin:'https://p37-sharedstreams.icloud.com',request};}
describe('internal API-only Shared Album contract',()=>{
 test('retains the prepared shared identity and never opts into public access or automatic expiry',()=>{
  const request=sharedStreamRequest(mutation);expect(request.endpoint).toBe('createalbum');
  expect(request.payload).toEqual({albumguid:albumGuid,attributes:{name:mutation.title,allowcontributions:'1'}});
  expect(()=>sharedStreamRequest({...mutation,action:'create_album'} as any)).toThrow();
 });
 test('rejects account substitution and hostile service routing before sending',async()=>{
  let calls=0;const s=session(async()=>{calls++;return new Response('{}');});
  await expect(executeSharedStreamMutation(s,'different-account',mutation)).rejects.toThrow('account_mismatch');
  await expect(executeSharedStreamMutation({...s,protocol:'modern_shared_collection'} as any,'owner-account',mutation)).rejects.toThrow('unsupported_shared_album_protocol');
  for(const serviceOrigin of ['http://p37-sharedstreams.icloud.com','https://p37-sharedstreams.icloud.com.evil.test','https://user:secret@p37-sharedstreams.icloud.com','https://p37-sharedstreams.icloud.com/path','https://p37-sharedstreams.icloud.com/?token=secret']){
   await expect(executeSharedStreamMutation({...s,serviceOrigin},'owner-account',mutation)).rejects.toThrow();
  }
  expect(()=>sharedStreamURL(s,'owner-account','../createalbum')).toThrow();expect(calls).toBe(0);
 });
 test('sends once, forbids redirects and requires exact identity acknowledgement',async()=>{
  let calls=0;const s=session(async(url,init)=>{calls++;expect(url).toBe('https://p37-sharedstreams.icloud.com/123456789/sharedstreams/createalbum');expect(init.redirect).toBe('error');expect(init.signal).toBeDefined();return Response.json({albumguid:albumGuid});});
  expect(await executeSharedStreamMutation(s,'owner-account',mutation)).toEqual({status:'acknowledged_readback_required',albumGuid,serverSyncVerified:false});expect(calls).toBe(1);
  const wrong=session(async()=>Response.json({albumguid:'22222222-2222-4222-8222-222222222222'}));
  expect((await executeSharedStreamMutation(wrong,'owner-account',mutation)).status).toBe('outcome_unknown');
 });
 test('preserves unknown writes without retry or leaking provider data',async()=>{
  for(const response of [new Response('secret-server-data',{status:500}),new Response('{broken'),new Response('x'.repeat(65537))]){
   let calls=0;const result=await executeSharedStreamMutation(session(async()=>{calls++;return response;}),'owner-account',mutation);
   expect(result.status).toBe('outcome_unknown');expect(calls).toBe(1);expect(JSON.stringify(result)).not.toContain('secret-server-data');
  }
  const result=await executeSharedStreamMutation(session(async()=>{throw new Error('credential-must-not-leak');}),'owner-account',mutation);
  expect(JSON.stringify(result)).not.toContain('credential-must-not-leak');expect(result.status).toBe('outcome_unknown');
 });
 test('rename/delete acknowledgements retain the need for independent readback',async()=>{
  const captured:any[]=[];const s=session(async(url,init)=>{captured.push({url,body:JSON.parse(init.body as string)});return new Response('',{status:200});});
  for(const change of [{action:'rename_shared_album' as const,albumGuid,title:'Renamed fixture'},{action:'delete_shared_album' as const,albumGuid}])expect((await executeSharedStreamMutation(s,'owner-account',change)).status).toBe('acknowledged_readback_required');
  expect(captured.map(v=>v.body)).toEqual([{albumguid:albumGuid,attributes:{name:'Renamed fixture'}},{albumguid:albumGuid}]);
 });
});
