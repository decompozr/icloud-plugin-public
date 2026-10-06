import {test,expect} from 'bun:test';
import {mkdtemp,rm,writeFile,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {reserveReview,readReview} from './shared-review.js';

test('review identity survives an uncertain launch and cannot be reserved twice',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'photos-review-test-')),id=randomUUID();
 try{await reserveReview(directory,id);await expect(reserveReview(directory,id)).rejects.toThrow();expect((await readReview(directory,id)).status).toBe('outcome_unknown');}
 finally{await rm(directory,{recursive:true});}
});
test('crash during journal append preserves the prior flushed unknown outcome',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'photos-review-test-')),id=randomUUID();
 try{const event={operationId:id,status:'posting_outcome_unknown',timestamp:1,localReadbackVerified:false,serverSyncVerified:false} as const;await writeFile(join(directory,id+'.jsonl'),JSON.stringify(event)+'\n{"status":"posting_completed', {mode:0o600});expect(await readReview(directory,id)).toEqual({...event,nativeProcessAlive:null});}
 finally{await rm(directory,{recursive:true});}
});
test('review records reject identity changes, public permissions and symbolic links',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'photos-review-test-')),id=randomUUID();
 try{const path=join(directory,id+'.jsonl');const event={operationId:randomUUID(),status:'review_pending',timestamp:1,localReadbackVerified:false,serverSyncVerified:false};await writeFile(path,JSON.stringify(event)+'\n',{mode:0o600});await expect(readReview(directory,id)).rejects.toThrow('invalid_review_record');await chmod(path,0o644);await expect(readReview(directory,id)).rejects.toThrow('invalid_review_record');await rm(path);await symlink(join(directory,'unrelated'),path);await expect(readReview(directory,id)).rejects.toThrow('review_record_unavailable');}
 finally{await rm(directory,{recursive:true});}
});

test('native presentation errors remain durable unverified outcomes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'photos-review-test-')),id=randomUUID();
 try{const event={operationId:id,status:'posting_not_verified',timestamp:1,nativeErrorDomain:'PHPhotosErrorDomain',nativeErrorCode:3300,localReadbackVerified:false,serverSyncVerified:false} as const;await writeFile(join(directory,id+'.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});expect(await readReview(directory,id)).toEqual({...event,nativeProcessAlive:null});}
 finally{await rm(directory,{recursive:true});}
});

test('comparison journal preserves both inputs and nested native failure diagnostics',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'photos-review-test-')),id=randomUUID();
 try{
  const error={domain:'NSCocoaErrorDomain',code:-1,description:'Operation failed',reason:'',debug:'Missing representation'};
  const event={operationId:id,status:'posting_not_verified',timestamp:1,localReadbackVerified:false,serverSyncVerified:false,nativeErrorDetails:[error],comparison:{identifierOnly:{identifierMatches:true,contentTypes:[],livePhotoLoaded:false},userSelected:{identifierMatches:true,contentTypes:['com.apple.live-photo'],livePhotoLoaded:true},itemsEqual:false}} as const;
  await writeFile(join(directory,id+'.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});
  const result=await readReview(directory,id);expect('comparison' in result && result.comparison?.userSelected.livePhotoLoaded).toBe(true);expect('nativeErrorDetails' in result && result.nativeErrorDetails?.[0]?.debug).toBe('Missing representation');
 }finally{await rm(directory,{recursive:true});}
});
