import {mkdir,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {z} from 'zod';
import {PhotosError} from './contracts.js';

export const reviewEvent=z.object({operationId:z.string().uuid(),status:z.enum([
 'review_pending','picker_review','cancelled_before_posting','selection_changed_review_required',
 'posting_outcome_unknown','posting_closed_outcome_unknown','posting_not_verified','posting_completed_membership_unverified',
 'different_destination_membership_unverified','journal_failed_reconcile_operation','catalog_review','catalog_cancelled','selection_reviewed','outcome_unknown'
]),timestamp:z.number(),processId:z.number().int().positive().optional(),actualAlbum:z.string().optional(),selectedAssetIds:z.array(z.string().regex(/^asset:[a-f0-9]{16}:[A-Fa-f0-9-]{36}$/)).max(12).optional(),localReadbackVerified:z.literal(false),serverSyncVerified:z.literal(false)}).strict();

/** Durable UI sessions survive request timeouts. No retry/cleanup of unresolved sessions. */
export async function reviewDirectory(directory:string){
 if(!isAbsolute(directory))throw new PhotosError('private_review_directory_required');
 await mkdir(directory,{recursive:true,mode:0o700});
 const s=await lstat(directory);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o777)!==0o700||s.uid!==process.getuid?.())throw new PhotosError('private_review_directory_required');
 return directory;
}
export async function reserveReview(directory:string,id:string){
 z.string().uuid().parse(id);await reviewDirectory(directory);
 // Reserve identity before launch. An ambiguous launch never permits relaunch.
 const file=await open(join(directory,id+'.reserved'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(id);await file.sync();}finally{await file.close();}
}
export async function readReview(directory:string,id:string){
 z.string().uuid().parse(id);await reviewDirectory(directory);
 let file;try{file=await open(join(directory,id+'.jsonl'),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {operationId:id,status:'outcome_unknown' as const,nativeProcessAlive:null,localReadbackVerified:false as const,serverSyncVerified:false as const};throw new PhotosError('review_record_unavailable');}
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>1024*1024)throw new PhotosError('invalid_review_record');
  const content=await file.readFile('utf8');
  // Ignore an incomplete final append after a crash. Prior flushed state remains authoritative.
  const lines=content.slice(0,content.lastIndexOf('\n')+1).split('\n').filter(Boolean);
  if(!lines.length)return {operationId:id,status:'outcome_unknown' as const,nativeProcessAlive:null,localReadbackVerified:false as const,serverSyncVerified:false as const};
  const events=lines.map(line=>reviewEvent.parse(JSON.parse(line)));
  if(events.some(e=>e.operationId!==id))throw new PhotosError('invalid_review_record');
  const last=events.at(-1)!;let nativeProcessAlive:boolean|null=null;
  if(last.processId){try{process.kill(last.processId,0);nativeProcessAlive=true;}catch(e){nativeProcessAlive=(e as NodeJS.ErrnoException).code==='ESRCH'?false:null;}}
  // PID reuse is conservatively treated as alive; never terminate an arbitrary process.
  let manifestAssetIds:string[]|undefined;
  let manifest;try{manifest=await open(join(directory,id+'.manifest.json'),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new PhotosError('invalid_review_manifest');}
  if(manifest)try{
   const stat=await manifest.stat();if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>128*1024)throw new PhotosError('invalid_review_manifest');
   const parsed=z.object({operationId:z.literal(id),entries:z.array(z.object({assetId:z.string().regex(/^asset:[a-f0-9]{16}:[A-Fa-f0-9-]{36}$/)}).passthrough()).max(12)}).passthrough().parse(JSON.parse(await manifest.readFile('utf8')));
   manifestAssetIds=parsed.entries.map(e=>e.assetId);
  }finally{await manifest.close();}
  return {...last,nativeProcessAlive,...(manifestAssetIds?{manifestAssetIds}:{})};
 }catch(e){throw e instanceof PhotosError?e:new PhotosError('invalid_review_record');}finally{await file.close();}
}
