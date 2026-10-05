import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {SharedAlbumService} from './shared-albums.js';
import {PhotosService} from './service.js';
import {photosRegistration} from './module.js';
import {ModuleRuntime} from '../modules/runtime.js';
const accountId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(){
 const db=new Database(':memory:');let generation=1,owner='owner',writes=0,loseReply=false,allow=true;
 const albums=new Map<string,any>();
 const local=new PhotosService(db,{read:async()=>({}),inspect:async()=>({}),apply:async()=>({status:'applied'})},()=>({read:true,write:allow,delete:false}),()=>owner);
 const session=()=>({accountId,dsid:'123456789',protocol:'legacy_shared_streams' as const,serviceOrigin:'https://p37-sharedstreams.icloud.com',generation,accountRevision:1,request:async(url:string,init:RequestInit)=>{
  const endpoint=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body as string);
  if(endpoint==='webgetalbumslist')return Response.json({albums:[...albums.values()]});
  if(endpoint==='webgetalbumview')return Response.json({albums:body.albumguids.flatMap((id:string)=>albums.has(id)?[albums.get(id)]:[])});
  if(endpoint==='webgetassetcount')return Response.json({albumassetcount:albums.get(body.albumguid)?.count??0});
  writes++;
  if(endpoint==='createalbum')albums.set(body.albumguid,{albumguid:body.albumguid,ownerdsid:'123456789',attributes:body.attributes,albumctag:'1',count:0});
  else if(endpoint==='updatealbum'){const a=albums.get(body.albumguid);a.attributes={...a.attributes,...body.attributes};a.albumctag=String(Number(a.albumctag)+1);}
  else if(endpoint==='deletealbum')albums.delete(body.albumguid);
  else throw Error('unexpected endpoint');
  if(loseReply)throw Error('private-token-lost-reply');
  return Response.json(endpoint==='createalbum'?{albumguid:body.albumguid}:{});
 }});
 const create=(account=accountId,currentOwner=owner)=>new SharedAlbumService({db,owner:currentOwner,accountId:account,currentOwner:()=>owner,policy:()=>({read:true,write:allow,delete:false}),session});
 return {db,local,service:create(),create,albums,writes:()=>writes,lose:()=>loseReply=true,revoke:()=>generation++,owner:()=>owner='other',disable:()=>allow=false};
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
  expect(f.writes()).toBe(0);expect(f.db.query('SELECT * FROM photos_shared_operations').all()).toEqual([]);
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
  f.db.query('UPDATE photos_shared_operations SET started=? WHERE id=?').run(Date.now()-241000,p.operationId);
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
