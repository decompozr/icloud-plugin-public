import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {PhotosService} from './service.js';
import {PhotosError,type PhotosProvider} from './contracts.js';
import {photosRegistration} from './module.js';
const id='asset:1234567890abcdef:11111111-1111-1111-1111-111111111111';
function setup(){const db=new Database(':memory:');let calls=0;let p={read:true,write:true,delete:true};let current:unknown={revision:1};const provider:PhotosProvider={read:async()=>({}),inspect:async()=>current,apply:async(_m,e)=>{calls++;if(JSON.stringify(current)!==JSON.stringify(e))throw new PhotosError('stale_plan');return {status:'applied'};}};const service=new PhotosService(db,provider,()=>p,()=> 'owner');return {db,service,provider,policy:()=>p,calls:()=>calls,change:()=>current={revision:2},revoke:()=>p={read:true,write:false,delete:false}};}
function historicalCatalog(t:ReturnType<typeof setup>,request:unknown){
 const reviewId=crypto.randomUUID();
 const assetIds=(request as {assetIds?:string[]}).assetIds??[id];
 t.db.query('INSERT INTO photos_reviews VALUES(?,?,?,?,?)').run(reviewId,'owner',JSON.stringify(request),'catalog_review',JSON.stringify({assetIds}));
 return {reviewId,status:'catalog_review'};
}
test('prepare is read-only; reviewed plan can execute only once including concurrent retries',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'create_album',title:'Test'});expect(t.calls()).toBe(0);const results=await Promise.all([t.service.apply(plan.operationId,true),t.service.apply(plan.operationId,true)]);expect(t.calls()).toBe(1);expect(t.service.status(plan.operationId).status).toBe('applied');expect(results.length).toBe(2);}finally{t.db.close();}});
test('stale snapshot rejects mutation and revoked policy stops execution',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'create_album',title:'Test'});t.change();expect((await t.service.apply(plan.operationId,true)).status).toBe('rejected');const p=await t.service.prepare({action:'create_album',title:'Another'});t.revoke();await expect(t.service.apply(p.operationId,true)).rejects.toThrow('forbidden');}finally{t.db.close();}});
test('uncertain provider result persists across service reconstruction and is never retried',async()=>{const t=setup();try{t.provider.apply=async()=>{throw new Error('private upstream detail');};const plan=await t.service.prepare({action:'create_album',title:'Test'});expect((await t.service.apply(plan.operationId,true)).status).toBe('outcome_unknown');const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');expect((await next.apply(plan.operationId,true)).result).toEqual({error:'provider_failed'});const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');expect(()=>other.status(plan.operationId)).toThrow('operation_not_found');}finally{t.db.close();}});
test('delete plan cannot be applied through ordinary write tool',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'delete_assets',assetIds:[id]});await expect(t.service.apply(plan.operationId,true)).rejects.toThrow('delete_scope_required');expect(t.calls()).toBe(0);expect((await t.service.apply(plan.operationId,true,true)).status).toBe('applied');}finally{t.db.close();}});
test('module requires delete consent and rejects unsafe input without provider calls',async()=>{const t=setup();try{const module=photosRegistration(t.service,t.policy);expect(module.tools.find(t=>t.tool.name==='photos_delete_apply')?.requiredScopes).toContain('photos.delete');const prepare=module.tools.find(t=>t.tool.name==='photos_prepare')!;expect((await prepare.run({action:'delete_assets',assetIds:[id]})).isError).toBe(true);expect((await prepare.run({action:'create_album',title:'ok',extra:true})).isError).toBe(true);expect(t.calls()).toBe(0);}finally{t.db.close();}});
test('expired plans and repeated unknown intents cannot execute',async()=>{const t=setup();try{const plan=await t.service.prepare({action:'create_album',title:'Old'});t.db.query('UPDATE photos_operations SET expires=0 WHERE id=?').run(plan.operationId);await expect(t.service.apply(plan.operationId,true)).rejects.toThrow('plan_expired');const unknown=await t.service.prepare({action:'create_album',title:'Unknown'});t.db.query("UPDATE photos_operations SET status='outcome_unknown' WHERE id=?").run(unknown.operationId);await expect(t.service.prepare({action:'create_album',title:'Unknown'})).rejects.toThrow('unresolved_operation');expect(t.calls()).toBe(0);}finally{t.db.close();}});
test('different plans cannot race a library write',async()=>{const t=setup();try{let release!:()=>void;const gate=new Promise<void>(r=>release=r);t.provider.apply=async()=>{await gate;return {status:'applied'};};const a=await t.service.prepare({action:'create_album',title:'A'}),b=await t.service.prepare({action:'create_album',title:'B'});const running=t.service.apply(a.operationId,true);await expect(t.service.apply(b.operationId,true)).rejects.toThrow('another_operation_in_progress');release();await running;expect((await t.service.apply(b.operationId,true)).status).toBe('applied');}finally{t.db.close();}});
const sharedIntent={action:'post_to_shared_album',albumId:'album:1234567890abcdef:shared:22222222-2222-2222-2222-222222222222',assetIds:[id]};
test('shared publication is disabled even with native UI opt-in and retained plans',async()=>{
 const t=setup();let launched=0;t.provider.openReview=async()=>{launched++;return {status:'review_pending'};};
 try{
  for(const intent of [sharedIntent,{...sharedIntent,nativeUI:true},{action:'add_to_album',albumId:sharedIntent.albumId,assetIds:[id]}])await expect(t.service.prepareRemote(intent)).rejects.toThrow('shared_album_write_unsupported');
  const retained=await t.service.prepare({...sharedIntent,nativeUI:true});
  await expect(t.service.applyRemote(retained.operationId,true)).rejects.toThrow('shared_album_write_unsupported');
  expect(launched).toBe(0);expect(t.calls()).toBe(0);
  const registration=photosRegistration(t.service,t.policy);
  expect(registration.tools.some(t=>t.tool.name.startsWith('photos_shared_'))).toBe(false);
  expect(JSON.stringify(registration.tools.find(t=>t.tool.name==='photos_prepare')!.tool.inputSchema)).not.toContain('post_to_shared_album');
 }finally{t.db.close();}
});
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
 const t=setup(),idAsset=id;let selection=[idAsset];
 t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:selection});
 try{const opened=await historicalCatalog(t,{kind:'comparison',assetIds:[idAsset],albumId:sharedIntent.albumId});expect(t.calls()).toBe(0);expect((await t.service.catalogStatus(opened.reviewId)).status).toBe('selection_reviewed');
  selection=['asset:1234567890abcdef:33333333-3333-3333-3333-333333333333'];const invalid=await historicalCatalog(t,{kind:'comparison',assetIds:[idAsset],albumId:sharedIntent.albumId});await expect(t.service.catalogStatus(invalid.reviewId)).rejects.toThrow('invalid_review_selection');const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');await expect(other.catalogStatus(opened.reviewId)).rejects.toThrow('review_not_found');
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
 const t=setup();t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:[id],manifestAssetIds:[id]});
 try{const opened=await historicalCatalog(t,{kind:'comparison',assetIds:[id],albumId:sharedIntent.albumId});t.db.query("UPDATE photos_reviews SET status='outcome_unknown',result=NULL WHERE id=?").run(opened.reviewId);expect((await t.service.catalogStatus(opened.reviewId)).status).toBe('selection_reviewed');
  t.provider.reviewStatus=async()=>{throw new Error('temporary files no longer available');};const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');expect((await next.catalogStatus(opened.reviewId)).result.selectedAssetIds).toEqual([id]);expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});

test('catalog decisions account for every source and survive restart without authorizing writes',async()=>{
 const t=setup();
 t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:[],decisions:[{assetId:id,decision:'keep'}]});
 try{
  const opened=await historicalCatalog(t,{kind:'cleanup',offset:0,limit:1});
  expect((await t.service.catalogStatus(opened.reviewId)).result.decisions).toEqual([{assetId:id,decision:'keep'}]);
  t.provider.reviewStatus=async()=>{throw Error('journal removed');};
  const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');
  expect((await next.catalogStatus(opened.reviewId)).result.decisions[0].decision).toBe('keep');
  expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});
test('catalog rejects missing, duplicate, wrong-purpose and selection-inconsistent decisions',async()=>{
 const t=setup();
 try{
  for(const decisions of [[],[{assetId:id,decision:'keep'},{assetId:id,decision:'keep'}],[{assetId:id,decision:'share_review'}],[{assetId:id,decision:'delete_review'}]]){
   t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:[],decisions});
   const opened=await historicalCatalog(t,{kind:'cleanup',offset:0,limit:1});
   await expect(t.service.catalogStatus(opened.reviewId)).rejects.toThrow('invalid_review_decisions');
  }
  expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});
test('confirmed native cancellation is retained when journal is unavailable after restart',async()=>{
 const t=setup();t.provider.openReview=async()=>({status:'review_pending'});t.provider.reviewStatus=async()=>({status:'cancelled_before_posting'});
 try{const plan=await t.service.prepare(sharedIntent);await t.service.apply(plan.operationId,true);await t.service.reviewStatus(plan.operationId);
  t.provider.reviewStatus=async()=>{throw Error('journal unavailable');};
  const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');
  expect((await next.operationStatus(plan.operationId)).status).toBe('cancelled');expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});

test('cross-page review summary preserves undecided and binds decisions to owner and destination',async()=>{
 const t=setup(),second='asset:1234567890abcdef:33333333-3333-3333-3333-333333333333';

 const save=async(albumId:string,decision:string)=>{
  t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:decision==='share_review'?[id]:[],decisions:[{assetId:id,decision}]});
  const opened=await historicalCatalog(t,{kind:'comparison',assetIds:[id],albumId});await t.service.catalogStatus(opened.reviewId);
 };
 try{
  await save(sharedIntent.albumId,'keep');
  await save('album:1234567890abcdef:shared:44444444-4444-4444-4444-444444444444','share_review');
  const input={kind:'comparison',assetIds:[id,second],albumId:sharedIntent.albumId};
  let summary=t.service.reviewSummary(input);
  expect(summary.counts).toEqual({unreviewed:1,undecided:0,keep:1,share_review:0,delete_review:0});
  expect(summary.allSourcesReviewed).toBe(false);expect(summary.writeApproved).toBe(false);
  await save(sharedIntent.albumId,'undecided');summary=t.service.reviewSummary({...input,assetIds:[id]});
  expect(summary.allSourcesReviewed).toBe(true);expect(summary.allSourcesDecided).toBe(false);expect(summary.counts.undecided).toBe(1);
  const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');expect(other.reviewSummary(input).counts.unreviewed).toBe(2);
  const restarted=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');expect(restarted.reviewSummary(input).counts.undecided).toBe(1);
  expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});
test('review summary excludes pending and legacy selections rather than guessing keep decisions',async()=>{
 const t=setup();t.provider.reviewStatus=async()=>({status:'selection_reviewed',selectedAssetIds:[id]});
 try{
  const input={kind:'cleanup',assetIds:[id]};const opened=await historicalCatalog(t,{kind:'cleanup'});
  expect(t.service.reviewSummary(input).counts.unreviewed).toBe(1);
  await t.service.catalogStatus(opened.reviewId);expect(t.service.reviewSummary(input).counts.unreviewed).toBe(1);
  expect(()=>t.service.reviewSummary({...input,assetIds:[id,id]})).toThrow();
 }finally{t.db.close();}
});

test('wrong open library rejects metadata before writes and permits a newly reviewed corrected plan',async()=>{
 const t=setup();t.provider.apply=async()=>({status:'wrong_open_library'});
 try{
  const intent={action:'set_metadata',assetIds:[id],values:{title:'Reviewed'}};
  const first=await t.service.prepare(intent);
  expect((await t.service.apply(first.operationId,true)).status).toBe('rejected');
  const second=await t.service.prepare(intent);expect(second.status).toBe('prepared');
  expect(second.operationId).not.toBe(first.operationId);expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});

function remoteFixture(){
 const t=setup();let nativeCalls=0;

 t.provider.openReview=async()=>{nativeCalls++;throw Error('Native posting must not open');};
 t.provider.read=async(command,input)=>{
  if(command==='compare')return {album:{id:sharedIntent.albumId,title:'Fixture',kind:'shared',count:0},results:[{assetId:id,status:'not_found',candidates:[]}]};
  if(command==='cleanup')return {total:1,nextOffset:null,candidates:[{reason:'screenshot',assetIds:[id]}]};
  if(command==='detail')return {id:(input as {assetId:string}).assetId,filename:'fixture.png',date:null,mediaType:'photo',livePhoto:false,title:'',description:'',keywords:[],favorite:false,persons:[],width:100,height:100,shared:false};
  throw Error('Unexpected read');
 };
 return {...t,nativeCalls:()=>nativeCalls};
}
test('remote review saves exact decisions across restart without native UI or photo writes',async()=>{
 const t=remoteFixture();try{
  const review=await t.service.prepareCatalog({kind:'comparison',assetIds:[id],albumId:sharedIntent.albumId});
  expect(review.status).toBe('remote_review_pending');expect(review.result.sources[0]?.detail.id).toBe(id);
  expect((await t.service.catalogStatus(review.reviewId)).status).toBe('remote_review_pending');
  const input={reviewId:review.reviewId,confirm:true,decisions:[{assetId:id,decision:'share_review'}]};
  expect(t.service.recordCatalog(input).result.writeApproved).toBe(false);
  const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');
  expect((await next.catalogStatus(review.reviewId)).status).toBe('selection_reviewed');
  expect(next.recordCatalog(input).result.decisions).toEqual(input.decisions);
  expect(next.reviewSummary({kind:'comparison',assetIds:[id],albumId:sharedIntent.albumId}).counts.share_review).toBe(1);
  expect(t.nativeCalls()).toBe(0);expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});
test('remote review rejects cross-owner, missing, duplicate, substituted and wrong-purpose decisions',async()=>{
 const t=remoteFixture();try{
  const r=await t.service.prepareCatalog({kind:'cleanup',limit:1});
  const base={reviewId:r.reviewId,confirm:true};
  for(const decisions of [[],[{assetId:id,decision:'share_review'}],[{assetId:id,decision:'keep'},{assetId:id,decision:'keep'}],[{assetId:'asset:1234567890abcdef:33333333-3333-3333-3333-333333333333',decision:'keep'}]])expect(()=>t.service.recordCatalog({...base,decisions})).toThrow();
  expect(()=>t.service.recordCatalog({...base,confirm:false,decisions:[{assetId:id,decision:'keep'}]})).toThrow();
  const other=new PhotosService(t.db,t.provider,t.policy,()=> 'other');expect(()=>other.recordCatalog({...base,decisions:[{assetId:id,decision:'keep'}]})).toThrow('review_not_found');
  t.service.recordCatalog({...base,decisions:[{assetId:id,decision:'undecided'}]});
  expect(()=>t.service.recordCatalog({...base,decisions:[{assetId:id,decision:'delete_review'}]})).toThrow('review_already_finalized');
  expect(t.nativeCalls()).toBe(0);expect(t.calls()).toBe(0);
 }finally{t.db.close();}
});
test('remote review rechecks owner after reads before persisting a snapshot',async()=>{
 const t=remoteFixture();let owner='owner';const service=new PhotosService(t.db,t.provider,t.policy,()=>owner);try{
  const original=t.provider.read;t.provider.read=async(c,i)=>{const v=await original(c,i);if(c==='detail')owner='other';return v;};
  await expect(service.prepareCatalog({kind:'cleanup',limit:1})).rejects.toThrow('owner_changed');
  expect((t.db.query('SELECT count(*) AS n FROM photos_reviews').get() as {n:number}).n).toBe(0);
 }finally{t.db.close();}
});
test('remote MCP tools never launch native review or posting, including legacy prepared plans',async()=>{
 const t=remoteFixture();try{
  const module=photosRegistration(t.service,t.policy);expect(module.tools.some(t=>t.tool.name==='photos_open_review')).toBe(false);
  const run=(name:string,input:unknown)=>module.tools.find(t=>t.tool.name===name)!.run(input);
  expect((await run('photos_prepare',sharedIntent)).isError).toBe(true);
  const legacy=await t.service.prepare(sharedIntent);expect((await run('photos_apply',{operationId:legacy.operationId,confirm:true})).isError).toBe(true);
  expect(t.service.status(legacy.operationId).status).toBe('prepared');expect(t.nativeCalls()).toBe(0);
  const opened=await run('photos_review_prepare',{kind:'cleanup',limit:1});expect(opened.isError).not.toBe(true);
  expect(module.tools.find(t=>t.tool.name==='photos_review_record')!.tool.annotations!.readOnlyHint).toBe(false);
 }finally{t.db.close();}
});

test('unknown native mutation blocks different writes across restart while reads and outcomes remain available',async()=>{
 const t=setup();let attempts=0;
 t.provider.apply=async()=>{attempts++;throw new PhotosError('provider_timeout');};
 try{
  const first=await t.service.prepare({action:'delete_assets',assetIds:[id]});
  const alternate=await t.service.prepare({action:'create_album',title:'Different intent'});
  expect((await t.service.apply(first.operationId,true,true)).status).toBe('outcome_unknown');
  const next=new PhotosService(t.db,t.provider,t.policy,()=> 'owner');
  await expect(next.apply(alternate.operationId,true)).rejects.toThrow('another_operation_in_progress');
  const changed=await next.prepare({action:'set_metadata',assetIds:[id],values:{title:'Overlapping intent'}});
  await expect(next.apply(changed.operationId,true)).rejects.toThrow('another_operation_in_progress');
  expect(attempts).toBe(1);expect((await next.operationStatus(first.operationId)).status).toBe('outcome_unknown');
  expect(await next.read('health',{})).toEqual({});
 }finally{t.db.close();}
});

test('unknown sharing interlock releases after native cancellation reconciliation without blocking status',async()=>{
 const t=setup();let outcome={status:'posting_outcome_unknown'};
 t.provider.openReview=async()=>outcome;t.provider.reviewStatus=async()=>outcome;
 try{
  const first=await t.service.prepare(sharedIntent),alternate=await t.service.prepare({action:'create_album',title:'After cancellation'});
  expect((await t.service.apply(first.operationId,true)).status).toBe('outcome_unknown');
  await expect(t.service.apply(alternate.operationId,true)).rejects.toThrow('another_operation_in_progress');
  outcome={status:'cancelled_before_posting'};
  expect((await t.service.operationStatus(first.operationId)).status).toBe('cancelled');
  expect((await t.service.apply(alternate.operationId,true)).status).toBe('applied');
 }finally{t.db.close();}
});
test('large cleanup groups support exact remote subsets without silently dropping remaining sources',async()=>{
 const t=remoteFixture();const ids=Array.from({length:14},(_,i)=>`asset:1234567890abcdef:${String(i+1).padStart(8,'0')}-1111-1111-1111-111111111111`);const original=t.provider.read;
 t.provider.read=async(c,i)=>c==='cleanup'?{total:1,nextOffset:null,candidates:[{reason:'same_fingerprint',assetIds:ids}]}:original(c,i);
 try{
  const first=await t.service.prepareCatalog({kind:'cleanup',limit:1});expect(first.result.assetIds.length).toBe(12);expect((first.result.coverage as {omittedAssets:number}).omittedAssets).toBe(2);
  const remaining=await t.service.prepareCatalog({kind:'cleanup',limit:1,assetIds:ids.slice(12)});expect(remaining.result.assetIds).toEqual(ids.slice(12));
  await expect(t.service.prepareCatalog({kind:'cleanup',limit:1,assetIds:[id]})).rejects.toThrow('invalid_review_sources');
  expect(t.nativeCalls()).toBe(0);
 }finally{t.db.close();}
});
test('remote review retains continuation evidence and can select a final part without re-reviewing its reference',async()=>{
 const t=remoteFixture(),original=t.provider.read,ids=Array.from({length:2},(_,i)=>`asset:1234567890abcdef:${String(i+1).padStart(8,'0')}-1111-1111-1111-111111111111`);
 t.provider.read=async(c,i)=>c==='cleanup'?{total:2,nextOffset:null,candidates:[{reason:'same_fingerprint',assetIds:ids,groupAssetCount:1001,groupPart:2,groupParts:2}]}:original(c,i);
 try{
  const opened=await t.service.prepareCatalog({kind:'cleanup',offset:1,limit:1,assetIds:[ids[1]]});
  expect(opened.result.assetIds).toEqual([ids[1]!]);expect(opened.result.sources[0]!.evidence).toEqual({reason:'same_fingerprint',candidateIds:[ids[0]],groupAssetCount:1001,groupPart:2,groupParts:2});
  expect(opened.result.coverage).toEqual({totalCandidateGroups:2,nextOffset:null,omittedAssets:1});expect(t.nativeCalls()).toBe(0);expect(opened.result.writeApproved).toBe(false);
 }finally{t.db.close();}
});
