import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {PhotosService} from './service.js';
import {PhotosError,type PhotosProvider} from './contracts.js';
import {photosRegistration} from './module.js';
const id='asset:1234567890abcdef:11111111-1111-1111-1111-111111111111';
function setup(){const db=new Database(':memory:');let calls=0;let p={read:true,write:true,delete:true};let current:unknown={revision:1};const provider:PhotosProvider={read:async()=>({}),inspect:async()=>current,apply:async(_m,e)=>{calls++;if(JSON.stringify(current)!==JSON.stringify(e))throw new PhotosError('stale_plan');return {status:'applied'};}};const service=new PhotosService(db,provider,()=>p,()=> 'owner');return {db,service,provider,policy:()=>p,calls:()=>calls,change:()=>current={revision:2},revoke:()=>p={read:true,write:false,delete:false}};}
test('prepare is read-only; reviewed plan can execute only once including concurrent retries',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'create_album',title:'Test'});expect(t.calls()).toBe(0);const results=await Promise.all([t.service.apply(plan.operationId,true),t.service.apply(plan.operationId,true)]);expect(t.calls()).toBe(1);expect(t.service.status(plan.operationId).status).toBe('applied');expect(results.length).toBe(2);}finally{t.db.close();}});
test('stale snapshot rejects mutation and revoked policy stops execution',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'create_album',title:'Test'});t.change();expect((await t.service.apply(plan.operationId,true)).status).toBe('rejected');const p=await t.service.prepare({action:'create_album',title:'Another'});t.revoke();await expect(t.service.apply(p.operationId,true)).rejects.toThrow('forbidden');}finally{t.db.close();}});
test('uncertain provider result persists across service reconstruction and is never retried',async()=>{const t=setup();try{t.provider.apply=async()=>{throw new Error('private upstream detail');};const plan=await t.service.prepare({action:'create_album',title:'Test'});expect((await t.service.apply(plan.operationId,true)).status).toBe('outcome_unknown');const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');expect((await next.apply(plan.operationId,true)).result).toEqual({error:'provider_failed'});const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');expect(()=>other.status(plan.operationId)).toThrow('operation_not_found');}finally{t.db.close();}});
test('delete plan cannot be applied through ordinary write tool',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'delete_assets',assetIds:[id]});await expect(t.service.apply(plan.operationId,true)).rejects.toThrow('delete_scope_required');expect(t.calls()).toBe(0);expect((await t.service.apply(plan.operationId,true,true)).status).toBe('applied');}finally{t.db.close();}});
test('module requires delete consent and rejects unsafe input without provider calls',async()=>{const t=setup();try{const module=photosRegistration(t.service,t.policy);expect(module.tools.find(t=>t.tool.name==='photos_delete_apply')?.requiredScopes).toContain('photos.delete');const prepare=module.tools.find(t=>t.tool.name==='photos_prepare')!;expect((await prepare.run({action:'delete_assets',assetIds:[id]})).isError).toBe(true);expect((await prepare.run({action:'create_album',title:'ok',extra:true})).isError).toBe(true);expect(t.calls()).toBe(0);}finally{t.db.close();}});
test('expired plans and repeated unknown intents cannot execute',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'create_album',title:'Old'});t.db.query('UPDATE photos_operations SET expires=0 WHERE id=?').run(plan.operationId);await expect(t.service.apply(plan.operationId,true)).rejects.toThrow('plan_expired');const unknown=await t.service.prepare({action:'create_album',title:'Unknown'});t.db.query("UPDATE photos_operations SET status='outcome_unknown' WHERE id=?").run(unknown.operationId);await expect(t.service.prepare({action:'create_album',title:'Unknown'})).rejects.toThrow('unresolved_operation');expect(t.calls()).toBe(0);}finally{t.db.close();}});
test('different plans cannot race a library write',async()=>{const t=setup();try{let release!:()=>void;const gate=new Promise<void>(r=>release=r);t.provider.apply=async()=>{await gate;return {status:'applied'};};const a=await t.service.prepare({action:'create_album',title:'A'}),b=await t.service.prepare({action:'create_album',title:'B'});const running=t.service.apply(a.operationId,true);await expect(t.service.apply(b.operationId,true)).rejects.toThrow('another_operation_in_progress');release();await running;expect((await t.service.apply(b.operationId,true)).status).toBe('applied');}finally{t.db.close();}});
const sharedIntent={action:'post_to_shared_album',albumId:'album:1234567890abcdef:shared:22222222-2222-2222-2222-222222222222',assetIds:[id]};
test('native sharing is a single-use asynchronous review, including service restart and uncertain completion',async()=>{
 const t=setup();let opened=0;let result={status:'review_pending',localReadbackVerified:false,serverSyncVerified:false};
 t.provider.openReview=async()=>{opened++;return result;};t.provider.reviewStatus=async()=>result;
 try{const plan=await t.service.prepare(sharedIntent);expect((await t.service.apply(plan.operationId,true)).status).toBe('review_pending');expect(opened).toBe(1);expect(t.calls()).toBe(0);
  const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');expect((await next.apply(plan.operationId,true)).status).toBe('review_pending');expect(opened).toBe(1);
  const other=await next.prepare({action:'create_album',title:'Concurrent'});await expect(next.apply(other.operationId,true)).rejects.toThrow('another_operation_in_progress');
  result={...result,status:'posting_completed_membership_unverified'};expect((await next.reviewStatus(plan.operationId)).status).toBe('posting_completed_membership_unverified');await expect(next.prepare(sharedIntent)).rejects.toThrow('unresolved_operation');
  expect((await next.apply(plan.operationId,true)).status).toBe('posting_completed_membership_unverified');expect(opened).toBe(1);
 }finally{t.db.close();}
});
test('native sharing cancellation remains terminal for that operation, and other owners cannot reconcile it',async()=>{
 const t=setup();t.provider.openReview=async()=>({status:'review_pending'});t.provider.reviewStatus=async()=>({status:'cancelled_before_posting'});
 try{const plan=await t.service.prepare(sharedIntent);await t.service.apply(plan.operationId,true);expect((await t.service.reviewStatus(plan.operationId)).status).toBe('cancelled');expect((await t.service.apply(plan.operationId,true)).status).toBe('cancelled');const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');await expect(other.reviewStatus(plan.operationId)).rejects.toThrow('operation_not_found');expect((await t.service.prepare(sharedIntent)).status).toBe('prepared');}
 finally{t.db.close();}
});
test('native catalog selections are read-only and cannot substitute assets or cross owners',async()=>{
 const t=setup(),idAsset=id;t.provider.openCatalog=async(_request,id)=>({status:'catalog_review',operationId:id,assetIds:[idAsset]});let selection=[idAsset];
 t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:selection});
 try{const opened=await t.service.openCatalog({kind:'comparison',assetIds:[idAsset],albumId:sharedIntent.albumId});expect(t.calls()).toBe(0);expect((await t.service.catalogStatus(opened.reviewId)).status).toBe('selection_reviewed');
  selection=['asset:1234567890abcdef:33333333-3333-3333-3333-333333333333'];const invalid=await t.service.openCatalog({kind:'comparison',assetIds:[idAsset],albumId:sharedIntent.albumId});await expect(t.service.catalogStatus(invalid.reviewId)).rejects.toThrow('invalid_review_selection');const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');await expect(other.catalogStatus(opened.reviewId)).rejects.toThrow('review_not_found');
 }finally{t.db.close();}
});
test('shared presence reconciliation requires a closed native process and explicit owner evidence; never asserts server proof',async()=>{
 const t=setup(),copy='asset:1234567890abcdef:33333333-3333-3333-3333-333333333333';let alive=true;
 t.provider.openReview=async()=>({status:'review_pending'});
 t.provider.reviewStatus=async()=>({status:'posting_completed_membership_unverified',actualAlbum:'22222222-2222-2222-2222-222222222222/L0/040',nativeProcessAlive:alive});
 t.provider.read=async(command,input)=>command==='compare'?{results:[{assetId:copy,status:'confirmed'}]}:{id:(input as {assetId:string}).assetId,filename:'fixture.png',date:null,mediaType:'photo',title:'',description:'',keywords:[],favorite:false,persons:[],width:100,height:100,shared:(input as {assetId:string}).assetId===copy};
 try{const plan=await t.service.prepare(sharedIntent);await t.service.apply(plan.operationId,true);const observation={operationId:plan.operationId,confirm:true,albumId:sharedIntent.albumId,sharedAssetId:copy,observedOn:'another_device',contentReviewed:'still',note:'Owner checked this exact fixture on another device.'};
  await expect(t.service.recordSharedObservation(observation)).rejects.toThrow('native_review_not_closed');alive=false;
  await expect(t.service.recordSharedObservation({...observation,albumId:'album:1234567890abcdef:shared:44444444-4444-4444-4444-444444444444'})).rejects.toThrow('observed_destination_mismatch');
  const result=await t.service.recordSharedObservation(observation);expect(result.status).toBe('owner_verified_presence');expect(result.result.crossDeviceObserved).toBe(true);expect(result.result.serverSyncVerified).toBe(false);expect(result.result.operationCausedUploadVerified).toBe(false);expect(result.result.observation.evidenceSource).toBe('owner_report');expect((await t.service.operationStatus(plan.operationId)).status).toBe('owner_verified_presence');
 }finally{t.db.close();}
});
test('previously prepared alternate-destination sharing cannot bypass unresolved source recovery',async()=>{
 const t=setup();t.provider.openReview=async()=>({status:'review_pending'});t.provider.reviewStatus=async()=>({status:'posting_completed_membership_unverified'});
 try{const first=await t.service.prepare(sharedIntent),second=await t.service.prepare({...sharedIntent,albumId:'album:1234567890abcdef:shared:44444444-4444-4444-4444-444444444444'});await t.service.apply(first.operationId,true);await t.service.reviewStatus(first.operationId);await expect(t.service.apply(second.operationId,true)).rejects.toThrow('another_operation_in_progress');}
 finally{t.db.close();}
});
test('lost catalog launch response recovers exact selection from retained manifest and persists it across restart',async()=>{
 const t=setup();t.provider.openCatalog=async()=>{throw new Error('launch response lost');};t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:[id],manifestAssetIds:[id]});
 try{const opened=await t.service.openCatalog({kind:'comparison',assetIds:[id],albumId:sharedIntent.albumId});expect(opened.status).toBe('outcome_unknown');expect((await t.service.catalogStatus(opened.reviewId)).status).toBe('selection_reviewed');
  t.provider.reviewStatus=async()=>{throw new Error('temporary files no longer available');};const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');expect((await next.catalogStatus(opened.reviewId)).result.selectedAssetIds).toEqual([id]);expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});
