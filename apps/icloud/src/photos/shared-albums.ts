import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {PhotosError} from './contracts.js';
import type {PhotosPolicy} from './service.js';
import {readSharedStreamAlbums,readSharedStreamCount,executeSharedStreamMutation,type SharedStreamSession,type SharedStreamMutation} from './shared-stream-protocol.js';

export const remoteSharedAlbumId=z.string().regex(/^shared-album:[a-f0-9-]{36}:[A-Fa-f0-9-]{36}$/);
const title=z.string().trim().min(1).max(200);
export const sharedAlbumIntent=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_shared_album'),title,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('rename_shared_album'),albumId:remoteSharedAlbumId,title,experimental:z.literal(true)}).strict(),
 z.object({action:z.literal('delete_empty_shared_album'),albumId:remoteSharedAlbumId,experimental:z.literal(true)}).strict(),
]);
type Intent=z.infer<typeof sharedAlbumIntent>;
type Session=SharedStreamSession&{generation:number;accountRevision:number};
interface Row{id:string;owner:string;account:string;intent:string;albumGuid:string;snapshot:string;status:string;result:string|null;expires:number;started:number}
export function initializeSharedAlbumLedger(db:Database){db.exec(`CREATE TABLE IF NOT EXISTS photos_shared_operations (
 id TEXT PRIMARY KEY,owner TEXT NOT NULL,account TEXT NOT NULL,intent TEXT NOT NULL,
 albumGuid TEXT NOT NULL,snapshot TEXT NOT NULL,status TEXT NOT NULL,result TEXT,expires INTEGER NOT NULL,started INTEGER NOT NULL DEFAULT 0)`);}

/** Account-bound experimental lifecycle with durable dispatch and server readback. */
export class SharedAlbumService {
 constructor(private options:{db:Database;owner:string;accountId:string;currentOwner:()=>string;policy:()=>PhotosPolicy;session:()=>Session}){
  initializeSharedAlbumLedger(options.db);
 }
 private check(write=false){const p=this.options.policy();if(this.options.currentOwner()!==this.options.owner||!p.read||write&&!p.write)throw new PhotosError('forbidden');}
 private id(guid:string){return `shared-album:${this.options.accountId}:${guid.toUpperCase()}`;}
 private guid(id:string){const parts=remoteSharedAlbumId.parse(id).split(':');if(parts[1]!==this.options.accountId)throw new PhotosError('shared_album_account_mismatch');return parts[2]!.toUpperCase();}
 private row(id:string){const row=this.options.db.query('SELECT * FROM photos_shared_operations WHERE id=? AND owner=? AND account=?').get(id,this.options.owner,this.options.accountId) as Row|null;if(!row)throw new PhotosError('operation_not_found');return row;}
 async albums(albumId?:string){
  this.check();const session=this.options.session();
  const result=await readSharedStreamAlbums(session,this.options.accountId,albumId?this.guid(albumId):undefined);this.check();
  return {...result,accountId:this.options.accountId,experimental:true,managementReady:false,albums:result.albums.map(a=>({...a,id:this.id(a.albumGuid)}))};
 }
 async health(){
  this.check();
  try{
   const result=await this.albums();
   return {status:'remote_inventory_verified',accountId:this.options.accountId,authenticated:true,total:result.albums.length,legacyCandidates:result.albums.filter(a=>a.protocol==='legacy_candidate').length,modernOrEncrypted:result.albums.filter(a=>a.protocol==='modern_or_encrypted').length,serverResponseObserved:true,managementReady:false,experimental:true};
  }catch(error){return {status:'unavailable',error:error instanceof PhotosError?error.code:'shared_album_readback_failed',serverResponseObserved:false,managementReady:false,experimental:true};}
 }
 private async snapshot(session:Session,intent:Intent,guid:string){
  const sessionIdentity={generation:session.generation,accountRevision:session.accountRevision};
  if(intent.action==='create_shared_album'){
   const list=await readSharedStreamAlbums(session,this.options.accountId);
   if(list.albums.some(a=>a.albumGuid===guid))throw new PhotosError('shared_album_identity_exists');
   return {...sessionIdentity,absent:true};
  }
  const result=await readSharedStreamAlbums(session,this.options.accountId,guid),album=result.albums[0]!;
  if(album.rights!=='owner')throw new PhotosError('shared_album_owner_required');
  if(album.protocol!=='legacy_candidate')throw new PhotosError('unsupported_shared_album_protocol');
  const count=await readSharedStreamCount(session,this.options.accountId,guid);
  if(intent.action==='delete_empty_shared_album'&&count!==0)throw new PhotosError('album_not_empty');
  return {...sessionIdentity,album,count};
 }
 async prepare(raw:unknown){
  this.check(true);const intent=sharedAlbumIntent.parse(raw);
  if(this.options.db.query("SELECT id FROM photos_shared_operations WHERE status IN ('executing','outcome_unknown') LIMIT 1").get())throw new PhotosError('unresolved_operation');
  const guid=intent.action==='create_shared_album'?randomUUID().toUpperCase():this.guid(intent.albumId);
  const before=await this.snapshot(this.options.session(),intent,guid);this.check(true);
  const operationId=randomUUID(),expires=Date.now()+15*60000;
  this.options.db.query('INSERT INTO photos_shared_operations(id,owner,account,intent,albumGuid,snapshot,status,expires) VALUES(?,?,?,?,?,?,?,?)').run(operationId,this.options.owner,this.options.accountId,JSON.stringify(intent),guid,JSON.stringify(before),'prepared',expires);
  return {operationId,status:'prepared',accountId:this.options.accountId,albumId:this.id(guid),intent,before,expiresAt:new Date(expires).toISOString(),experimental:true,message:'Undocumented provider: review the exact account, album and change. Creation does not invite anyone or upload photos. Deleting an empty Shared Album ends its subscriptions. Apply once; uncertain writes must be reconciled.'};
 }
 status(id:string){this.check();const row=this.row(id);return {operationId:id,accountId:row.account,albumId:this.id(row.albumGuid),intent:JSON.parse(row.intent),status:row.status==='executing'?'outcome_unknown':row.status,result:row.result?JSON.parse(row.result):null,experimental:true};}
 private async desiredState(session:Session,row:Row){
  const intent=sharedAlbumIntent.parse(JSON.parse(row.intent));
  const list=await readSharedStreamAlbums(session,this.options.accountId);
  const found=list.albums.find(a=>a.albumGuid===row.albumGuid);
  if(intent.action==='delete_empty_shared_album')return {matches:!found,albumAbsent:!found};
  if(!found)return {matches:false,albumAbsent:true};
  const exact=(await readSharedStreamAlbums(session,this.options.accountId,row.albumGuid)).albums[0]!;
  const count=await readSharedStreamCount(session,this.options.accountId,row.albumGuid);
  return {matches:exact.rights==='owner'&&exact.protocol==='legacy_candidate'&&exact.title===intent.title&&(intent.action!=='create_shared_album'||count===0),album:{...exact,id:this.id(row.albumGuid)},count};
 }
 async apply(id:string,confirm:boolean){
  if(confirm!==true)throw new PhotosError('confirmation_required');this.check(true);
  const row=this.row(id);if(row.status!=='prepared')return this.status(id);
  if(row.expires<Date.now())throw new PhotosError('plan_expired');
  const intent=sharedAlbumIntent.parse(JSON.parse(row.intent)),session=this.options.session();
  const current=await this.snapshot(session,intent,row.albumGuid);this.check(true);
  if(JSON.stringify(current)!==row.snapshot)throw new PhotosError('stale_plan');
  const claimed=this.options.db.query(`UPDATE photos_shared_operations SET status='executing',started=? WHERE id=? AND owner=? AND account=? AND status='prepared'
   AND NOT EXISTS(SELECT id FROM photos_shared_operations WHERE status IN ('executing','outcome_unknown'))
   AND NOT EXISTS(SELECT id FROM photos_operations WHERE status IN ('executing','outcome_unknown','review_pending'))`).run(Date.now(),id,this.options.owner,this.options.accountId);
  if(!claimed.changes){if(this.row(id).status==='prepared')throw new PhotosError('another_operation_in_progress');return this.status(id);}
  let status='outcome_unknown',result:unknown={error:'shared_album_write_outcome_unknown'};
  try{
   this.check(true);
   const mutation:SharedStreamMutation=intent.action==='create_shared_album'?{action:'create_shared_album',albumGuid:row.albumGuid,title:intent.title}:intent.action==='rename_shared_album'?{action:'rename_shared_album',albumGuid:row.albumGuid,title:intent.title}:{action:'delete_shared_album',albumGuid:row.albumGuid};
   const acknowledgement=await executeSharedStreamMutation(session,this.options.accountId,mutation);
   if(acknowledgement.status==='acknowledged_readback_required'){
    const observed=await this.desiredState(session,row);this.check(true);
    if(observed.matches){status='applied';result={...observed,serverReadbackVerified:true,localReadbackVerified:false,crossDeviceObserved:false,operationCausedChangeVerified:true};}
    else result={...observed,error:'shared_album_readback_pending',serverReadbackVerified:false,crossDeviceObserved:false};
   }
  }catch{result={error:'shared_album_write_outcome_unknown'};}
  this.options.db.query('UPDATE photos_shared_operations SET status=?,result=? WHERE id=? AND owner=? AND account=?').run(status,JSON.stringify(result),id,this.options.owner,this.options.accountId);
  return this.status(id);
 }
 /** Reconciliation only reads. A matching state does not prove a lost write caused it. */
 async reconcile(id:string){
  this.check();const row=this.row(id);if(!['executing','outcome_unknown'].includes(row.status))return this.status(id);
  if(row.status==='executing'){
   if(row.started+90000>Date.now())throw new PhotosError('operation_still_executing');
   // Dispatch actors are bounded to 30 seconds. Retain a longer recovery grace
   // before a restarted service may reconcile an interrupted call by reads.
   this.options.db.query("UPDATE photos_shared_operations SET status='outcome_unknown' WHERE id=? AND owner=? AND account=? AND status='executing'").run(id,this.options.owner,this.options.accountId);
  }
  const observed=await this.desiredState(this.options.session(),row);this.check();
  if(observed.matches)this.options.db.query("UPDATE photos_shared_operations SET status='reconciled',result=? WHERE id=? AND owner=? AND account=? AND status='outcome_unknown'").run(JSON.stringify({...observed,serverReadbackVerified:true,operationCausedChangeVerified:false,crossDeviceObserved:false}),id,this.options.owner,this.options.accountId);
  return this.status(id);
 }
}
