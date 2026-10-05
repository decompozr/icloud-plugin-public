import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {constants,closeSync,fsyncSync,fstatSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,renameSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {z} from 'zod';
import {CustodyError,installationIdentitySchema} from './custody-contract.js';

const phases=['file_authoritative','copy_intent','keychain_verified','keychain_authoritative','file_cleanup_pending','complete','recovery_required'] as const;
export type MasterAuthorityPhase=typeof phases[number];
const baselineBindingSchema=z.object({phase:z.enum(['intent','established']),operationId:z.string().uuid(),masterGeneration:z.number().int().positive().safe(),recordMac:z.string().regex(/^[a-f0-9]{64}$/)}).strict().readonly();
const recordSchema=z.object({format:z.union([z.literal(1),z.literal(2)]),installationId:installationIdentitySchema,
 generation:z.number().int().positive().safe(),authority:z.enum(['file','keychain']),
 phase:z.enum(phases),operationId:z.string().uuid().nullable(),baseline:baselineBindingSchema.optional(),mac:z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((v,c)=>{
 if(v.format===1?v.baseline!==undefined:v.baseline===undefined)c.addIssue({code:'custom',message:'Invalid baseline format'});
 if(v.baseline&&(v.baseline.masterGeneration>=v.generation||v.operationId!==null&&v.operationId!==v.baseline.operationId||v.baseline.phase==='intent'&&!['file_authoritative','recovery_required'].includes(v.phase)))c.addIssue({code:'custom',message:'Invalid baseline binding'});
 if(v.phase==='recovery_required')return;
 const file=['file_authoritative','copy_intent','keychain_verified'].includes(v.phase);
 if(v.authority!==(file?'file':'keychain')||(v.phase==='file_authoritative')!==(v.operationId===null))c.addIssue({code:'custom',message:'Invalid custody authority'});
});
export type MasterAuthorityRecord=Readonly<z.infer<typeof recordSchema>>;
const transitions:Record<MasterAuthorityPhase,readonly MasterAuthorityPhase[]>={
 file_authoritative:['copy_intent','recovery_required'],copy_intent:['keychain_verified','recovery_required'],
 keychain_verified:['keychain_authoritative','recovery_required'],keychain_authoritative:['file_cleanup_pending','recovery_required'],
 file_cleanup_pending:['complete','recovery_required'],complete:['recovery_required'],recovery_required:[],
};
export type AuthorityCheckpoint='temp_fsynced'|'renamed'|'directory_fsynced';
/** Test fault seam; production callers do not supply a hook. */
type FaultHook=(checkpoint:AuthorityCheckpoint)=>void;
export interface AuthorityExpectation {readonly requiredAuthority?:'file'|'keychain';readonly minimumGeneration?:number}
export interface MasterRecoveryInspection {
 readonly committed:MasterAuthorityRecord;
 readonly operationId:string;
 readonly lock:Readonly<{inode:number;device:number}>|null;
 readonly staged:Readonly<{name:string;record:MasterAuthorityRecord}>|null;
 readonly nextAction:'ordinary_acquire'|'external_stop_then_reconcile'|'protected_recovery';
}
const fail=(code:'invalid_input'|'conflict'|'missing'|'recovery_required'|'outcome_unknown'):never=>{throw new CustodyError(code);};
const privateInfo=(path:string,directory:boolean)=>{
 const info=lstatSync(path);
 if(info.isSymbolicLink()||!(directory?info.isDirectory():info.isFile())||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)fail('recovery_required');
 return info;
};
const syncDirectory=(path:string)=>{const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}};
const mac=(key:Uint8Array,record:Omit<MasterAuthorityRecord,'mac'>)=>{
 if(key.byteLength!==32)fail('invalid_input');
 return createHmac('sha256',key).update(record.format===1?'icloud-master-custody-manifest-v1\0':'icloud-master-custody-manifest-v2\0').update(JSON.stringify(record)).digest('hex');
};
// Explicit field order prevents JSON property ordering from changing the MAC.
const payload=(record:MasterAuthorityRecord)=>({format:record.format,installationId:record.installationId,
 generation:record.generation,authority:record.authority,phase:record.phase,operationId:record.operationId,...(record.format===2?{baseline:record.baseline}:{})});
const boundOperation=(record:MasterAuthorityRecord)=>record.operationId??record.baseline?.operationId??null;
function baselineTransition(current:MasterAuthorityRecord,next:MasterAuthorityRecord):boolean {
 if(current.phase!=='file_authoritative'||next.phase!=='file_authoritative'||next.authority!=='file'||next.operationId!==null||next.format!==2||!next.baseline)return false;
 if(current.format===1)return next.baseline.phase==='intent'&&next.baseline.masterGeneration===current.generation;
 return current.baseline?.phase==='intent'&&next.baseline.phase==='established'&&JSON.stringify({...current.baseline,phase:'established'})===JSON.stringify(next.baseline);
}

/**
 * Pre-owner-store authority metadata. Discover is UNTRUSTED routing metadata:
 * validate it with the original key before opening bound DBs or serving requests.
 * Startup uses discover/verify for file-mode compatibility checks only;
 * administrative mutation APIs remain unwired. No secret/native item lives here.
 */
export class MasterAuthorityJournal {
 readonly directory:string;
 readonly path:string;
 readonly lockPath:string;
 private lockIdentity:object|undefined;
 constructor(directory:string,readonly installationId:string,private fault?:FaultHook){
  try{installationIdentitySchema.parse(installationId);}catch{fail('invalid_input');}
  this.directory=resolve(directory);this.path=join(this.directory,'master-authority.json');
  this.lockPath=join(this.directory,'custody-mutation.lock');
  try{privateInfo(this.directory,true);}catch{fail('recovery_required');}
 }
 discover(expectation:AuthorityExpectation={}):MasterAuthorityRecord {
  try{
   privateInfo(this.directory,true);
   const fd=openSync(this.path,constants.O_RDONLY|constants.O_NOFOLLOW);
   try{
    const info=fstatSync(fd);
    if(!info.isFile()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0||info.size>4096)fail('recovery_required');
    const record=recordSchema.parse(JSON.parse(readFileSync(fd,'utf8')));
    if(record.installationId!==this.installationId)fail('recovery_required');
    // The caller's independently selected backend/version floor may reject a
    // valid older snapshot before even fetching custody. This is not a global
    // anti-rollback counter and does not protect rollback of all bound state.
    if(expectation.requiredAuthority&&record.authority!==expectation.requiredAuthority)fail('recovery_required');
    if(expectation.minimumGeneration!==undefined&&(!Number.isSafeInteger(expectation.minimumGeneration)||expectation.minimumGeneration<1||record.generation<expectation.minimumGeneration))fail('recovery_required');
    return Object.freeze(record);
   }finally{closeSync(fd);}
  }catch(error){if(error instanceof CustodyError)throw error;if((error as NodeJS.ErrnoException).code==='ENOENT')fail('missing');return fail('recovery_required');}
 }
 verify(key:Uint8Array,expectation:AuthorityExpectation={}):MasterAuthorityRecord {
  const record=this.discover(expectation),expected=mac(key,payload(record));
  if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(record.mac,'hex')))fail('recovery_required');
  return record;
 }
 /**
  * Read-only recovery evidence, not a lease or proof that a writer is dead.
  * A future exclusive stopped-maintenance coordinator must reinspect before
  * resolving locks/staging. Never promotes staging, changes authority or deletes.
  */
 inspectRecovery(key:Uint8Array,operationId:string,expectation:AuthorityExpectation={}):MasterRecoveryInspection {
  try{
   if(!z.string().uuid().safeParse(operationId).success)fail('invalid_input');
   const committed=this.verify(key,expectation);
   if(boundOperation(committed)!==null&&boundOperation(committed)!==operationId)fail('conflict');
   const names=readdirSync(this.directory).filter(name=>name.startsWith('.master-authority.')&&name.endsWith('.pending')).sort();
   if(names.length>1)fail('recovery_required');
   let lock:MasterRecoveryInspection['lock']=null;
   try{
    const info=privateInfo(this.lockPath,true);
    // Unknown lock contents/incomplete locks require protected operator recovery.
    if(JSON.stringify(readdirSync(this.lockPath).sort())!==JSON.stringify(['operation.json']))fail('recovery_required');
    const fd=openSync(join(this.lockPath,'operation.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
     const stat=fstatSync(fd);
     if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||stat.size>4096)fail('recovery_required');
     const record=z.object({format:z.literal(1),installationId:installationIdentitySchema,operationId:z.string().uuid()}).strict().parse(JSON.parse(readFileSync(fd,'utf8')));
     if(record.installationId!==this.installationId||record.operationId!==operationId)fail('conflict');
    }finally{closeSync(fd);}
    lock=Object.freeze({inode:info.ino,device:info.dev});
   }catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    // A present directory with missing operation metadata is not an absent lock.
    try{lstatSync(this.lockPath);fail('recovery_required');}catch(probe){if((probe as NodeJS.ErrnoException).code!=='ENOENT')throw probe;}
   }
   let staged:MasterRecoveryInspection['staged']=null;
   if(names.length){
    if(lock===null)fail('recovery_required');
    const name=names[0]!,match=/^\.master-authority\.([a-f0-9-]{36})\.([a-f0-9-]{36})\.pending$/.exec(name);
    if(!match||match[1]!==operationId||!z.string().uuid().safeParse(match[2]).success)fail('recovery_required');
    const fd=openSync(join(this.directory,name),constants.O_RDONLY|constants.O_NOFOLLOW);
    let record:MasterAuthorityRecord;
    try{
     const stat=fstatSync(fd);
     if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||stat.size>4096)fail('recovery_required');
     record=recordSchema.parse(JSON.parse(readFileSync(fd,'utf8')));
    }finally{closeSync(fd);}
    const normalTransition=transitions[committed.phase].includes(record.phase)&&record.format===committed.format&&JSON.stringify(record.baseline)===JSON.stringify(committed.baseline);
    if(record.installationId!==this.installationId||boundOperation(record)!==operationId||record.generation!==committed.generation+1||!(normalTransition||baselineTransition(committed,record)))fail('recovery_required');
    const authority=record.phase==='keychain_authoritative'?'keychain':committed.authority;
    if(record.authority!==authority||!timingSafeEqual(Buffer.from(record.mac,'hex'),Buffer.from(mac(key,payload(record)),'hex')))fail('recovery_required');
    staged=Object.freeze({name,record:Object.freeze(record)});
   }
   // A live cooperative writer may have changed the snapshot during inspection.
   // This check is not filesystem isolation against malicious same-user races.
   if(JSON.stringify(this.verify(key,expectation))!==JSON.stringify(committed)||JSON.stringify(readdirSync(this.directory).filter(name=>name.startsWith('.master-authority.')&&name.endsWith('.pending')).sort())!==JSON.stringify(names))fail('conflict');
   if(lock!==null){const stat=privateInfo(this.lockPath,true);if(stat.ino!==lock.inode||stat.dev!==lock.device)fail('conflict');}
   else{try{lstatSync(this.lockPath);fail('conflict');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
   return Object.freeze({committed,operationId,lock,staged,nextAction:committed.phase==='recovery_required'?'protected_recovery':lock===null?'ordinary_acquire':'external_stop_then_reconcile'});
  }catch(error){if(error instanceof CustodyError)throw error;return fail('recovery_required');}
 }
 /** Exclusive setup/update/migration/removal coordination. Never steals an existing lock. */
 acquire(operationId:string):AuthorityLease {
  try{z.string().uuid().parse(operationId);privateInfo(this.directory,true);}catch{fail('invalid_input');}
  if(this.lockIdentity)fail('conflict');
  this.rejectPendingWrite();
  try{mkdirSync(this.lockPath,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')fail('conflict');return fail('recovery_required');}
  try{
   const record=join(this.lockPath,'operation.json'),fd=openSync(record,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{writeFileSync(fd,JSON.stringify({format:1,installationId:this.installationId,operationId}));fsyncSync(fd);}finally{closeSync(fd);}
   syncDirectory(this.lockPath);syncDirectory(this.directory);
   const info=privateInfo(this.lockPath,true),identity={};this.lockIdentity=identity;
   return new AuthorityLease(this,operationId,identity,info.ino,info.dev);
  }catch{ // An incomplete lock is retained for explicit stopped recovery.
   return fail('recovery_required');
  }
 }
 private rejectPendingWrite():void {
  try{
   if(readdirSync(this.directory).some(name=>name.startsWith('.master-authority.')&&name.endsWith('.pending')))fail('recovery_required');
  }catch{fail('recovery_required');}
 }
 /** Internal lease validation also rejects a released/replaced lock handle. */
 assertLease(lease:AuthorityLease):void {
  if(!this.lockIdentity||lease.identity!==this.lockIdentity||lease.journal!==this)fail('conflict');
  try{
   const info=privateInfo(this.lockPath,true);
   if(info.ino!==lease.inode||info.dev!==lease.device)fail('conflict');
   privateInfo(join(this.lockPath,'operation.json'),false);
   const record=z.object({format:z.literal(1),installationId:installationIdentitySchema,operationId:z.string().uuid()}).strict().parse(JSON.parse(readFileSync(join(this.lockPath,'operation.json'),'utf8')));
   if(record.installationId!==this.installationId||record.operationId!==lease.operationId)fail('conflict');
  }catch(error){if(error instanceof CustodyError)throw error;fail('recovery_required');}
 }
 provision(lease:AuthorityLease,key:Uint8Array):MasterAuthorityRecord {
  this.assertLease(lease);
  try{lstatSync(this.path);fail('conflict');}catch(error){if(error instanceof CustodyError)throw error;if((error as NodeJS.ErrnoException).code!=='ENOENT')fail('recovery_required');}
  const record={format:1 as const,installationId:this.installationId,generation:1,authority:'file' as const,phase:'file_authoritative' as const,operationId:null};
  // Caller must independently validate the existing key/marker/state. Missing
  // journal does not authorize this API during an ordinary open or after cutover.
  return this.persist(lease,{...record,mac:mac(key,record)});
 }
 advance(lease:AuthorityLease,key:Uint8Array,expectedGeneration:number,phase:MasterAuthorityPhase):MasterAuthorityRecord {
  this.assertLease(lease);
  const current=this.verify(key);
  if(current.generation!==expectedGeneration||!transitions[current.phase].includes(phase))fail('conflict');
  if(boundOperation(current)!==null&&boundOperation(current)!==lease.operationId)fail('conflict');
  if(current.format===2&&current.baseline?.phase!=='established'&&phase!=='recovery_required')fail('conflict');
  const next={...payload(current),generation:current.generation+1,phase,
   authority:phase==='keychain_authoritative'?'keychain' as const:current.authority,
   operationId:current.operationId??lease.operationId};
  if(!Number.isSafeInteger(next.generation))fail('recovery_required');
  return this.persist(lease,recordSchema.parse({...next,mac:mac(key,next)}));
 }
 /** Administrative format-2 intent pins the exact baseline MAC before file creation. */
 beginBaseline(lease:AuthorityLease,key:Uint8Array,expectedGeneration:number,recordMac:string):MasterAuthorityRecord {
  this.assertLease(lease);const current=this.verify(key);
  if(current.format!==1||current.phase!=='file_authoritative'||current.generation!==expectedGeneration||!/^[a-f0-9]{64}$/.test(recordMac))fail('conflict');
  const next={...payload(current),format:2 as const,generation:current.generation+1,baseline:{phase:'intent' as const,operationId:lease.operationId,masterGeneration:current.generation,recordMac}};
  return this.persist(lease,recordSchema.parse({...next,mac:mac(key,next)}));
 }
 establishBaseline(lease:AuthorityLease,key:Uint8Array,expectedGeneration:number):MasterAuthorityRecord {
  this.assertLease(lease);const current=this.verify(key);
  if(current.format!==2||current.phase!=='file_authoritative'||current.generation!==expectedGeneration||current.baseline?.phase!=='intent'||current.baseline.operationId!==lease.operationId)fail('conflict');
  const binding=baselineBindingSchema.parse(current.baseline);
  const next={...payload(current),generation:current.generation+1,baseline:{...binding,phase:'established' as const}};
  return this.persist(lease,recordSchema.parse({...next,mac:mac(key,next)}));
 }
 private persist(lease:AuthorityLease,record:MasterAuthorityRecord):MasterAuthorityRecord {
  // An uncommitted staging record is an unresolved intent, not permission to
  // retry under another operation or recreate a missing authority manifest.
  this.rejectPendingWrite();
  // A unique nonsecret staging file remains on an interrupted write. Do not
  // delete unknown artifacts or blind-retry an ambiguous authority change.
  const staged=join(this.directory,`.master-authority.${lease.operationId}.${randomUUID()}.pending`);
  try{
   const fd=openSync(staged,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{writeFileSync(fd,JSON.stringify(record)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
   this.fault?.('temp_fsynced');this.assertLease(lease);
   renameSync(staged,this.path);this.fault?.('renamed');
   syncDirectory(this.directory);this.fault?.('directory_fsynced');
   return Object.freeze(record);
  }catch{ // Includes a committed mutation whose reply was lost.
   return fail('outcome_unknown');
  }
 }
 release(lease:AuthorityLease):void {
  this.assertLease(lease);
  try{
   unlinkSync(join(this.lockPath,'operation.json'));rmdirSync(this.lockPath);syncDirectory(this.directory);
   this.lockIdentity=undefined;
  }catch{fail('recovery_required');}
 }
}

/** Not a lock-recovery token: reopening a journal never reconstructs a lease. */
export class AuthorityLease {
 constructor(readonly journal:MasterAuthorityJournal,readonly operationId:string,readonly identity:object,readonly inode:number,readonly device:number){}
 release():void {this.journal.release(this);}
}
