import {test,expect} from 'bun:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MasterAuthorityJournal,type AuthorityCheckpoint} from './master-authority.js';
import {MasterKeyMigration} from './master-key-migration.js';
import {CustodyError} from './custody-contract.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-master-copy-')),key=randomBytes(32),installationId=randomUUID();
 let stopped=true,item:Uint8Array|undefined,readFault:CustodyError|undefined,writeLost=false,checkpoint:AuthorityCheckpoint|undefined;
 let validationFailure=false,afterRead:(()=>void)|undefined,reads=0,adds=0,validations=0;
 const sources:Uint8Array[]=[],readBuffers:Uint8Array[]=[],writeBuffers:Uint8Array[]=[];
 const journal=new MasterAuthorityJournal(directory,installationId,point=>{if(point===checkpoint)throw Error('synthetic-uncertain-manifest');});
 const lease=journal.acquire(randomUUID());journal.provision(lease,key);
 const installation={assertStoppedMaintenance(){if(!stopped)throw new CustodyError('denied');},
  async readOriginalFile(){const bytes=Uint8Array.from(key);sources.push(bytes);return bytes;},
  async validateExistingState(candidate:Uint8Array){validations++;if(validationFailure)throw Error('synthetic-consumer-secret');if(!Buffer.from(candidate).equals(key))throw new CustodyError('recovery_required');}};
 const native={async read(id:string,options:{interaction:'prohibited'}){reads++;expect(id).toBe(installationId);expect(options).toEqual({interaction:'prohibited'});
  if(readFault)throw readFault;if(!item)throw new CustodyError('missing');const bytes=Uint8Array.from(item);readBuffers.push(bytes);afterRead?.();return bytes;},
  async addMaster(id:string,bytes:Uint8Array,_options:{interaction:'setup'|'prohibited'}){adds++;expect(id).toBe(installationId);if(item)throw new CustodyError('conflict');writeBuffers.push(bytes);item=Uint8Array.from(bytes);if(writeLost)throw new CustodyError('outcome_unknown');}};
 const migration=new MasterKeyMigration(journal,installation,native);
 return{directory,key,journal,lease,migration,installation,native,sources,readBuffers,writeBuffers,
  stats:()=>({reads,adds,validations}),item:()=>item,setItem(bytes?:Uint8Array){item?.fill(0);item=bytes;},
  loseMaintenance(){stopped=false;},failRead(code:'locked'|'denied'|'outcome_unknown'){readFault=new CustodyError(code);},
  loseWriteReply(){writeLost=true;},failValidation(){validationFailure=true;},afterRead(callback:()=>void){afterRead=callback;},
  failCheckpoint(point:AuthorityCheckpoint){checkpoint=point;},
  cleanup(){key.fill(0);item?.fill(0);rmSync(directory,{recursive:true});}};
}
const advance=(f:ReturnType<typeof fixture>,generation:number)=>f.migration.advance(f.lease,generation,{interaction:'setup'});
const zero=(bytes:Uint8Array)=>bytes.every(byte=>byte===0);
async function verified(f:ReturnType<typeof fixture>){await f.migration.begin(f.lease,1);await advance(f,2);return advance(f,2);}

test('exact original bytes survive create/readback/fresh validation/cutover with no file retirement',async()=>{
 const f=fixture();try{
  expect((await f.migration.begin(f.lease,1)).phase).toBe('copy_intent');expect(f.stats().adds).toBe(0);
  expect((await advance(f,2)).phase).toBe('copy_intent');expect(Buffer.from(f.item()!).equals(f.key)).toBe(true);
  expect((await advance(f,2)).phase).toBe('keychain_verified');expect((await advance(f,3)).phase).toBe('keychain_authoritative');
  expect(f.stats()).toEqual({reads:3,adds:1,validations:4});expect(f.journal.verify(f.key)).toMatchObject({generation:4,installationId:f.journal.installationId,authority:'keychain'});
  expect(readFileSync(f.journal.path,'utf8')).not.toContain(f.key.toString('hex'));expect([...f.sources,...f.readBuffers,...f.writeBuffers].every(zero)).toBe(true);
  const before=f.sources.length;await expect(advance(f,4)).rejects.toThrow('recovery_required');expect(f.sources.length).toBe(before);
  expect(existsSync(f.journal.lockPath)).toBe(true);expect(f.key.byteLength).toBe(32);expect(f.key.some(byte=>byte!==0)).toBe(true);
 }finally{f.cleanup();}
});
test('lost applied item write reply resumes by readback without another add',async()=>{
 const f=fixture();try{
  await f.migration.begin(f.lease,1);f.loseWriteReply();await expect(advance(f,2)).rejects.toThrow('outcome_unknown');
  expect(f.journal.verify(f.key).phase).toBe('copy_intent');expect((await advance(f,2)).phase).toBe('keychain_verified');expect(f.stats().adds).toBe(1);
 }finally{f.cleanup();}
});
test('missing or different verified bytes cannot regenerate, overwrite or switch authority',async()=>{
 for(const missing of [true,false]){const f=fixture();try{
  await verified(f);f.setItem(missing?undefined:randomBytes(32));await expect(advance(f,3)).rejects.toThrow(missing?'missing':'conflict');
  expect(f.stats().adds).toBe(1);expect(f.journal.verify(f.key)).toMatchObject({authority:'file',phase:'keychain_verified'});expect([...f.sources,...f.readBuffers].every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
test('unavailable initial reads never create or advance; mismatched and short existing items fail closed',async()=>{
 for(const code of ['locked','denied','outcome_unknown','different','short'] as const){const f=fixture();try{
  await f.migration.begin(f.lease,1);if(code==='different')f.setItem(randomBytes(32));else if(code==='short')f.setItem(randomBytes(31));else f.failRead(code);
  await expect(advance(f,2)).rejects.toThrow(code==='different'?'conflict':code==='short'?'recovery_required':code);
  expect(f.stats().adds).toBe(0);expect(f.journal.verify(f.key).generation).toBe(2);
 }finally{f.cleanup();}}
});
test('consumer validation failure before intent, create and cutover retains prior authority and redacts diagnostics',async()=>{
 for(const stage of ['begin','create','cutover'] as const){const f=fixture();try{
  if(stage==='create')await f.migration.begin(f.lease,1);if(stage==='cutover')await verified(f);
  f.failValidation();await expect(stage==='begin'?f.migration.begin(f.lease,1):advance(f,stage==='create'?2:3)).rejects.toThrow(/^recovery_required$/);
  expect(f.journal.verify(f.key).authority).toBe('file');expect(f.stats().adds).toBe(stage==='cutover'?1:0);expect([...f.sources,...f.readBuffers].every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
test('maintenance or journal lease loss after read fences cutover and clears borrowed buffers',async()=>{
 for(const lost of ['maintenance','journal'] as const){const f=fixture();try{
  await verified(f);f.afterRead(()=>{if(lost==='maintenance')f.loseMaintenance();else f.lease.release();});
  await expect(advance(f,3)).rejects.toThrow(lost==='maintenance'?'denied':'conflict');expect(f.journal.verify(f.key).authority).toBe('file');
  expect([...f.sources,...f.readBuffers].every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
test('uncommitted manifest staging blocks further native requests and is preserved',async()=>{
 const f=fixture();try{
  await f.migration.begin(f.lease,1);await advance(f,2);f.failCheckpoint('temp_fsynced');
  await expect(advance(f,2)).rejects.toThrow('outcome_unknown');const before=f.stats().reads;
  await expect(advance(f,2)).rejects.toThrow('recovery_required');expect(f.stats().reads).toBe(before);
  expect(f.journal.inspectRecovery(f.key,f.lease.operationId).staged?.record.phase).toBe('keychain_verified');expect(f.journal.verify(f.key).phase).toBe('copy_intent');
 }finally{f.cleanup();}
});
test('lost committed verification reply resumes from authenticated generation, not by replaying transition',async()=>{
 const f=fixture();try{
  await f.migration.begin(f.lease,1);await advance(f,2);f.failCheckpoint('directory_fsynced');
  await expect(advance(f,2)).rejects.toThrow('outcome_unknown');expect(f.journal.verify(f.key)).toMatchObject({generation:3,phase:'keychain_verified'});
  await expect(advance(f,2)).rejects.toThrow('conflict');expect(f.stats().adds).toBe(1);
  // The fault remains enabled: the cutover also commits but loses its reply.
  await expect(advance(f,3)).rejects.toThrow('outcome_unknown');expect(f.journal.verify(f.key)).toMatchObject({generation:4,authority:'keychain'});
  const reads=f.sources.length;await expect(advance(f,4)).rejects.toThrow('recovery_required');expect(f.sources.length).toBe(reads);
 }finally{f.cleanup();}
});
test('invalid original length or wrong original bytes cannot validate manifest or generate a replacement',async()=>{
 for(const size of [31,32]){const f=fixture();try{
  const buffers:Uint8Array[]=[];const migration=new MasterKeyMigration(f.journal,{...f.installation,async readOriginalFile(){const bytes=randomBytes(size);buffers.push(bytes);return bytes;}},f.native);
  await expect(migration.begin(f.lease,1)).rejects.toThrow('recovery_required');expect(f.journal.verify(f.key).generation).toBe(1);expect(f.stats().adds).toBe(0);expect(buffers.every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
