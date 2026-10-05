import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {SHARED_RECOVERY_GRACE_MS} from './shared-stream-protocol.js';
import {SharedAlbumService} from './shared-albums.js';
import {PhotosService} from './service.js';
import {photosRegistration} from './module.js';
import {ModuleRuntime} from '../modules/runtime.js';
const accountId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(){
 const db=new Database(':memory:');let generation=1,owner='owner',writes=0,uploads=0,cleanups=0,loseUpload=false,loseReply=false,allow=true;
 const albums=new Map<string,any>();
 const local=new PhotosService(db,{read:async()=>({}),inspect:async()=>({}),apply:async()=>({status:'applied'})},()=>({read:true,write:allow,delete:false}),()=>owner);
 const session=()=>({accountId,dsid:'123456789',protocol:'legacy_shared_streams' as const,serviceOrigin:'https://p37-sharedstreams.icloud.com',generation,accountRevision:1,uploadBytes:async()=>{uploads++;if(loseUpload)throw Error('lost binary response');return {fileChecksum:'fixture',size:3,referenceChecksum:'fixture',receipt:'private-receipt'};},request:async(url:string,init:RequestInit)=>{
  const endpoint=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body as string);
  if(endpoint==='webgetalbumslist')return Response.json({albums:[...albums.values()]});
  if(endpoint==='webgetalbumview')return Response.json({albums:body.albumguids.flatMap((id:string)=>albums.has(id)?[albums.get(id)]:[])});
  if(endpoint==='webgetassetcount')return Response.json({albumassetcount:albums.get(body.albumguid)?.count??0});
  if(endpoint==='webgetassets'){const a=albums.get(body.albumguid);return Response.json({records:(a.assets??[]).slice(Number(body.offset),Number(body.offset)+100).flatMap((id:string)=>[{recordType:'CPLMaster',recordName:`master-${id}`,fields:{}},{recordType:'CPLAsset',recordName:id,fields:{masterRef:{value:{recordName:`master-${id}`}}}}])});}
  if(endpoint==='webuploadstatus')return Response.json(body.uploadjobids.map((id:string)=>({uploadjobid:id,status:'COMPLETED'})));
  writes++;
  if(endpoint==='createalbum')albums.set(body.albumguid,{albumguid:body.albumguid,ownerdsid:'123456789',attributes:body.attributes,albumctag:'1',count:0});
  else if(endpoint==='updatealbum'){const a=albums.get(body.albumguid);a.attributes={...a.attributes,...body.attributes};a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='setalbumpublic'){const a=albums.get(body.albumguid);a.attributes.ispublic=body.ispublic;a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='share'){const a=albums.get(body.albumguid);a.sharinginfo.push(...body.invitations.map((i:any)=>({...i,sharingtype:'pending'})));a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='unshare'){const a=albums.get(body.albumguid);a.sharinginfo=a.sharinginfo.filter((p:any)=>!body.invitations.includes(p.invitationguid));a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='deleteassets'){const a=albums.get(body.albumguid);const targets=a.partialRemoval?body.assets.slice(0,1):body.assets;a.assets=a.assets.filter((id:string)=>!targets.includes(id));if(a.dropUnselected)a.assets=[];a.count=a.assets.length;a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='webputasset'){const a=albums.get(body.albumguid);a.assets??=[];a.assets.push(body.assetguid);a.count=a.assets.length;a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='deletealbum')albums.delete(body.albumguid);
  else throw Error('unexpected endpoint');
  if(loseReply)throw Error('private-token-lost-reply');
  return Response.json(endpoint==='createalbum'?{albumguid:body.albumguid}:endpoint==='webputasset'?{albumguid:body.albumguid,assetguid:body.assetguid,uploadjobid:'retained-job'}:{});
 }});
 const create=(account=accountId,currentOwner=owner)=>new SharedAlbumService({db,owner:currentOwner,accountId:account,currentOwner:()=>owner,policy:()=>({read:true,write:allow,delete:false}),session,stageUpload:async(assetId,representation)=>({assetId,representation,filename:'fixture.jpg',livePhotoStillOnly:false,mediaType:'photo',bytes:3,sha256:'a'.repeat(64),privatePath:'/private/fixture/content'}),releaseUpload:async()=>{cleanups++;}});
 return {db,local,service:create(),create,albums,cleanups:()=>cleanups,uploads:()=>uploads,loseBinary:()=>loseUpload=true,writes:()=>writes,lose:()=>loseReply=true,revoke:()=>generation++,owner:()=>owner='other',disable:()=>allow=false};
}
test('experimental true Shared Album lifecycle requires review and separate exact server readback',async()=>{
 const f=fixture();try{
  const created=await f.service.prepare({action:'create_shared_album',title:'Disposable fixture',experimental:true});expect(f.writes()).toBe(0);
  await expect(f.service.apply(created.operationId,false)).rejects.toThrow('confirmation_required');
  const result=await f.service.apply(created.operationId,true);expect(result.status).toBe('applied');expect(result.result.serverReadbackVerified).toBe(true);expect(result.result.crossDeviceObserved).toBe(false);
  const renamed=await f.service.prepare({action:'rename_shared_album',albumId:created.albumId,title:'Renamed',experimental:true});expect((await f.service.apply(renamed.operationId,true)).status).toBe('applied');
  const deleted=await f.service.prepare({action:'delete_empty_shared_album',albumId:created.albumId,experimental:true});expect((await f.service.apply(deleted.operationId,true)).status).toBe('applied');expect(f.albums.size).toBe(0);expect(f.writes()).toBe(3);
 }finally{f.db.close();}
});
test('lost writes interlock local and shared operations; reconciliation reads without retry',async()=>{
 const f=fixture();try{
  const plan=await f.service.prepare({action:'create_shared_album',title:'Unknown fixture',experimental:true});f.lose();
  expect((await f.service.apply(plan.operationId,true)).status).toBe('outcome_unknown');expect(f.writes()).toBe(1);
  expect((await f.service.apply(plan.operationId,true)).status).toBe('outcome_unknown');expect(f.writes()).toBe(1);
  await expect(f.local.prepare({action:'create_album',title:'Cannot bypass'})).rejects.toThrow('unresolved_operation');
  await expect(f.service.prepare({action:'create_shared_album',title:'Cannot bypass',experimental:true})).rejects.toThrow('unresolved_operation');
  const result=await f.service.reconcile(plan.operationId);expect(result.status).toBe('reconciled');expect(result.result.operationCausedChangeVerified).toBe(false);expect(f.writes()).toBe(1);expect(JSON.stringify(result)).not.toContain('private-token');
 }finally{f.db.close();}
});
test('prepared operations are bound to custody epoch, owner, policy and exact account',async()=>{
 for(const change of ['revoke','owner','disable'] as const){
  const f=fixture();try{const p=await f.service.prepare({action:'create_shared_album',title:'Fixture',experimental:true});f[change]();await expect(f.service.apply(p.operationId,true)).rejects.toThrow();expect(f.writes()).toBe(0);}finally{f.db.close();}
 }
 const f=fixture();try{
  const p=await f.service.prepare({action:'create_shared_album',title:'Fixture',experimental:true});
  const foreign=f.create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');expect(()=>foreign.status(p.operationId)).toThrow('operation_not_found');
  await expect(foreign.prepare({action:'rename_shared_album',albumId:p.albumId,title:'Substitution',experimental:true})).rejects.toThrow('account_mismatch');expect(f.writes()).toBe(0);
 }finally{f.db.close();}
});
test('participant, modern collections and nonempty albums cannot pass deletion preflight',async()=>{
 const f=fixture();try{
  const guid='11111111-1111-4111-8111-111111111111';const albumId=`shared-album:${accountId}:${guid}`;
  for(const album of [{ownerdsid:'other'},{requiresminimumos:true},{count:1}]){
   f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Fixture'},count:0,...album});
   await expect(f.service.prepare({action:'delete_empty_shared_album',albumId,experimental:true})).rejects.toThrow();
  }
  expect(f.writes()).toBe(0);expect(f.db.query('SELECT status FROM photos_shared_operations').all().every((row:any)=>row.status==='rejected')).toBe(true);
 }finally{f.db.close();}
});
test('concurrent apply and reconstructed service never dispatch the same intent twice',async()=>{
 const f=fixture();try{
  const p=await f.service.prepare({action:'create_shared_album',title:'Fixture',experimental:true});
  await Promise.all([f.service.apply(p.operationId,true),f.service.apply(p.operationId,true)]);
  expect(f.writes()).toBe(1);expect((await f.create().apply(p.operationId,true)).status).toBe('applied');expect(f.writes()).toBe(1);
 }finally{f.db.close();}
});
test('crash reconciliation waits for actor deadline and cannot blindly resume dispatch',async()=>{
 const f=fixture();try{
  const p=await f.service.prepare({action:'create_shared_album',title:'Fixture',experimental:true});f.lose();await f.service.apply(p.operationId,true);
  f.db.query("UPDATE photos_shared_operations SET status='executing',started=? WHERE id=?").run(Date.now(),p.operationId);
  await expect(f.create().reconcile(p.operationId)).rejects.toThrow('still_executing');
  f.db.query('UPDATE photos_shared_operations SET started=? WHERE id=?').run(Date.now()-91000,p.operationId);
  await expect(f.create().reconcile(p.operationId)).rejects.toThrow('still_executing');
  expect(f.writes()).toBe(1);
  f.db.query('UPDATE photos_shared_operations SET started=? WHERE id=?').run(Date.now()-SHARED_RECOVERY_GRACE_MS-1000,p.operationId);
  expect((await f.create().reconcile(p.operationId)).status).toBe('reconciled');expect(f.writes()).toBe(1);
 }finally{f.db.close();}
});
test('shared tools use the same Photos scopes and global revocation boundary',async()=>{
 const f=fixture();try{
  const policy=()=>({read:true,write:true,delete:false});const registration=photosRegistration(f.local,policy,()=>f.service);const runtime=new ModuleRuntime().register(registration);await runtime.start();
  expect(registration.tools.find(t=>t.tool.name==='photos_shared_prepare')!.requiredScopes).toEqual(['photos.read','photos.write']);
  const prepare=registration.tools.find(t=>t.tool.name==='photos_shared_prepare')!;
  expect((await prepare.run({action:'create_shared_album',title:'Fixture',experimental:false})).isError).toBe(true);expect(f.writes()).toBe(0);
  await runtime.dispose();
 }finally{f.db.close();}
});

test('health read keeps one identity across polls and service recreation without retry',async()=>{
 const db=new Database(':memory:');let resolve!:(value:Response)=>void,calls=0,generation=1;
 const session=()=>({accountId,dsid:'123',protocol:'legacy_shared_streams' as const,serviceOrigin:'https://p37-sharedstreams.icloud.com',generation,accountRevision:1,request:async(_url:string,init:RequestInit)=>{
  calls++;expect(new Headers(init.headers).get('x-photos-inventory-probe')).toBe('true');
  return new Promise<Response>(r=>resolve=r);
 }});
 const create=()=>new SharedAlbumService({db,owner:'owner',accountId,currentOwner:()=> 'owner',policy:()=>({read:true,write:true,delete:false}),session});
 try{
  const a=await create().health() as any;expect(a.status).toBe('read_pending');
  const b=await create().health() as any;expect(b.readId).toBe(a.readId);expect(calls).toBe(1);
  resolve(Response.json({albums:[]}));
  let completed:any;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,1));completed=await create().health();if(completed.status!=='read_pending')break;}
  expect(completed.status).toBe('remote_inventory_verified');expect(completed.readId).toBe(a.readId);expect(calls).toBe(1);
  generation++;const next=await create().health() as any;expect(next.readId).not.toBe(a.readId);expect(calls).toBe(2);
  resolve(Response.json({albums:[]}));await new Promise(r=>setTimeout(r,5));
 }finally{db.close();}
});

test('reviewed permission changes retain album identity, warn about public exposure and reconcile lost writes',async()=>{
 const f=fixture();const guid='33333333-3333-4333-8333-333333333333',albumId=`shared-album:${accountId}:${guid}`;
 f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Reviewed fixture',ispublic:'0',allowcontributions:'1'},albumctag:'1',count:0});
 try{
  const plan=await f.service.prepare({action:'set_shared_contributions',albumId,enabled:false,experimental:true});expect(f.writes()).toBe(0);
  expect((await f.service.apply(plan.operationId,true)).status).toBe('applied');
  expect(f.albums.get(guid).attributes).toEqual({name:'Reviewed fixture',ispublic:'0',allowcontributions:'0'});
  const publicPlan=await f.service.prepare({action:'set_shared_public_access',albumId,enabled:true,experimental:true});
  expect(publicPlan.warning).toContain('anyone with its public link');
  f.lose();expect((await f.service.apply(publicPlan.operationId,true)).status).toBe('outcome_unknown');
  const sent=f.writes();await f.service.apply(publicPlan.operationId,true);expect(f.writes()).toBe(sent);
  expect((await f.service.reconcile(publicPlan.operationId)).status).toBe('reconciled');expect(f.writes()).toBe(sent);
 }finally{f.db.close();}
});
test('unknown access state and changed names cannot pass permission preflight',async()=>{
 const f=fixture();const guid='44444444-4444-4444-8444-444444444444',albumId=`shared-album:${accountId}:${guid}`;
 f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Original',ispublic:'0'},albumctag:'1',count:0});
 try{
  await expect(f.service.prepare({action:'set_shared_contributions',albumId,enabled:true,experimental:true})).rejects.toThrow('shared_album_access_state_unknown');
  const plan=await f.service.prepare({action:'set_shared_public_access',albumId,enabled:true,experimental:true});
  f.albums.get(guid).attributes.name='Changed';
  await expect(f.service.apply(plan.operationId,true)).rejects.toThrow('stale_plan');expect(f.writes()).toBe(0);
 }finally{f.db.close();}
});

test('participant plans retain invitation identities and never resend a lost invitation',async()=>{
 const f=fixture();const guid='55555555-5555-4555-8555-555555555555',albumId=`shared-album:${accountId}:${guid}`;
 f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Private fixture'},albumctag:'1',count:0,sharinginfo:[{invitationguid:'owner-id',personid:'123456789',sharingtype:'owned',email:'owner@example.test'}]});
 try{
  await expect(f.service.prepare({action:'remove_shared_participant',albumId,invitationId:'owner-id',experimental:true})).rejects.toThrow('shared_album_removable_participant_required');
  await expect(f.service.prepare({action:'invite_shared_participants',albumId,emails:['owner@example.test'],experimental:true})).rejects.toThrow('shared_album_participant_exists');
  const plan=await f.service.prepare({action:'invite_shared_participants',albumId,emails:['reviewed@example.test'],experimental:true});
  const invitation=plan.before.preparedInvitations![0]!;expect(plan.mayNotify).toBe(true);expect(f.writes()).toBe(0);
  f.lose();expect((await f.service.apply(plan.operationId,true)).status).toBe('outcome_unknown');
  expect(f.albums.get(guid).sharinginfo[1].invitationguid).toBe(invitation.invitationGuid);
  await f.service.apply(plan.operationId,true);expect(f.writes()).toBe(1);
  expect((await f.service.reconcile(plan.operationId)).status).toBe('reconciled');expect(f.writes()).toBe(1);
  const removal=await f.service.prepare({action:'remove_shared_participant',albumId,invitationId:invitation.invitationGuid,experimental:true});
  expect((await f.service.apply(removal.operationId,true)).status).toBe('outcome_unknown');
  expect((await f.service.reconcile(removal.operationId)).status).toBe('reconciled');expect(f.albums.get(guid).sharinginfo.length).toBe(1);
 }finally{f.db.close();}
});

test('background prepare and apply retain one operation ID and never resend on polling',async()=>{
 const f=fixture();
 const wait=async(id:string)=>{let row:any;for(let i=0;i<100;i++){row=f.service.status(id);if(!row.inFlight)return row;await new Promise(r=>setTimeout(r,1));}throw Error('fixture operation did not settle');};
 try{
  const pending=f.service.prepareBackground({action:'create_shared_album',title:'Background fixture',experimental:true});
  expect(pending.status).toBe('preparing');expect(pending.inFlight).toBe(true);expect(f.writes()).toBe(0);
  const ready=await wait(pending.operationId);expect(ready.status).toBe('prepared');expect(ready.result.operationId).toBe(pending.operationId);
  const applying=f.service.applyBackground(pending.operationId,true);expect(applying.inFlight).toBe(true);
  f.service.applyBackground(pending.operationId,true);
  const done=await wait(pending.operationId);expect(done.status).toBe('applied');expect(f.writes()).toBe(1);
  f.service.applyBackground(pending.operationId,true);expect(f.writes()).toBe(1);
  f.db.query("UPDATE photos_shared_operations SET status='preparing' WHERE id=?").run(pending.operationId);
  expect(f.create().status(pending.operationId).result.error).toBe('shared_album_prepare_interrupted');expect(f.writes()).toBe(1);
 }finally{f.db.close();}
});


test('shared-copy removal verifies exact membership and preserves unselected copies',async()=>{
 for(const mode of ['success','lost','partial','collateral'] as const){
  const f=fixture(),guid='66666666-6666-4666-8666-666666666666',albumId=`shared-album:${accountId}:${guid}`;
  f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Copy fixture'},albumctag:'1',count:3,assets:['copy-a','copy-b','copy-c'],partialRemoval:mode==='partial',dropUnselected:mode==='collateral'});
  try{
   await expect(f.service.prepare({action:'remove_shared_assets',albumId,assetGuids:['local-original-id'],experimental:true})).rejects.toThrow('shared_album_asset_not_found');expect(f.writes()).toBe(0);
   const plan=await f.service.prepare({action:'remove_shared_assets',albumId,assetGuids:['copy-a','copy-b'],experimental:true});
   expect('membership' in plan.before && plan.before.membership.complete).toBe(true);if(mode==='lost')f.lose();
   const result=await f.service.apply(plan.operationId,true);expect(result.status).toBe(mode==='success'?'applied':'outcome_unknown');expect(f.writes()).toBe(1);
   await f.service.apply(plan.operationId,true);expect(f.writes()).toBe(1);
   if(mode==='lost'){expect((await f.service.reconcile(plan.operationId)).status).toBe('reconciled');expect(f.writes()).toBe(1);}
   if(mode==='success'||mode==='lost')expect(f.albums.get(guid).assets).toEqual(['copy-c']);
  }finally{f.db.close();}
 }
});


test('reviewed upload retains source digest and dispatch stages; recovery never uploads or publishes twice',async()=>{
 for(const mode of ['success','lost-publication','lost-binary'] as const){
  const f=fixture(),guid='77777777-7777-4777-8777-777777777777',albumId=`shared-album:${accountId}:${guid}`;
  f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Upload fixture'},albumctag:'1',count:0,assets:[]});
  try{
   const plan=await f.service.prepare({action:'upload_shared_asset',albumId,assetId:'asset:1234567890abcdef:88888888-8888-4888-8888-888888888888',representation:'original',experimental:true});
   expect('upload' in plan.before&&plan.before.upload?.sha256).toBe('a'.repeat(64));expect(JSON.stringify(plan)).not.toContain('/private/');expect(f.uploads()).toBe(0);
   if(mode==='lost-publication')f.lose();if(mode==='lost-binary')f.loseBinary();
   const result=await f.service.apply(plan.operationId,true);expect(result.status).toBe(mode==='success'?'applied':'outcome_unknown');
   expect(f.uploads()).toBe(1);expect(f.writes()).toBe(mode==='lost-binary'?0:1);
   await f.create().apply(plan.operationId,true);expect(f.uploads()).toBe(1);
   if(mode==='lost-publication'){const album=f.albums.get(guid),copies=album.assets;album.assets=[];album.count=0;expect((await f.create().reconcile(plan.operationId)).status).toBe('outcome_unknown');album.assets=copies;album.count=copies.length;expect((await f.create().reconcile(plan.operationId)).status).toBe('reconciled');expect(f.writes()).toBe(1);}
   if(mode==='lost-binary'){const recovered=await f.create().reconcile(plan.operationId);expect(recovered.status).toBe('not_published');expect(recovered.result.binaryTransferOutcome).toBe('unknown');expect(recovered.result.publicationDispatched).toBe(false);expect(recovered.result.remoteStagedResourceMayRemain).toBe(true);expect(f.writes()).toBe(0);await f.service.prepare({action:'rename_shared_album',albumId,title:'Explicit next plan',experimental:true});}
   expect(JSON.stringify(f.service.status(plan.operationId))).not.toContain('private-receipt');expect(f.uploads()).toBe(1);
   expect(f.cleanups()).toBe(1);expect(f.service.status(plan.operationId).upload).not.toHaveProperty('source');
  }finally{f.db.close();}
 }
});


test('cancelling an unexecuted upload discards only its staged source and cannot resume',async()=>{
 const f=fixture(),guid='99999999-9999-4999-8999-999999999999',albumId=`shared-album:${accountId}:${guid}`;
 f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Cancel fixture'},albumctag:'1',count:0,assets:[]});
 try{
  const p=await f.service.prepare({action:'upload_shared_asset',albumId,assetId:'asset:1234567890abcdef:88888888-8888-4888-8888-888888888888',representation:'original',experimental:true});
  expect((await f.service.cancel(p.operationId)).status).toBe('cancelled');expect(f.cleanups()).toBe(1);
  await f.service.apply(p.operationId,true);await f.service.cancel(p.operationId);expect(f.uploads()).toBe(0);expect(f.writes()).toBe(0);expect(f.cleanups()).toBe(1);
 }finally{f.db.close();}
});


test('album inventory returns promptly and polls one retained account-bound job',async()=>{
 const db=new Database(':memory:');let calls=0,resolve!:(response:Response)=>void,generation=1;
 const session=()=>({accountId,dsid:'123',protocol:'legacy_shared_streams' as const,serviceOrigin:'https://p37-sharedstreams.icloud.com',generation,accountRevision:1,request:async(_url:string,init:RequestInit)=>{calls++;expect(new Headers(init.headers).get('x-photos-inventory-probe')).toBe('true');return new Promise<Response>(r=>resolve=r);}});
 const create=()=>new SharedAlbumService({db,owner:'owner',accountId,currentOwner:()=> 'owner',policy:()=>({read:true,write:true,delete:false}),session});
 try{
  const initial=create().albumsBackground() as any;expect(initial.status).toBe('read_pending');expect(calls).toBe(1);
  expect((create().albumsBackground(undefined,initial.readId) as any).readId).toBe(initial.readId);expect(calls).toBe(1);
  resolve(Response.json({albums:[]}));await new Promise(r=>setTimeout(r,1));
  expect((create().albumsBackground(undefined,initial.readId) as any).status).toBe('complete');expect(calls).toBe(1);
  const fresh=create().albumsBackground(undefined,undefined,true) as any;expect(fresh.readId).not.toBe(initial.readId);expect(calls).toBe(2);
  expect(()=>create().albumsBackground(undefined,initial.readId)).toThrow('shared_album_read_not_found');
  resolve(Response.json({albums:[]}));await new Promise(r=>setTimeout(r,1));generation++;
  expect(()=>create().albumsBackground(undefined,fresh.readId)).toThrow('shared_album_read_not_found');
 }finally{db.close();}
});


test('remote content review pages retain one complete membership snapshot and exact shared-copy IDs',async()=>{
 const f=fixture(),guid='AAAAAAAA-1111-4111-8111-111111111111',albumId=`shared-album:${accountId}:${guid}`;
 f.albums.set(guid,{albumguid:guid,ownerdsid:'123456789',attributes:{name:'Content review'},albumctag:'1',count:3,assets:['copy-a','copy-b','copy-c']});
 try{
  expect(()=>f.service.albumsBackground(undefined,undefined,false,{offset:0,limit:2})).toThrow('shared_album_content_arguments_invalid');
  const pending=f.service.albumsBackground(albumId,undefined,false,{offset:0,limit:2});
  let first:any;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,1));first=f.service.albumsBackground(albumId,pending.readId,false,{offset:0,limit:2});if(first.status!=='read_pending')break;}
  expect(first.status).toBe('complete');expect(first.membership.assets.map((a:any)=>a.assetGuid)).toEqual(['copy-a','copy-b']);expect(first.membership.snapshotComplete).toBe(true);expect(first.membership.complete).toBe(false);
  const second:any=f.create().albumsBackground(albumId,pending.readId,false,{offset:first.membership.nextOffset,limit:2});
  expect(second.membership.assets.map((a:any)=>a.assetGuid)).toEqual(['copy-c']);expect(second.membership.nextOffset).toBeNull();expect(second.membership.originalLibraryIdentityVerified).toBe(false);expect(f.writes()).toBe(0);
  expect(()=>f.service.albumsBackground(albumId,pending.readId)).toThrow('shared_album_read_not_found');
 }finally{f.db.close();}
});
