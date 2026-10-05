import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {mutationSchema,catalogSchema,remoteDecisionsSchema,reviewSummarySchema,sharedObservationSchema,assetSchema,PhotosError,type PhotosProvider,type Mutation,type CleanupCandidate} from './contracts.js';
import {z} from 'zod';
import {reviewDecision} from './shared-review.js';
export interface PhotosPolicy {read:boolean;write:boolean;delete:boolean}
interface Row {id:string;owner:string;mutation:string;snapshot:string;status:string;result:string|null;expires:number}
/** Durable single-use plans. Unknown writes are never automatically resubmitted. */
export class PhotosService {
 constructor(private readonly db:Database,private readonly provider:PhotosProvider,private readonly policy:()=>PhotosPolicy,private readonly owner:()=>string){
  db.exec(`CREATE TABLE IF NOT EXISTS photos_operations (id TEXT PRIMARY KEY,owner TEXT NOT NULL,mutation TEXT NOT NULL,snapshot TEXT NOT NULL,status TEXT NOT NULL,result TEXT,expires INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS photos_reviews (id TEXT PRIMARY KEY,owner TEXT NOT NULL,request TEXT NOT NULL,status TEXT NOT NULL,result TEXT)`);
 }
 private check(write=false,destructive=false){const p=this.policy();if(!p.read||write&&!p.write||destructive&&!p.delete)throw new PhotosError('forbidden');return this.owner();}
 async read(command:string,input:unknown){this.check();return this.provider.read(command,input);}
 async prepareRemote(raw:unknown){
  if(mutationSchema.parse(raw).action==='post_to_shared_album')throw new PhotosError('remote_shared_album_posting_unavailable');
  return this.prepare(raw);
 }
 async applyRemote(id:string,confirm:boolean,allowDelete=false){
  const owner=this.check(true),row=this.db.query('SELECT mutation FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as {mutation:string}|null;
  if(!row)throw new PhotosError('operation_not_found');
  if(mutationSchema.parse(JSON.parse(row.mutation)).action==='post_to_shared_album')throw new PhotosError('remote_shared_album_posting_unavailable');
  return this.apply(id,confirm,allowDelete);
 }
 /** Remote review reads metadata only. Images use photos_preview in the conversation. */
 async prepareCatalog(raw:unknown){
  const owner=this.check(),request=catalogSchema.parse(raw);
  let entries:{assetId:string;evidence:unknown}[]=[],coverage:unknown;
  if(request.kind==='comparison'){
   const result=await this.provider.read('compare',{assetIds:request.assetIds,albumId:request.albumId}) as {album:unknown;results:{assetId:string;status:string;candidates:unknown[]}[]};
   if(result.results.length!==request.assetIds.length||new Set(result.results.map(r=>r.assetId)).size!==request.assetIds.length||result.results.some(r=>!request.assetIds.includes(r.assetId)))throw new PhotosError('invalid_review_sources');
   entries=result.results.map(r=>({assetId:r.assetId,evidence:r}));coverage={album:result.album,totalSources:entries.length};
  }else{
   const result=await this.provider.read('cleanup',{offset:request.offset,limit:request.limit}) as {total:number;nextOffset:number|null;candidates:CleanupCandidate[]};
   const seen=new Set<string>();let omittedAssets=0;
   for(const group of result.candidates)for(const assetId of group.assetIds){if(seen.has(assetId))continue;seen.add(assetId);if(request.assetIds&&!request.assetIds.includes(assetId)){omittedAssets++;continue;}if(entries.length===12){omittedAssets++;continue;}entries.push({assetId,evidence:{reason:group.reason,candidateIds:group.assetIds.filter(id=>id!==assetId).slice(0,2),...(group.groupAssetCount===undefined?{}:{groupAssetCount:group.groupAssetCount,groupPart:group.groupPart,groupParts:group.groupParts})}});}
   if(request.assetIds?.some(id=>!seen.has(id)))throw new PhotosError('invalid_review_sources');
   coverage={totalCandidateGroups:result.total,nextOffset:result.nextOffset,omittedAssets};
  }
  const sources=[];
  for(const entry of entries){const detail=assetSchema.parse(await this.provider.read('detail',{assetId:entry.assetId}));if(detail.id!==entry.assetId)throw new PhotosError('invalid_review_sources');sources.push({...entry,detail,previewTool:'photos_preview',motionReviewRequired:detail.livePhoto||detail.mediaType==='video'});}
  if(this.check()!==owner)throw new PhotosError('owner_changed');
  const reviewId=randomUUID(),result={mode:'remote_conversation',assetIds:entries.map(e=>e.assetId),sources,coverage,createdAt:new Date().toISOString(),writeApproved:false,sharingVerified:false,serverSyncVerified:false};
  const status=entries.length?'remote_review_pending':'no_review_candidates';
  this.db.query('INSERT INTO photos_reviews (id,owner,request,status,result) VALUES (?,?,?,?,?)').run(reviewId,owner,JSON.stringify(request),status,JSON.stringify(result));
  return {reviewId,status,result,message:'Show exact source previews in the conversation. Record only explicit owner decisions. Saving decisions changes no photos; further write review and confirmation are required.'};
 }
 recordCatalog(raw:unknown){
  const owner=this.check(),input=remoteDecisionsSchema.parse(raw);
  const row=this.db.query('SELECT * FROM photos_reviews WHERE id=? AND owner=?').get(input.reviewId,owner) as {request:string;status:string;result:string}|null;if(!row)throw new PhotosError('review_not_found');
  const opened=JSON.parse(row.result),request=catalogSchema.parse(JSON.parse(row.request));
  if(opened.mode!=='remote_conversation')throw new PhotosError('remote_review_required');
  const ids=z.array(z.string()).parse(opened.assetIds),decisions=input.decisions;
  if(decisions.length!==ids.length||new Set(decisions.map(d=>d.assetId)).size!==ids.length||decisions.some(d=>!ids.includes(d.assetId)||(request.kind==='comparison'&&d.decision==='delete_review')||(request.kind==='cleanup'&&d.decision==='share_review')))throw new PhotosError('invalid_review_decisions');
  if(row.status==='selection_reviewed'){
   const saved=opened.lastEvent.decisions as typeof decisions;
   if(decisions.some(d=>!saved.some(s=>s.assetId===d.assetId&&s.decision===d.decision)))throw new PhotosError('review_already_finalized');
   return {reviewId:input.reviewId,status:row.status,result:opened.lastEvent};
  }
  if(row.status!=='remote_review_pending')throw new PhotosError('wrong_review_state');
  const result={status:'selection_reviewed',decisions,selectedAssetIds:decisions.filter(d=>['share_review','delete_review'].includes(d.decision)).map(d=>d.assetId),recordedAt:new Date().toISOString(),writeApproved:false,sharingVerified:false,serverSyncVerified:false};
  this.db.query("UPDATE photos_reviews SET status='selection_reviewed',result=? WHERE id=? AND owner=? AND status='remote_review_pending'").run(JSON.stringify({...opened,lastEvent:result}),input.reviewId,owner);
  return {reviewId:input.reviewId,status:'selection_reviewed',result};
 }
 async prepare(raw:unknown){const mutation=mutationSchema.parse(raw);const owner=this.check(true,mutation.action==='delete_assets');if(this.db.query("SELECT id FROM photos_operations WHERE owner=? AND mutation=? AND status IN ('executing','outcome_unknown','review_pending','posting_completed_membership_unverified','different_destination_membership_unverified') LIMIT 1").get(owner,JSON.stringify(mutation)))throw new PhotosError('unresolved_operation');
  if(mutation.action==='post_to_shared_album'){
   const unresolved=this.db.query("SELECT mutation FROM photos_operations WHERE status IN ('executing','outcome_unknown','review_pending','posting_completed_membership_unverified','different_destination_membership_unverified') AND json_extract(mutation,'$.action')='post_to_shared_album'").all() as {mutation:string}[];
   if(unresolved.some(row=>{const previous=mutationSchema.parse(JSON.parse(row.mutation));return previous.action==='post_to_shared_album'&&previous.assetIds.some(id=>mutation.assetIds.includes(id));}))throw new PhotosError('unresolved_operation');
  }
  const state=await this.provider.inspect(mutation);if(this.check(true,mutation.action==='delete_assets')!==owner)throw new PhotosError('owner_changed');
  const id=randomUUID(),expires=Date.now()+15*60*1000;
  this.db.query('INSERT INTO photos_operations (id,owner,mutation,snapshot,status,expires) VALUES (?,?,?,?,?,?)').run(id,owner,JSON.stringify(mutation),JSON.stringify(state),'prepared',expires);
  return {operationId:id,status:'prepared',expiresAt:new Date(expires).toISOString(),mutation,before:state,message:'Review exact assets and changes before calling apply with confirm=true.'};
 }
 status(id:string){const owner=this.check();const row=this.db.query('SELECT * FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as Row|null;if(!row)throw new PhotosError('operation_not_found');return {operationId:id,status:row.status==='executing'?'outcome_unknown':row.status,result:row.result?JSON.parse(row.result):null};}
 async apply(id:string,confirm:boolean,allowDelete=false){if(confirm!==true)throw new PhotosError('confirmation_required');const owner=this.check(true);const row=this.db.query('SELECT * FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as Row|null;if(!row)throw new PhotosError('operation_not_found');
  const mutation=mutationSchema.parse(JSON.parse(row.mutation));if(mutation.action==='delete_assets'&&!allowDelete)throw new PhotosError('delete_scope_required');if(allowDelete&&mutation.action!=='delete_assets')throw new PhotosError('wrong_operation_type');this.check(true,mutation.action==='delete_assets');
  if(row.status!=='prepared')return this.status(id);
  if(row.expires<Date.now())throw new PhotosError('plan_expired');
  // A timed-out native helper may still be running. Unknown outcomes interlock
  // the whole library, so changing the intent cannot bypass reconciliation.
  const claimed=this.db.query(`UPDATE photos_operations SET status='executing' WHERE id=? AND owner=? AND status='prepared'
   AND NOT EXISTS (SELECT 1 FROM photos_operations WHERE status IN ('executing','review_pending','outcome_unknown'))
   AND (? != 'post_to_shared_album' OR NOT EXISTS (SELECT 1 FROM photos_operations p
    WHERE p.id != ? AND json_extract(p.mutation,'$.action')='post_to_shared_album'
     AND p.status IN ('executing','outcome_unknown','review_pending','posting_completed_membership_unverified','different_destination_membership_unverified')
     AND EXISTS (SELECT 1 FROM json_each(p.mutation,'$.assetIds') previous
      JOIN json_each(?,'$.assetIds') requested ON previous.value=requested.value)))`).run(id,owner,mutation.action,id,JSON.stringify(mutation));
  if(!claimed.changes){const current=this.status(id);if(current.status==='prepared')throw new PhotosError('another_operation_in_progress');return current;}
  let result:unknown;let status='outcome_unknown';
  try{
   this.check(true,mutation.action==='delete_assets');
   if(mutation.action==='post_to_shared_album'){
    if(!this.provider.openReview)throw new PhotosError('native_review_unavailable');
    result=await this.provider.openReview(mutation,JSON.parse(row.snapshot),id);
    status=(result as {status?:string})?.status==='review_pending'?'review_pending':'outcome_unknown';
   }else{
    result=await this.provider.apply(mutation,JSON.parse(row.snapshot));
    status=(result as {status?:string})?.status==='applied'?'applied':['stale_plan','wrong_open_library'].includes((result as {status?:string})?.status??'')?'rejected':'outcome_unknown';
   }
  }catch(e){const code=e instanceof PhotosError?e.code:'provider_failed';status=['stale_plan','forbidden'].includes(code)?'rejected':'outcome_unknown';result={error:code};}
  this.db.query('UPDATE photos_operations SET status=?,result=? WHERE id=? AND owner=?').run(status,JSON.stringify(result),id,owner);
  return this.status(id);
 }
 async reviewStatus(id:string){
  const owner=this.check();const row=this.db.query('SELECT * FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as Row|null;
  if(!row)throw new PhotosError('operation_not_found');
  const mutation=mutationSchema.parse(JSON.parse(row.mutation));if(mutation.action!=='post_to_shared_album')throw new PhotosError('wrong_operation_type');
  if(['prepared','rejected','cancelled','owner_verified_presence'].includes(row.status))return this.status(id);
  if(!this.provider.reviewStatus)throw new PhotosError('native_review_unavailable');
  const result=await this.provider.reviewStatus(id) as {status:string};
  if(this.check()!==owner)throw new PhotosError('owner_changed');
  const status=['review_pending','picker_review'].includes(result.status)?'review_pending':
   ['cancelled_before_posting','selection_changed_review_required'].includes(result.status)?'cancelled':
   ['posting_completed_membership_unverified','different_destination_membership_unverified'].includes(result.status)?result.status:'outcome_unknown';
  this.db.query('UPDATE photos_operations SET status=?,result=? WHERE id=? AND owner=?').run(status,JSON.stringify(result),id,owner);
  return this.status(id);
 }
 async catalogStatus(id:string){
  const owner=this.check();const row=this.db.query('SELECT * FROM photos_reviews WHERE id=? AND owner=?').get(id,owner) as {status:string;result:string|null;request:string}|null;if(!row)throw new PhotosError('review_not_found');
  if(['no_review_candidates','remote_review_pending'].includes(row.status))return {reviewId:id,status:row.status,result:row.result?JSON.parse(row.result):null};
  if(['selection_reviewed','catalog_cancelled'].includes(row.status))return {reviewId:id,status:row.status,result:JSON.parse(row.result!).lastEvent};
  if(!this.provider.reviewStatus)throw new PhotosError('native_review_unavailable');
  const result=await this.provider.reviewStatus(id) as {status:string;selectedAssetIds?:string[];manifestAssetIds?:string[];decisions?:unknown};if(this.check()!==owner)throw new PhotosError('owner_changed');
  if(result.status==='selection_reviewed'){
   const opened=row.result?JSON.parse(row.result):null;const allowed=z.array(z.string()).parse(opened?.assetIds??result.manifestAssetIds??[]);
   if(!result.selectedAssetIds||result.selectedAssetIds.some(v=>!allowed.includes(v))||new Set(result.selectedAssetIds).size!==result.selectedAssetIds.length)throw new PhotosError('invalid_review_selection');
   if(result.decisions!==undefined){
    const parsed=z.array(reviewDecision).max(12).safeParse(result.decisions);
    if(!parsed.success)throw new PhotosError('invalid_review_decisions');
    const decisions=parsed.data,kind=catalogSchema.parse(JSON.parse(row.request)).kind;
    if(decisions.length!==allowed.length||new Set(decisions.map(d=>d.assetId)).size!==allowed.length||
      decisions.some(d=>!allowed.includes(d.assetId)||(kind==='comparison'&&d.decision==='delete_review')||(kind==='cleanup'&&d.decision==='share_review')))throw new PhotosError('invalid_review_decisions');
    const selected=decisions.filter(d=>['share_review','delete_review'].includes(d.decision)).map(d=>d.assetId);
    if(selected.length!==result.selectedAssetIds.length||selected.some(id=>!result.selectedAssetIds!.includes(id)))throw new PhotosError('invalid_review_decisions');
   }
  }
  // Retain the launch manifest/allowed IDs and finalized selection in SQLite.
  const opened=row.result?JSON.parse(row.result):{};
  this.db.query('UPDATE photos_reviews SET status=?,result=? WHERE id=? AND owner=?').run(result.status,JSON.stringify({...opened,assetIds:opened.assetIds??result.manifestAssetIds,lastEvent:result}),id,owner);
  return {reviewId:id,status:result.status,result};
 }
 reviewSummary(raw:unknown){
  const owner=this.check(),request=reviewSummarySchema.parse(raw);
  // The latest finalized review creation wins, for this owner and destination only.
  // Pending/cancelled reviews and legacy selected-only records make no decision.
  const rows=this.db.query(`WITH ranked AS (
   SELECT json_extract(d.value,'$.assetId') AS assetId,
    json_extract(d.value,'$.decision') AS decision, r.id AS reviewId,
    row_number() OVER (PARTITION BY json_extract(d.value,'$.assetId') ORDER BY r.rowid DESC) AS position
   FROM photos_reviews r, json_each(r.result,'$.lastEvent.decisions') d
   WHERE r.owner=? AND r.status='selection_reviewed'
    AND json_extract(r.request,'$.kind')=?
    AND (? IS NULL OR json_extract(r.request,'$.albumId')=?)
    AND json_extract(d.value,'$.assetId') IN (SELECT value FROM json_each(?))
  ) SELECT assetId,decision,reviewId FROM ranked WHERE position=1`).all(owner,request.kind,request.kind==='comparison'?request.albumId:null,request.kind==='comparison'?request.albumId:null,JSON.stringify(request.assetIds)) as {assetId:string;decision:string;reviewId:string}[];
  const saved=new Map(rows.map(row=>[row.assetId,row]));
  const results=request.assetIds.map(assetId=>saved.get(assetId)??{assetId,decision:'unreviewed',reviewId:null});
  const counts={unreviewed:0,undecided:0,keep:0,share_review:0,delete_review:0};
  for(const row of results){if(!Object.hasOwn(counts,row.decision))throw new PhotosError('invalid_review_decisions');counts[row.decision as keyof typeof counts]++;}
  return {source:'saved_owner_review_decisions',kind:request.kind,...(request.kind==='comparison'?{albumId:request.albumId}:{}),total:results.length,counts,results,allSourcesReviewed:counts.unreviewed===0,allSourcesDecided:counts.unreviewed===0&&counts.undecided===0,writeApproved:false,sharingVerified:false,serverSyncVerified:false,message:'Summary covers only supplied IDs and saved decisions, not current library state. Review candidates require a separate exact prepare/confirmation; they do not prove upload or authorize deletion.'};
 }
 async operationStatus(id:string){
  const owner=this.check();const row=this.db.query('SELECT mutation FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as {mutation:string}|null;
  if(!row)throw new PhotosError('operation_not_found');
  return mutationSchema.parse(JSON.parse(row.mutation)).action==='post_to_shared_album'?this.reviewStatus(id):this.status(id);
 }
 async recordSharedObservation(raw:unknown){
  const observation=sharedObservationSchema.parse(raw),owner=this.check(true);
  const row=this.db.query('SELECT * FROM photos_operations WHERE id=? AND owner=?').get(observation.operationId,owner) as Row|null;
  if(!row)throw new PhotosError('operation_not_found');const mutation=mutationSchema.parse(JSON.parse(row.mutation));
  if(row.status==='owner_verified_presence')return this.status(observation.operationId);
  if(mutation.action!=='post_to_shared_album'||['prepared','rejected','cancelled'].includes(row.status))throw new PhotosError('wrong_operation_state');
  const native=await this.reviewStatus(observation.operationId);
  if(['review_pending','cancelled'].includes(native.status)||(native.result as {nativeProcessAlive?:boolean|null})?.nativeProcessAlive!==false)throw new PhotosError('native_review_not_closed');
  const actual=(native.result as {actualAlbum?:string})?.actualAlbum;
  if(actual&&actual.split('/')[0]!.toLowerCase()!==observation.albumId.split(':').at(-1)!.toLowerCase())throw new PhotosError('observed_destination_mismatch');
  const shared=assetSchema.parse(await this.provider.read('detail',{assetId:observation.sharedAssetId}));
  if(!shared.shared)throw new PhotosError('shared_asset_required');
  const membership=await this.provider.read('compare',{assetIds:[observation.sharedAssetId],albumId:observation.albumId}) as {results:{assetId:string;status:string}[]};
  if(!membership.results.some(r=>r.assetId===observation.sharedAssetId&&r.status==='confirmed'))throw new PhotosError('membership_not_verified');
  const source=assetSchema.parse(await this.provider.read('detail',{assetId:mutation.assetIds[0]}));
  if((source.mediaType==='video'||source.livePhoto)&&observation.contentReviewed!=='full_asset')throw new PhotosError('full_motion_review_required');
  if(this.check(true)!==owner)throw new PhotosError('owner_changed');
  // This settles presence, not which operation created a resized shared copy.
  // Owner testimony remains distinct from native/server verification.
  const result={native:native.result,observation:{...observation,recordedAt:new Date().toISOString(),evidenceSource:'owner_report'},localMembershipVerified:true,sourceCorrespondence:'owner_reviewed',crossDeviceObserved:observation.observedOn==='another_device',serverSyncVerified:false,operationCausedUploadVerified:false};
  this.db.query("UPDATE photos_operations SET status='owner_verified_presence',result=? WHERE id=? AND owner=?").run(JSON.stringify(result),observation.operationId,owner);
  return this.status(observation.operationId);
 }
}
