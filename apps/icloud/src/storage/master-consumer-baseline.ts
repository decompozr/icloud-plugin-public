import {createHmac,timingSafeEqual} from 'node:crypto';
import {constants,openSync,closeSync,fsyncSync,fstatSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {CustodyError,installationIdentitySchema} from './custody-contract.js';
import {MasterAuthorityJournal,type AuthorityLease} from './master-authority.js';
import {validateMasterConsumers,type MasterConsumerBaseline} from './master-consumer-validation.js';

const count=z.number().int().nonnegative().safe(),format=z.literal(1),text=z.string().min(1).max(2048);
const list=z.array(text).max(4096).refine(values=>new Set(values).size===values.length);
const baselineSchema=z.object({installationId:installationIdentitySchema,ownerId:text.nullable(),ownerFormat:z.enum(['legacy-v1','accounts-v2']),requiredAuthRecordId:z.string().regex(/^resource-client-v2:[a-f0-9]{64}$/).nullable(),mailOwnerNamespaces:list,calendarPolicyOwners:list,calendarAccountIdentities:z.array(z.object({ownerId:z.string().min(1).max(256),accountId:z.string().min(1).max(256)}).strict()).max(4096),expected:z.object({
 owner:z.object({format,accounts:count,accountCiphertexts:count,providerSessions:count,providerCiphertexts:count,legacyCiphertexts:count}).strict(),
 auth:z.object({format,records:count}).strict().nullable(),mail:z.object({format,records:count,encrypted:count,pending:count}).strict().nullable(),
 calendar:z.object({format,policies:count,operations:count,sync:count}).strict().nullable(),accountCustody:z.object({format,records:count,cleanup:count}).strict().nullable(),
}).strict()}).strict();
const recordSchema=z.object({format,operationId:z.string().uuid(),masterGeneration:z.number().int().positive().safe(),baseline:baselineSchema,mac:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Record=z.infer<typeof recordSchema>;
const payload=(record:Omit<Record,'mac'>)=>({format:record.format,operationId:record.operationId,masterGeneration:record.masterGeneration,baseline:record.baseline});
function sign(key:Uint8Array,record:Omit<Record,'mac'>):string {if(key.byteLength!==32)throw new CustodyError('invalid_input');return createHmac('sha256',key).update('icloud-master-consumer-baseline-v1\0').update(JSON.stringify(payload(record))).digest('hex');}
function freeze<T>(value:T):T {if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function privateFile(fd:number):void {const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||stat.nlink!==1||stat.size>1048576)throw new CustodyError('recovery_required');}
export type BaselineValidationStores=Pick<Parameters<typeof validateMasterConsumers>[0],'ownerDatabase'|'authDatabase'|'markerPath'|'assertStoppedMaintenance'>;

/** Inactive immutable administrative record, not a backup or runtime routing.
 * Baseline selection/capture is explicit and caller-authenticated; create itself
 * validates real supplied consumer snapshots before persisting it. No overwrite,
 * implicit recovery capture or file deletion. Format-2 master intent pins the
 * exact planned record before file creation; established loss cannot recapture.
 * Partial/unknown writes retain
 * evidence. HMAC does not protect rollback of this record and all dependent state.
 */
export class MasterConsumerBaselineStore {
 readonly path:string;
 /** Fault/close seams are for fixtures; production callers use defaults. */
 constructor(private journal:MasterAuthorityJournal,private fault?:(checkpoint:'file_fsynced'|'directory_fsynced')=>void,private closeFile:(fd:number)=>void=closeSync){this.path=join(journal.directory,'master-consumer-baseline.json');}
 read(key:Uint8Array,expectation:{operationId:string;minimumMasterGeneration:number}):MasterConsumerBaseline {
  let fd:number|undefined;
  try{
   if(!z.string().uuid().safeParse(expectation.operationId).success||!Number.isSafeInteger(expectation.minimumMasterGeneration)||expectation.minimumMasterGeneration<1)throw new CustodyError('invalid_input');
   const directory=lstatSync(this.journal.directory);if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid?.()||(directory.mode&0o077)!==0)throw new CustodyError('recovery_required');
   fd=openSync(this.path,constants.O_RDONLY|constants.O_NOFOLLOW);privateFile(fd);
   const record=recordSchema.parse(JSON.parse(readFileSync(fd,'utf8')));
   const authority=this.journal.verify(key);
   if(authority.format!==2||!authority.baseline||record.operationId!==authority.baseline.operationId||record.masterGeneration!==authority.baseline.masterGeneration||record.mac!==authority.baseline.recordMac||record.operationId!==expectation.operationId||record.masterGeneration<expectation.minimumMasterGeneration||record.baseline.installationId!==this.journal.installationId||!timingSafeEqual(Buffer.from(record.mac,'hex'),Buffer.from(sign(key,record),'hex')))throw new CustodyError('recovery_required');
   return freeze(record.baseline);
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{if(fd!==undefined){const closing=fd;fd=undefined;try{this.closeFile(closing);}catch{throw new CustodyError('recovery_required');}}}
 }
 create(lease:AuthorityLease,key:Uint8Array,baseline:MasterConsumerBaseline,stores:BaselineValidationStores):MasterConsumerBaseline {
  let fd:number|undefined,created=false;
  try{
   stores.assertStoppedMaintenance();this.journal.assertLease(lease);
   const inspection=this.journal.inspectRecovery(key,lease.operationId,{requiredAuthority:'file'});let current=inspection.committed;
   if(inspection.staged||current.phase!=='file_authoritative'||current.baseline?.phase==='established')throw new CustodyError('conflict');
   const selected=baselineSchema.parse(baseline);if(selected.installationId!==this.journal.installationId)throw new CustodyError('invalid_input');
   validateMasterConsumers({...stores,masterKey:key,baseline:selected});
   this.journal.assertLease(lease);
   const unsigned={format:1 as const,operationId:lease.operationId,masterGeneration:current.baseline?.masterGeneration??current.generation,baseline:selected},record={...unsigned,mac:sign(key,unsigned)},bytes=JSON.stringify(record)+'\n';
   if(Buffer.byteLength(bytes)>1048576)throw new CustodyError('invalid_input');
   if(current.format===1)current=this.journal.beginBaseline(lease,key,current.generation,record.mac);
   else if(current.baseline?.recordMac!==record.mac||current.baseline.operationId!==lease.operationId)throw new CustodyError('conflict');
   try{fd=openSync(this.path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new CustodyError('conflict');throw error;}
   created=true;privateFile(fd);writeFileSync(fd,bytes);fsyncSync(fd);this.fault?.('file_fsynced');const closing=fd;fd=undefined;this.closeFile(closing);
   const directory=openSync(this.journal.directory,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(directory);}finally{closeSync(directory);}this.fault?.('directory_fsynced');
   stores.assertStoppedMaintenance();this.journal.assertLease(lease);
   if(JSON.stringify(this.journal.verify(key,{requiredAuthority:'file'}))!==JSON.stringify(current))throw new CustodyError('conflict');
   validateMasterConsumers({...stores,masterKey:key,baseline:selected});
   const expectation={operationId:lease.operationId,minimumMasterGeneration:unsigned.masterGeneration};this.read(key,expectation);
   this.journal.establishBaseline(lease,key,current.generation);stores.assertStoppedMaintenance();this.journal.assertLease(lease);
   return this.read(key,expectation);
  }catch(error){if(created)throw new CustodyError('outcome_unknown');if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{if(fd!==undefined){const closing=fd;fd=undefined;try{this.closeFile(closing);}catch{throw new CustodyError(created?'outcome_unknown':'recovery_required');}}}
 }
 /** Lost-result reconciliation never receives fresh selected baseline data.
  * Reauthenticate exact intent/readback, sync retained file+directory, validate
  * current consumers, then establish once; an established missing file fails. */
 resume(lease:AuthorityLease,key:Uint8Array,stores:BaselineValidationStores):MasterConsumerBaseline {
  let establishing=false;
  try{
   stores.assertStoppedMaintenance();this.journal.assertLease(lease);
   const inspection=this.journal.inspectRecovery(key,lease.operationId,{requiredAuthority:'file'}),current=inspection.committed;
   if(inspection.staged||current.format!==2||!current.baseline||current.phase!=='file_authoritative')throw new CustodyError('recovery_required');
   const baseline=this.read(key,{operationId:lease.operationId,minimumMasterGeneration:current.baseline.masterGeneration});
   const fd=openSync(this.path,constants.O_RDONLY|constants.O_NOFOLLOW);try{privateFile(fd);fsyncSync(fd);}finally{this.closeFile(fd);}
   const directory=openSync(this.journal.directory,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(directory);}finally{closeSync(directory);}
   this.read(key,{operationId:lease.operationId,minimumMasterGeneration:current.baseline.masterGeneration});
   validateMasterConsumers({...stores,masterKey:key,baseline});this.journal.assertLease(lease);
   if(JSON.stringify(this.journal.verify(key,{requiredAuthority:'file'}))!==JSON.stringify(current))throw new CustodyError('conflict');
   if(current.baseline.phase==='intent'){establishing=true;this.journal.establishBaseline(lease,key,current.generation);}
   stores.assertStoppedMaintenance();this.journal.assertLease(lease);
   return this.read(key,{operationId:lease.operationId,minimumMasterGeneration:current.baseline.masterGeneration});
  }catch(error){if(establishing)throw new CustodyError('outcome_unknown');if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
}
