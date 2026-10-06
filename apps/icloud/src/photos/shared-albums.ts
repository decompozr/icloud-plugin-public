import type {StagedUploadSource} from './upload-source.js';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {PhotosError} from './contracts.js';
import type {PhotosPolicy} from './service.js';
import {publishSharedUpload,readSharedUploadJob,SHARED_RECOVERY_GRACE_MS,sharedReadDiagnostic,SharedStreamReadError,readSharedStreamMembership,readSharedStreamAlbums,readSharedStreamCount,executeSharedStreamMutation,type SharedStreamSession,type SharedStreamMutation} from './shared-stream-protocol.js';

export const remoteSharedAlbumId=z.string().regex(/^shared-album:[a-f0-9-]{36}:[A-Fa-f0-9-]{36}$/);
const title=z.string().trim().min(1).max(200);
export const sharedAlbumIntent=z.discriminatedUnion('action',[
 z.object({action:z.literal('upload_shared_test_fixture'),albumId:remoteSharedAlbumId,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('upload_shared_asset'),albumId:remoteSharedAlbumId,assetId:z.string().regex(/^asset:[a-f0-9]{16}:[A-Fa-f0-9-]{36}$/),representation:z.enum(['original','edited']),livePhotoMode:z.literal('still').optional(),experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('create_shared_album'),title,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('rename_shared_album'),albumId:remoteSharedAlbumId,title,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('delete_empty_shared_album'),albumId:remoteSharedAlbumId,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('delete_shared_album'),albumId:remoteSharedAlbumId,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('set_shared_contributions'),albumId:remoteSharedAlbumId,enabled:z.boolean(),experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('set_shared_public_access'),albumId:remoteSharedAlbumId,enabled:z.boolean(),experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('invite_shared_participants'),albumId:remoteSharedAlbumId,emails:z.array(z.string().trim().email().max(320)).min(1).max(20).refine(items=>new Set(items.map(v=>v.toLowerCase())).size===items.length),experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('remove_shared_participant'),albumId:remoteSharedAlbumId,invitationId:z.string().min(1).max(512).refine(v=>!/[\x00-\x1f\x7f]/.test(v)),experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('remove_shared_assets'),albumId:remoteSharedAlbumId,assetGuids:z.array(z.string().min(1).max(512).refine(v=>!/[\x00-\x1f\x7f]/.test(v))).min(1).max(100).refine(items=>new Set(items).size===items.length),experimental:z.literal(true)}).strict(),
]);
type Intent=z.infer<typeof sharedAlbumIntent>;
type Session=SharedStreamSession&{generation:number;accountRevision:number};
interface Row{id:string;owner:string;account:string;intent:string;albumGuid:string;snapshot:string;status:string;result:string|null;expires:number;started:number}
export {initializeSharedAlbumLedger} from './shared-ledger.js';
import {initializeSharedAlbumLedger} from './shared-ledger.js';

type HealthRead={id:string;identity:string;started:number;completed?:number;result?:unknown;promise:Promise<void>};
const activeOperations=new WeakMap<Database,Set<string>>();
const healthReads=new WeakMap<Database,Map<string,HealthRead>>();
const albumReads=new WeakMap<Database,Map<string,HealthRead>>();

/** Account-bound experimental lifecycle with durable dispatch and server readback. */
export class SharedAlbumService {
 constructor(private options:{db:Database;owner:string;accountId:string;currentOwner:()=>string;policy:()=>PhotosPolicy;session:()=>Session;stageUpload?:(assetId:string,representation:'original'|'edited',livePhotoMode?:'still')=>Promise<StagedUploadSource>;releaseUpload?:(source:StagedUploadSource)=>Promise<void>;stageTestUpload?:(operationId:string)=>Promise<StagedUploadSource>}){
  initializeSharedAlbumLedger(options.db);
 }
 private check(write=false){const p=this.options.policy();if(this.options.currentOwner()!==this.options.owner||!p.read||write&&!p.write)throw new PhotosError('forbidden');}
 private id(guid:string){return `shared-album:${this.options.accountId}:${guid.toUpperCase()}`;}
 private guid(id:string){const parts=remoteSharedAlbumId.parse(id).split(':');if(parts[1]!==this.options.accountId)throw new PhotosError('shared_album_account_mismatch');return parts[2]!.toUpperCase();}
 private row(id:string){const row=this.options.db.query('SELECT * FROM photos_shared_operations WHERE id=? AND owner=? AND account=?').get(id,this.options.owner,this.options.accountId) as Row|null;if(!row)throw new PhotosError('operation_not_found');return row;}
 async albums(albumId?:string){
  this.check();const session=this.options.session();
  const result=await readSharedStreamAlbums(session,this.options.accountId,albumId?this.guid(albumId):undefined,!albumId);this.check();
  return {...result,accountId:this.options.accountId,experimental:true,managementReady:false,albums:result.albums.map(a=>({...a,id:this.id(a.albumGuid)}))};
 }
 albumsBackground(albumId?:string,readId?:string,refresh=false,contents?:{offset:number;limit:number}){
  if(contents&&(!albumId||!Number.isInteger(contents.offset)||contents.offset<0||!Number.isInteger(contents.limit)||contents.limit<1||contents.limit>100))throw new PhotosError('shared_album_content_arguments_invalid');
  this.check();const session=this.options.session(),key=JSON.stringify([this.options.owner,this.options.accountId,albumId??null,!!contents]),identity=JSON.stringify([session.generation,session.accountRevision]);
  if(albumId)this.guid(albumId);
  let reads=albumReads.get(this.options.db);if(!reads){reads=new Map();albumReads.set(this.options.db,reads);}
  let read=reads.get(key);
  if(readId&&(!read||read.id!==readId||read.identity!==identity))throw new PhotosError('shared_album_read_not_found');
  if(readId&&refresh)throw new PhotosError('shared_album_read_arguments_invalid');
  if(!read||read.identity!==identity||(refresh&&read.result!==undefined)){
   if(!read&&reads.size>=64)throw new PhotosError('shared_album_read_capacity');
   read={id:randomUUID(),identity,started:Date.now(),promise:Promise.resolve()};reads.set(key,read);const current=read;
   current.promise=(async()=>{const result=await this.albums(albumId);const membership=contents?await readSharedStreamMembership(session,this.options.accountId,this.guid(albumId!)):undefined;this.check();return {...result,...(membership?{membership}:{})};})().then(result=>{current.result={status:'complete',...result};current.completed=Date.now();},error=>{current.result={status:'failed',error:'shared_album_read_failed',diagnostic:sharedReadDiagnostic(error)};current.completed=Date.now();});
  }
  if(read.completed!==undefined&&Date.now()-read.completed>300000&&read.result!==undefined)read.result={status:'expired',automaticRetry:false};
  const result=read.result as {membership?:Awaited<ReturnType<typeof readSharedStreamMembership>>}|undefined;
  const membership=result?.membership;
  const nextOffset=contents&&membership&&contents.offset+contents.limit<membership.total?contents.offset+contents.limit:null;
  return {readId:read.id,startedAt:read.started,automaticRetry:false,...(result??{status:'read_pending',deadlineMs:contents?360000:albumId?60000:180000}),...(contents&&membership?{membership:{...membership,assets:membership.assets.slice(contents.offset,contents.offset+contents.limit),snapshotComplete:true,complete:contents.offset===0&&nextOffset===null,offset:contents.offset,nextOffset}}:{})};
 }
 async health(){
  this.check();
  const session=this.options.session(),key=JSON.stringify([this.options.owner,this.options.accountId]),identity=JSON.stringify([session.generation,session.accountRevision]);
  let reads=healthReads.get(this.options.db);if(!reads){reads=new Map();healthReads.set(this.options.db,reads);}
  let read=reads.get(key);
  if(!read||read.identity!==identity){
   if(!read&&reads.size>=64)throw new PhotosError('health_read_capacity');
   read={id:randomUUID(),identity,started:Date.now(),promise:Promise.resolve()};reads.set(key,read);
   const current=read;
   current.promise=this.performHealth().then(result=>{current.result=result;},()=>{current.result={status:'unavailable',error:'shared_album_read_failed'};});
  }
  const age=Date.now()-read.started;
  if(age>300000&&read.result!==undefined){read.result={status:'read_expired',automaticRetry:false};}
  return {readId:read.id,startedAt:read.started,...(read.result===undefined?{status:'read_pending',deadlineMs:180000,automaticRetry:false}:read.result as object)};
 }
 private async performHealth(){
  this.check();
  const diagnosticSession=this.options.session(),access=diagnosticSession.webAccessState;
  const photosService=diagnosticSession.photosServiceState?diagnosticSession.photosServiceState().catch(()=>({status:'unavailable'})):Promise.resolve({status:'not_configured'});
  const webAccess=access?access().then(value=>({status:'observed',...value}),()=>({status:'unavailable'})):Promise.resolve({status:'not_configured'});
  try{
   const result=await readSharedStreamAlbums(diagnosticSession,this.options.accountId,undefined,true);this.check();
   return {photosService:await photosService,webAccess:await webAccess,status:result.inventoryFullySupported?'remote_inventory_verified':'remote_inventory_partial',unsupportedAlbumCount:result.unsupportedAlbums.length,accountId:this.options.accountId,authenticated:true,total:result.albums.length,legacyCandidates:result.albums.filter(a=>a.protocol==='legacy_candidate').length,modernOrEncrypted:result.albums.filter(a=>a.protocol==='modern_or_encrypted').length,serverResponseObserved:true,...(result.serverHTTPVersion?{serverHTTPVersion:result.serverHTTPVersion}:{}),managementReady:false,experimental:true};
  }catch(error){return {photosService:await photosService,webAccess:await webAccess,status:'unavailable',error:error instanceof PhotosError?error.code:'shared_album_readback_failed',...(error instanceof SharedStreamReadError?{diagnostic:error.diagnostic}:{}),serverResponseObserved:error instanceof SharedStreamReadError&&error.diagnostic.httpStatus!==undefined,managementReady:false,experimental:true};}
 }
 private async snapshot(session:Session,intent:Intent,guid:string){
  const sessionIdentity={generation:session.generation,accountRevision:session.accountRevision};
  if(intent.action==='create_shared_album'){
   const list=await readSharedStreamAlbums(session,this.options.accountId,undefined,true);
   if(list.albums.some(a=>a.albumGuid===guid))throw new PhotosError('shared_album_identity_exists');
   return {...sessionIdentity,absent:true};
  }
  const result=await readSharedStreamAlbums(session,this.options.accountId,guid),album=result.albums[0]!;
  if(album.rights!=='owner')throw new PhotosError('shared_album_owner_required');
  if(album.protocol!=='legacy_candidate')throw new PhotosError('unsupported_shared_album_protocol');
  if(intent.action==='set_shared_contributions'&&(album.title===null||album.allowsContributions===null)||intent.action==='set_shared_public_access'&&album.isPublic===null)throw new PhotosError('shared_album_access_state_unknown');
  if(intent.action==='invite_shared_participants'||intent.action==='remove_shared_participant'){
   if(!album.participants)throw new PhotosError('shared_album_participants_unknown');
   if(intent.action==='invite_shared_participants'&&intent.emails.some(email=>album.participants!.some(p=>p.email?.toLowerCase()===email.toLowerCase()&&['owned','pending','subscribed'].includes(p.sharingtype?.toLowerCase()??''))))throw new PhotosError('shared_album_participant_exists');
   if(intent.action==='remove_shared_participant'){
    const matches=album.participants.filter(p=>p.invitationguid===intent.invitationId);
    if(matches.length!==1||!['pending','subscribed'].includes(matches[0]!.sharingtype?.toLowerCase()??'')||matches[0]!.personid===session.dsid)throw new PhotosError('shared_album_removable_participant_required');
   }
  }
  const count=await readSharedStreamCount(session,this.options.accountId,guid);
  if(intent.action==='delete_empty_shared_album'&&count!==0)throw new PhotosError('album_not_empty');
  if(intent.action==='upload_shared_test_fixture'&&(!this.options.stageTestUpload||!session.uploadBytes))throw new PhotosError('shared_upload_unavailable');
  if(intent.action==='upload_shared_asset'&&(!this.options.stageUpload||!session.uploadBytes))throw new PhotosError('shared_upload_unavailable');
  if((intent.action==='upload_shared_asset'||intent.action==='upload_shared_test_fixture')&&count>=5000)throw new PhotosError('shared_album_capacity');
  if(intent.action==='remove_shared_assets'||intent.action==='delete_shared_album'){
   const membership=await readSharedStreamMembership(session,this.options.accountId,guid);
   if(intent.action==='remove_shared_assets'&&!intent.assetGuids.every(id=>membership.assets.some(a=>a.assetGuid===id)))throw new PhotosError('shared_album_asset_not_found');
   return {...sessionIdentity,album,count,membership};
  }
  return {...sessionIdentity,album,count};
 }
 private reserve(raw:unknown){
  this.check(true);const intent=sharedAlbumIntent.parse(raw);
  if(this.options.db.query("SELECT id FROM photos_shared_operations WHERE status IN ('executing','outcome_unknown') LIMIT 1").get())throw new PhotosError('unresolved_operation');
  const guid=intent.action==='create_shared_album'?randomUUID().toUpperCase():this.guid(intent.albumId);
  const operationId=randomUUID(),expires=Date.now()+15*60000;
  this.options.db.query('INSERT INTO photos_shared_operations(id,owner,account,intent,albumGuid,snapshot,status,expires) VALUES(?,?,?,?,?,?,?,?)').run(operationId,this.options.owner,this.options.accountId,JSON.stringify(intent),guid,'{}','preparing',expires);
  return {intent,guid,operationId,expires};
 }
 private async finishPrepare(reserved:ReturnType<SharedAlbumService['reserve']>){
  const {intent,guid,operationId,expires}=reserved;
  const observed=await this.snapshot(this.options.session(),intent,guid);this.check(true);
  let upload:Omit<StagedUploadSource,'privatePath'>|undefined;
  if(intent.action==='upload_shared_asset'||intent.action==='upload_shared_test_fixture'){
   const staged=intent.action==='upload_shared_test_fixture'?await this.options.stageTestUpload!(operationId):await this.options.stageUpload!(intent.assetId,intent.representation,intent.livePhotoMode);
   try{this.check(true);}catch(error){await this.options.releaseUpload?.(staged);throw error;}
   const {privatePath,...review}=staged;upload=review;
   this.options.db.query('INSERT INTO photos_shared_uploads(operationId,source,assetGuid,batchGuid,submittedAt,timeZone,stage) VALUES(?,?,?,?,?,?,?)').run(operationId,JSON.stringify(staged),randomUUID().toUpperCase(),randomUUID().toUpperCase(),new Date().toISOString(),Intl.DateTimeFormat().resolvedOptions().timeZone,'staged');
  }
  const before={...observed,...(upload?{upload}:{}),...(intent.action==='invite_shared_participants'?{preparedInvitations:intent.emails.map(email=>({email,invitationGuid:randomUUID()}))}:{})};
  this.options.db.query("UPDATE photos_shared_operations SET snapshot=?,status='prepared' WHERE id=? AND owner=? AND account=? AND status='preparing'").run(JSON.stringify(before),operationId,this.options.owner,this.options.accountId);
  return {operationId,status:'prepared',accountId:this.options.accountId,albumId:this.id(guid),intent,before,...(['invite_shared_participants','remove_shared_participant','delete_shared_album'].includes(intent.action)?{mayNotify:true}:{}),...(intent.action==='delete_shared_album'?{warning:'Deletes this Shared Album, all its shared copies and its subscriptions for everyone. Original library assets are not targeted.'}:{}),...(intent.action==='set_shared_public_access'&&intent.enabled?{warning:'Enabling public access makes this album available to anyone with its public link.'}:{}),expiresAt:new Date(expires).toISOString(),experimental:true,message:'Undocumented provider: review the exact account, album and change. Creation does not invite anyone or upload photos. Deleting an empty Shared Album ends its subscriptions. Apply once; uncertain writes must be reconciled.'};
 }

 private track<T>(id:string,work:()=>Promise<T>):Promise<T>{
  let active=activeOperations.get(this.options.db);if(!active){active=new Set();activeOperations.set(this.options.db,active);}
  active.add(id);
  return work().catch(error=>{
   this.options.db.query("UPDATE photos_shared_operations SET status='rejected',result=? WHERE id=? AND owner=? AND account=? AND status IN ('preparing','prepared')").run(JSON.stringify({error:error instanceof PhotosError?error.code:'shared_album_preflight_failed'}),id,this.options.owner,this.options.accountId);
   throw error;
  }).finally(()=>active!.delete(id));
 }
 async prepare(raw:unknown){const reserved=this.reserve(raw);return this.track(reserved.operationId,()=>this.finishPrepare(reserved));}
 prepareBackground(raw:unknown){
  const reserved=this.reserve(raw);
  void this.track(reserved.operationId,async()=>{
   const result=await this.finishPrepare(reserved);
   this.options.db.query("UPDATE photos_shared_operations SET result=? WHERE id=? AND owner=? AND account=? AND status='prepared'").run(JSON.stringify(result),reserved.operationId,this.options.owner,this.options.accountId);
  }).catch(()=>{});
  return this.status(reserved.operationId);
 }
 async cancel(id:string){
  this.check(true);const row=this.row(id);
  if(activeOperations.get(this.options.db)?.has(id)||!['prepared','rejected','cancelled'].includes(row.status))throw new PhotosError('shared_operation_cannot_cancel');
  this.options.db.query("UPDATE photos_shared_operations SET status='cancelled',result=? WHERE id=? AND owner=? AND account=? AND status IN ('prepared','rejected')").run(JSON.stringify({cancelledBeforeDispatch:true}),id,this.options.owner,this.options.accountId);
  await this.cleanupUpload(id);return this.status(id);
 }
 applyBackground(id:string,confirm:boolean){
  this.check(true);if(confirm!==true)throw new PhotosError('confirmation_required');
  if(this.row(id).status!=='prepared'||activeOperations.get(this.options.db)?.has(id))return this.status(id);
  void this.track(id,()=>this.apply(id,confirm)).catch(()=>{});
  return this.status(id);
 }
 status(id:string){this.check();let row=this.row(id);const inFlight=activeOperations.get(this.options.db)?.has(id)??false;
  if(row.status==='preparing'&&!inFlight){this.options.db.query("UPDATE photos_shared_operations SET status='rejected',result=? WHERE id=? AND owner=? AND account=? AND status='preparing'").run(JSON.stringify({error:'shared_album_prepare_interrupted'}),id,this.options.owner,this.options.accountId);row=this.row(id);}
  const upload=this.options.db.query('SELECT stage,assetGuid,jobId FROM photos_shared_uploads WHERE operationId=?').get(id);
  return {...(upload?{upload}:{}),operationId:id,accountId:row.account,albumId:this.id(row.albumGuid),intent:JSON.parse(row.intent),inFlight,status:row.status==='executing'?'outcome_unknown':row.status==='prepared'&&inFlight?'checking':row.status,result:row.result?JSON.parse(row.result):null,experimental:true};}
 private async desiredState(session:Session,row:Row){
  const intent=sharedAlbumIntent.parse(JSON.parse(row.intent));
  if(intent.action==='upload_shared_asset'||intent.action==='upload_shared_test_fixture'){
   const upload=this.uploadRow(row.id);
   const job=upload.jobId?await readSharedUploadJob(session,this.options.accountId,upload.jobId).catch(()=>({status:'unavailable',automaticRetry:false})):null;
   const membership=await readSharedStreamMembership(session,this.options.accountId,row.albumGuid);
   return {matches:membership.assets.some(a=>a.assetGuid.toUpperCase()===upload.assetGuid.toUpperCase()),assetGuid:upload.assetGuid,job,membership};
  }
  const list=await readSharedStreamAlbums(session,this.options.accountId,undefined,true);
  const found=list.albums.find(a=>a.albumGuid===row.albumGuid);
  if(intent.action==='delete_empty_shared_album'||intent.action==='delete_shared_album')return {matches:!found,albumAbsent:!found};
  if(!found)return {matches:false,albumAbsent:true};
  const exact=(await readSharedStreamAlbums(session,this.options.accountId,row.albumGuid)).albums[0]!;
  const count=await readSharedStreamCount(session,this.options.accountId,row.albumGuid);
  const before=JSON.parse(row.snapshot);
  if(intent.action==='remove_shared_assets'){
   const membership=await readSharedStreamMembership(session,this.options.accountId,row.albumGuid),remaining=new Set(membership.assets.map(a=>a.assetGuid)),removed=new Set(intent.assetGuids);
   const preserved=before.membership.assets.filter((a:{assetGuid:string})=>!removed.has(a.assetGuid)).every((a:{assetGuid:string})=>remaining.has(a.assetGuid));
   return {matches:intent.assetGuids.every(id=>!remaining.has(id))&&preserved,membership,count:membership.total,originalLibraryModified:false};
  }
  const desired=intent.action==='invite_shared_participants'?Array.isArray(exact.participants)&&before.preparedInvitations.every((invite:{email:string;invitationGuid:string})=>exact.participants!.some(p=>p.invitationguid===invite.invitationGuid&&p.email?.toLowerCase()===invite.email.toLowerCase()&&['pending','subscribed'].includes(p.sharingtype?.toLowerCase()??''))):intent.action==='remove_shared_participant'?Array.isArray(exact.participants)&&!exact.participants.some(p=>p.invitationguid===intent.invitationId&&p.sharingtype?.toLowerCase()!=='unshared'):intent.action==='set_shared_contributions'?exact.allowsContributions===intent.enabled&&exact.title===before.album.title&&exact.isPublic===before.album.isPublic:intent.action==='set_shared_public_access'?exact.isPublic===intent.enabled&&exact.title===before.album.title&&exact.allowsContributions===before.album.allowsContributions:exact.title===intent.title&&(intent.action!=='create_shared_album'||count===0);
  return {matches:exact.rights==='owner'&&exact.protocol==='legacy_candidate'&&desired,album:{...exact,id:this.id(row.albumGuid)},count};
 }
 async apply(id:string,confirm:boolean){
  if(confirm!==true)throw new PhotosError('confirmation_required');this.check(true);
  const row=this.row(id);if(row.status!=='prepared')return this.status(id);
  if(row.expires<Date.now())throw new PhotosError('plan_expired');
  const intent=sharedAlbumIntent.parse(JSON.parse(row.intent)),session=this.options.session();
  const current=await this.snapshot(session,intent,row.albumGuid);this.check(true);
  const expected=JSON.parse(row.snapshot);delete expected.preparedInvitations;delete expected.upload;
  if(JSON.stringify(current)!==JSON.stringify(expected))throw new PhotosError('stale_plan');
  const claimed=this.options.db.query(`UPDATE photos_shared_operations SET status='executing',started=? WHERE id=? AND owner=? AND account=? AND status='prepared'
   AND NOT EXISTS(SELECT id FROM photos_shared_operations WHERE status IN ('executing','outcome_unknown'))
   AND NOT EXISTS(SELECT id FROM photos_operations WHERE status IN ('executing','outcome_unknown','review_pending'))`).run(Date.now(),id,this.options.owner,this.options.accountId);
  if(!claimed.changes){if(this.row(id).status==='prepared')throw new PhotosError('another_operation_in_progress');return this.status(id);}
  let status='outcome_unknown',result:unknown={error:'shared_album_write_outcome_unknown'};
  try{
   this.check(true);
   if(intent.action==='upload_shared_asset'||intent.action==='upload_shared_test_fixture'){
    await this.dispatchUpload(session,row);
    const observed=await this.desiredState(session,row);this.check(true);
    status=observed.matches?'applied':'outcome_unknown';result={...observed,serverReadbackVerified:observed.matches,crossDeviceObserved:false,operationCausedChangeVerified:observed.matches};
   }else{
   const mutation:SharedStreamMutation=intent.action==='create_shared_album'?{action:'create_shared_album',albumGuid:row.albumGuid,title:intent.title}:intent.action==='rename_shared_album'?{action:'rename_shared_album',albumGuid:row.albumGuid,title:intent.title}:intent.action==='set_shared_contributions'?{action:intent.action,albumGuid:row.albumGuid,currentName:JSON.parse(row.snapshot).album.title,enabled:intent.enabled}:intent.action==='set_shared_public_access'?{action:intent.action,albumGuid:row.albumGuid,enabled:intent.enabled}:intent.action==='invite_shared_participants'?{action:intent.action,albumGuid:row.albumGuid,invitations:JSON.parse(row.snapshot).preparedInvitations}:intent.action==='remove_shared_participant'?{action:intent.action,albumGuid:row.albumGuid,invitationGuid:intent.invitationId}:intent.action==='remove_shared_assets'?{action:intent.action,albumGuid:row.albumGuid,assetGuids:intent.assetGuids}:{action:'delete_shared_album',albumGuid:row.albumGuid};
   const acknowledgement=await executeSharedStreamMutation(session,this.options.accountId,mutation);
   if(acknowledgement.status==='acknowledged_readback_required'){
    const observed=await this.desiredState(session,row);this.check(true);
    if(observed.matches){status='applied';result={...observed,serverReadbackVerified:true,localReadbackVerified:false,crossDeviceObserved:false,operationCausedChangeVerified:true};}
    else result={...observed,error:'shared_album_readback_pending',serverReadbackVerified:false,crossDeviceObserved:false};
   }
   }
  }catch(error){result={error:'shared_album_write_outcome_unknown',diagnostic:sharedReadDiagnostic(error)};}
  this.options.db.query('UPDATE photos_shared_operations SET status=?,result=? WHERE id=? AND owner=? AND account=?').run(status,JSON.stringify(result),id,this.options.owner,this.options.accountId);
  if(status==='applied')await this.cleanupUpload(id);
  return this.status(id);
 }
 private async cleanupUpload(id:string){
  if(!this.options.releaseUpload)return;
  const row=this.options.db.query('SELECT source FROM photos_shared_uploads WHERE operationId=?').get(id) as {source:string}|null;
  if(!row||row.source==='{}')return;
  try{await this.options.releaseUpload(JSON.parse(row.source));this.options.db.query("UPDATE photos_shared_uploads SET source='{}',stage='cleaned' WHERE operationId=?").run(id);}catch{/* Retain exact cleanup evidence for a later attempt; do not hide successful remote readback. */}
 }
 private uploadRow(id:string){
  const row=this.options.db.query('SELECT * FROM photos_shared_uploads WHERE operationId=?').get(id) as {source:string;assetGuid:string;batchGuid:string;submittedAt:string;timeZone:string;stage:string;jobId:string|null}|null;
  if(!row)throw new PhotosError('shared_upload_state_missing');return row;
 }
 private async dispatchUpload(session:Session,row:Row){
  const upload=this.uploadRow(row.id),source=JSON.parse(upload.source) as StagedUploadSource;
  const claimed=this.options.db.query("UPDATE photos_shared_uploads SET stage='uploading' WHERE operationId=? AND stage='staged'").run(row.id);
  if(!claimed.changes)throw new PhotosError('shared_upload_already_dispatched');
  const receipt=await session.uploadBytes!({albumGuid:row.albumGuid,privatePath:source.privatePath,bytes:source.bytes,sha256:source.sha256});
  this.check(true);
  const publishing=this.options.db.query("UPDATE photos_shared_uploads SET stage='publishing' WHERE operationId=? AND stage='uploading'").run(row.id);
  if(!publishing.changes)throw new PhotosError('shared_upload_publication_not_claimed');
  const acknowledged=await publishSharedUpload(session,this.options.accountId,{albumGuid:row.albumGuid,assetGuid:upload.assetGuid,batchGuid:upload.batchGuid,submittedAt:upload.submittedAt,timeZone:upload.timeZone,filename:source.filename},receipt,source.bytes);
  this.options.db.query("UPDATE photos_shared_uploads SET stage='submitted',jobId=? WHERE operationId=? AND stage='publishing'").run(acknowledged.jobId,row.id);
 }
 reconcileBackground(id:string){
  this.check();
  if(!['executing','outcome_unknown'].includes(this.row(id).status)||activeOperations.get(this.options.db)?.has(id))return this.status(id);
  void this.track(id,()=>this.reconcile(id,true)).catch(error=>{this.options.db.query("UPDATE photos_shared_operations SET result=? WHERE id=? AND owner=? AND account=? AND status='outcome_unknown'").run(JSON.stringify({error:'shared_album_readback_failed',diagnostic:sharedReadDiagnostic(error)}),id,this.options.owner,this.options.accountId);});
  return this.status(id);
 }
 /** Reconciliation only reads. A matching state does not prove a lost write caused it. */
 async reconcile(id:string,ownedTask=false){
  this.check();const row=this.row(id);if(!['executing','outcome_unknown'].includes(row.status))return this.status(id);
  if(!ownedTask&&activeOperations.get(this.options.db)?.has(id))throw new PhotosError('operation_still_executing');
  if(row.status==='executing'){
   if(row.started+SHARED_RECOVERY_GRACE_MS>Date.now())throw new PhotosError('operation_still_executing');
   // Recovery covers the dispatch and all readback actors, not only the write.
   this.options.db.query("UPDATE photos_shared_operations SET status='outcome_unknown' WHERE id=? AND owner=? AND account=? AND status='executing'").run(id,this.options.owner,this.options.accountId);
  }
  const observed=await this.desiredState(this.options.session(),row);this.check();
  if(observed.matches)this.options.db.query("UPDATE photos_shared_operations SET status='reconciled',result=? WHERE id=? AND owner=? AND account=? AND status='outcome_unknown'").run(JSON.stringify({...observed,serverReadbackVerified:true,operationCausedChangeVerified:false,crossDeviceObserved:false}),id,this.options.owner,this.options.accountId);
  if(observed.matches)await this.cleanupUpload(id);
  else if(['upload_shared_asset','upload_shared_test_fixture'].includes(JSON.parse(row.intent).action)){
   const upload=this.uploadRow(id);
   // Publication always requires a durable transition out of these stages.
   // Absence alone cannot resolve publishing/submitted operations.
   if(['staged','uploading'].includes(upload.stage)){
    const result={...observed,publicationDispatched:false,publicationStageVerified:true,
     binaryTransferOutcome:upload.stage==='uploading'?'unknown':'not_started',
     remoteStagedResourceMayRemain:upload.stage==='uploading',serverMembershipVerifiedAbsent:true,
     operationCausedChangeVerified:false,crossDeviceObserved:false,automaticRetry:false,lastDispatchStage:upload.stage};
    const settled=this.options.db.query("UPDATE photos_shared_operations SET status='not_published',result=? WHERE id=? AND owner=? AND account=? AND status='outcome_unknown'").run(JSON.stringify(result),id,this.options.owner,this.options.accountId);
    if(settled.changes)await this.cleanupUpload(id);
   }
  }
  return this.status(id);
 }
}
