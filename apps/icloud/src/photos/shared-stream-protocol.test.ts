import {z} from 'zod';
import {describe,expect,test} from 'bun:test';
import {sharedReadDiagnostic,readSharedStreamMembership,readSharedStreamAssetPage,SharedStreamReadError,executeSharedStreamMutation,sharedStreamRequest,sharedStreamURL,readSharedStreamAlbums,type SharedStreamSession} from './shared-stream-protocol.js';
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

describe('remote Shared Album readback identity and boundaries',()=>{
 test('separates transport, HTTP and model failures without exposing provider content',async()=>{
  const cases:[SharedStreamSession['request'],SharedStreamReadError['diagnostic']][]=[
   [async()=>{throw new Error('secret-token');},{stage:'transport'}],
   [async()=>new Response('secret-token',{status:403}),{stage:'http',httpStatus:403}],
   [async()=>new Response('secret-token'),{stage:'decode',httpStatus:200}],
   [async()=>Response.json({secretToken:'secret-token'}),{stage:'schema',httpStatus:200,schemaIssues:[{path:'albums',code:'invalid_type',expected:'array',received:'undefined'}]}],
  ];
  for(const [request,expected] of cases){
   let caught:unknown;try{await readSharedStreamAlbums(session(request),'owner-account');}catch(error){caught=error;}
   expect(caught).toBeInstanceOf(SharedStreamReadError);expect((caught as SharedStreamReadError).diagnostic).toEqual(expected);
   expect(JSON.stringify(caught)).not.toContain('secret-token');
  }
 });
 const album={albumguid:albumGuid,ownerdsid:'123456789',albumctag:'fixture-change-tag',attributes:{name:'Fixture Shared Album',ispublic:'0',allowcontributions:'1'},sharinginfo:[{personid:'fixture-owner',sharingtype:'Owner',email:'owner@example.test'}]};
 test('reads exact GUID once, retains ownership/change evidence and strips arbitrary private fields',async()=>{
  let calls=0;const s=session(async(url,init)=>{calls++;expect(url.endsWith('/webgetalbumview')).toBe(true);expect(JSON.parse(init.body as string)).toEqual({albumguids:[albumGuid]});expect(init.redirect).toBe('error');return Response.json({albums:[{...album,providerSecret:'must-not-leak'}],sessionToken:'must-not-leak'});});
  const result=await readSharedStreamAlbums(s,'owner-account',albumGuid);
  expect(calls).toBe(1);expect(result.albums[0]?.rights).toBe('owner');expect(result.albums[0]?.protocol).toBe('legacy_candidate');expect(result.albums[0]?.changeTag).toBe('fixture-change-tag');expect(result.albums[0]?.participants).toHaveLength(1);
  expect(result.operationCausedChangeVerified).toBe(false);expect(result.crossDeviceObserved).toBe(false);expect(JSON.stringify(result)).not.toContain('must-not-leak');
 });
 test('inventory distinguishes modern/participant state and omits deleted entries without asserting write support',async()=>{
  const s=session(async(url,init)=>{expect(url.endsWith('/webgetalbumslist')).toBe(true);expect(init.body).toBe('{}');return Response.json({albums:[{...album,ownerdsid:'987654321',requiresminimumos:true},{...album,albumguid:'22222222-2222-4222-8222-222222222222',_deleted:true}]});});
  const result=await readSharedStreamAlbums(s,'owner-account');expect(result.albums).toHaveLength(1);expect(result.albums[0]?.rights).toBe('participant');expect(result.albums[0]?.protocol).toBe('modern_or_encrypted');
 });
 test('wrong account and malformed exact IDs reject before transport',async()=>{
  let calls=0;const s=session(async()=>{calls++;return Response.json({albums:[album]});});
  await expect(readSharedStreamAlbums(s,'other-account',albumGuid)).rejects.toThrow('account_mismatch');
  await expect(readSharedStreamAlbums(s,'owner-account','not-an-id')).rejects.toThrow();expect(calls).toBe(0);
 });
 test('missing/substituted/duplicate/deleted identities and incomplete models cannot satisfy exact readback',async()=>{
  for(const albums of [[],[{...album,albumguid:'22222222-2222-4222-8222-222222222222'}],[album,album],[{...album,_deleted:true}],[{albumguid:albumGuid}]]){
   await expect(readSharedStreamAlbums(session(async()=>Response.json({albums})),'owner-account',albumGuid)).rejects.toThrow('shared_album_readback_failed');
  }
 });
 test('bounds failures, sends once and exposes no server diagnostic or credential',async()=>{
  for(const response of [new Response('secret-fixture',{status:401}),new Response('not-json'),new Response('x'.repeat(1024*1024+1))]){
   let calls=0;await expect(readSharedStreamAlbums(session(async()=>{calls++;return response;}),'owner-account')).rejects.toThrow('shared_album_readback_failed');expect(calls).toBe(1);
  }
 });
});

test('opaque provider album identifiers remain visible but cannot become writable UUID targets',async()=>{
 const s=session(async()=>Response.json({albums:[{albumguid:'opaque-fixture-id',ownerdsid:'123456789'},{albumguid:albumGuid,ownerdsid:'123456789'}]}));
 const result=await readSharedStreamAlbums(s,'owner-account');
 expect(result.albums.length).toBe(1);expect(result.inventoryFullySupported).toBe(false);
 expect(result.unsupportedAlbums).toEqual([{albumIdentifier:'opaque-fixture-id',reason:'unsupported_identifier_format',writable:false}]);
 expect(()=>sharedStreamRequest({...mutation,albumGuid:'opaque-fixture-id'})).toThrow();
 await expect(readSharedStreamAlbums(s,'owner-account',albumGuid)).rejects.toThrow();
});

test('shared asset pages bind exact album and change tag, pair records and redact unrelated fields',async()=>{
 const master={recordType:'CPLMaster',recordName:'shared-master',fields:{secret:'must-not-escape'}};
 const asset={recordType:'CPLAsset',recordName:'shared-copy',fields:{masterRef:{value:{recordName:'shared-master'}},secret:'must-not-escape'}};
 let records:any[]=[master,asset];let calls=0;
 const s=session(async(url,init)=>{calls++;expect(url.endsWith('/webgetassets')).toBe(true);expect(JSON.parse(init.body as string)).toEqual({albumguid:albumGuid,albumctag:'observed-tag',offset:'10',limit:'14'});return Response.json({records});});
 const input={albumGuid,changeTag:'observed-tag',offset:10,limit:2};
 const page=await readSharedStreamAssetPage(s,'owner-account',input);
 expect(page.assets).toEqual([{assetGuid:'shared-copy',masterGuid:'shared-master'}]);expect(page.complete).toBe(false);expect(JSON.stringify(page)).not.toContain('must-not-escape');
 for(const broken of [[asset],[master],[master,asset,asset],[master,{...asset,serverErrorCode:'secret'}]]){
  records=broken;await expect(readSharedStreamAssetPage(s,'owner-account',input)).rejects.toThrow();
 }
 const before=calls;await expect(readSharedStreamAssetPage(s,'wrong-account',input)).rejects.toThrow();expect(calls).toBe(before);
});

test('complete shared membership rejects changed snapshots, repeated pages and truncated reads',async()=>{
 let metadataReads=0,mode='ok';
 const s=session(async(url,init)=>{
  expect(init.signal).toBeDefined();const body=JSON.parse(init.body as string);
  if(url.endsWith('webgetalbumview')){metadataReads++;return Response.json({albums:[{albumguid:albumGuid,ownerdsid:'123456789',albumctag:mode==='changed'&&metadataReads>1?'new':'same'}]});}
  if(url.endsWith('webgetassetcount'))return Response.json({albumassetcount:101});
  const offset=Number(body.offset);const amount=offset===0?100:1;
  const records=mode==='truncated'?[]:Array.from({length:amount},(_,i)=>{const n=mode==='repeated'?i:offset+i;return [{recordType:'CPLMaster',recordName:`master-${n}`,fields:{}},{recordType:'CPLAsset',recordName:`copy-${n}`,fields:{masterRef:{value:{recordName:`master-${n}`}}}}];}).flat();
  return Response.json({records});
 });
 const result=await readSharedStreamMembership(s,'owner-account',albumGuid);expect(result.assets.length).toBe(101);expect(result.complete).toBe(true);expect(result.originalLibraryIdentityVerified).toBe(false);
 for(const failure of ['changed','repeated','truncated']){mode=failure;metadataReads=0;await expect(readSharedStreamMembership(s,'owner-account',albumGuid)).rejects.toThrow();}
});

test('read diagnostics retain schema location without unknown keys or response values',()=>{
 const parsed=z.object({records:z.array(z.object({recordType:z.enum(['CPLAsset'])}))}).safeParse({records:[{recordType:'private-secret-value'}]});
 expect(parsed.success).toBe(false);
 if(!parsed.success){const diagnostic=sharedReadDiagnostic(parsed.error);expect(JSON.stringify(diagnostic)).toContain('records.[].recordType');expect(JSON.stringify(diagnostic)).not.toContain('private-secret-value');}
 expect(sharedReadDiagnostic(new Error('https://private.example/cookie-secret'))).toEqual({stage:'read',cause:'unclassified_read_failure'});
 expect(sharedReadDiagnostic(new Error('shared_album_asset_identity_mismatch'))).toEqual({stage:'read',cause:'shared_album_asset_identity_mismatch'});
});
