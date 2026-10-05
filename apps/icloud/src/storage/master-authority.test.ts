import {test,expect} from 'bun:test';
import {chmodSync,copyFileSync,existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {accountPasswordSelector,masterKeySelector} from './custody-contract.js';
import {AuthorityLease,MasterAuthorityJournal} from './master-authority.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-k1-')),installationId=randomUUID(),key=randomBytes(32);
 const journal=new MasterAuthorityJournal(directory,installationId);
 return{directory,installationId,key,journal,operationId:randomUUID(),cleanup(){key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}
function provision(f:ReturnType<typeof fixture>){const lease=f.journal.acquire(f.operationId);try{return f.journal.provision(lease,f.key);}finally{lease.release();}}

test('exact selectors isolate installation, account, owner, revision and item generation',()=>{
 const a={installationId:randomUUID(),ownerId:'owner',accountId:randomUUID(),revision:1,generation:1};
 const first=accountPasswordSelector(a);
 expect(masterKeySelector(a.installationId)).not.toEqual(first);
 for(const changed of [{installationId:randomUUID()},{ownerId:'owner-2'},{accountId:randomUUID()},{revision:2},{generation:2}])expect(accountPasswordSelector({...a,...changed})).not.toEqual(first);
 expect(masterKeySelector(randomUUID())).not.toEqual(masterKeySelector(a.installationId));
 expect(()=>accountPasswordSelector({...a,generation:0})).toThrow('invalid_input');
 expect(()=>accountPasswordSelector({...a,extra:'synthetic-password'} as any)).toThrow(/^invalid_input$/);
 expect(()=>masterKeySelector('unknown-installation')).toThrow(/^invalid_input$/);
});
test('ordinary discovery never provisions missing state; original key verifies installation-bound metadata',()=>{
 const f=fixture();try{
  expect(()=>f.journal.discover()).toThrow('missing');expect(existsSync(f.journal.path)).toBe(false);
  const first=provision(f);expect(first.phase).toBe('file_authoritative');expect(first.authority).toBe('file');
  const reopened=new MasterAuthorityJournal(f.directory,f.installationId);
  expect(reopened.verify(f.key)).toEqual(first);
  expect(()=>reopened.verify(randomBytes(32))).toThrow('recovery_required');
  expect(()=>new MasterAuthorityJournal(f.directory,randomUUID()).discover()).toThrow('recovery_required');
  const serialized=readFileSync(f.journal.path,'utf8');expect(serialized.includes(f.key.toString('hex'))).toBe(false);
  const lease=f.journal.acquire(randomUUID());try{expect(()=>f.journal.provision(lease,f.key)).toThrow('conflict');}finally{lease.release();}
 }finally{f.cleanup();}
});
test('authenticated phase/CAS changes preserve exact identity and disallow skipped/reversed cutover',()=>{
 const f=fixture();try{
  provision(f);const lease=f.journal.acquire(f.operationId);
  try{
   expect(()=>f.journal.advance(lease,f.key,1,'keychain_authoritative')).toThrow('conflict');
   let current=f.journal.advance(lease,f.key,1,'copy_intent');expect(current.authority).toBe('file');
   expect(()=>f.journal.advance(lease,f.key,1,'copy_intent')).toThrow('conflict');
   current=f.journal.advance(lease,f.key,2,'keychain_verified');expect(current.authority).toBe('file');
   current=f.journal.advance(lease,f.key,3,'keychain_authoritative');expect(current.authority).toBe('keychain');
   expect(()=>f.journal.advance(lease,f.key,4,'file_authoritative')).toThrow('conflict');
   current=f.journal.advance(lease,f.key,4,'file_cleanup_pending');
   current=f.journal.advance(lease,f.key,5,'complete');
   expect(current.installationId).toBe(f.installationId);expect(current.operationId).toBe(f.operationId);
   expect(current.generation).toBe(6);expect(current.authority).toBe('keychain');
  }finally{lease.release();}
  expect(f.journal.verify(f.key).authority).toBe('keychain');
 }finally{f.cleanup();}
});
test('unauthenticated edits to authority fields cannot verify with the original key',()=>{
 const f=fixture();try{
  provision(f);const lease=f.journal.acquire(f.operationId);
  try{f.journal.advance(lease,f.key,1,'copy_intent');f.journal.advance(lease,f.key,2,'keychain_verified');f.journal.advance(lease,f.key,3,'keychain_authoritative');}finally{lease.release();}
  const record=JSON.parse(readFileSync(f.journal.path,'utf8'));
  record.authority='file';record.phase='copy_intent';writeFileSync(f.journal.path,JSON.stringify(record));
  // Discover is intentionally untrusted; no consumer may act on this alone.
  expect(f.journal.discover().authority).toBe('file');expect(()=>f.journal.verify(f.key)).toThrow('recovery_required');
  record.password='synthetic-secret';writeFileSync(f.journal.path,JSON.stringify(record));
  expect(()=>f.journal.discover()).toThrow(/^recovery_required$/);
 }finally{f.cleanup();}
});
test('independently selected backend and generation reject a valid older snapshot before custody lookup',()=>{
 const f=fixture();try{
  provision(f);const old=readFileSync(f.journal.path);
  const lease=f.journal.acquire(f.operationId);try{f.journal.advance(lease,f.key,1,'copy_intent');f.journal.advance(lease,f.key,2,'keychain_verified');f.journal.advance(lease,f.key,3,'keychain_authoritative');}finally{lease.release();}
  expect(f.journal.verify(f.key,{requiredAuthority:'keychain',minimumGeneration:4}).authority).toBe('keychain');
  writeFileSync(f.journal.path,old);
  // A valid full snapshot still has a valid MAC; independent startup policy is
  // necessary. No claim of protection if that policy is rolled back as well.
  expect(f.journal.verify(f.key).authority).toBe('file');
  expect(()=>f.journal.discover({requiredAuthority:'keychain'})).toThrow('recovery_required');
  expect(()=>f.journal.discover({minimumGeneration:4})).toThrow('recovery_required');
 }finally{f.cleanup();}
});
test('an independent process cannot write while a live installation lease is held',async()=>{
 const f=fixture();try{
  provision(f);const lease=f.journal.acquire(f.operationId);
  try{
   const child=Bun.spawn([process.execPath,join(import.meta.dir,'master-authority.worker.ts')],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
   child.stdin.write(JSON.stringify({directory:f.directory,installationId:f.installationId,operationId:randomUUID(),key:f.key.toString('hex'),checkpoint:'renamed'}));child.stdin.end();
   expect(await child.exited).toBe(74);expect(JSON.parse(await new Response(child.stdout).text())).toEqual({code:'conflict'});
   expect(f.journal.verify(f.key).generation).toBe(1);
  }finally{lease.release();}
 }finally{f.cleanup();}
});
test('existing, incomplete, foreign-operation and stale leases cannot acquire or mutate',()=>{
 const f=fixture();try{
  provision(f);const lease=f.journal.acquire(f.operationId),other=new MasterAuthorityJournal(f.directory,f.installationId);
  expect(()=>other.acquire(f.operationId)).toThrow('conflict');
  expect(()=>other.advance(lease,f.key,1,'copy_intent')).toThrow('conflict');
  const forged=new AuthorityLease(other,f.operationId,undefined as any,lease.inode,lease.device);
  expect(()=>other.advance(forged,f.key,1,'copy_intent')).toThrow('conflict');
  lease.release();expect(()=>f.journal.advance(lease,f.key,1,'copy_intent')).toThrow('conflict');
  const replacement=f.journal.acquire(f.operationId);
  try{expect(()=>lease.release()).toThrow('conflict');f.journal.advance(replacement,f.key,1,'copy_intent');}finally{replacement.release();}
  const foreign=f.journal.acquire(randomUUID());try{expect(()=>f.journal.advance(foreign,f.key,2,'keychain_verified')).toThrow('conflict');}finally{foreign.release();}
  mkdirSync(f.journal.lockPath,{mode:0o700});
  expect(()=>other.acquire(randomUUID())).toThrow('conflict');expect(existsSync(f.journal.lockPath)).toBe(true);
 }finally{f.cleanup();}
});
test('recovery-required retains the current authority and cannot reopen ordinary migration',()=>{
 const f=fixture();try{
  provision(f);const lease=f.journal.acquire(f.operationId);
  try{const record=f.journal.advance(lease,f.key,1,'recovery_required');expect(record.authority).toBe('file');expect(()=>f.journal.advance(lease,f.key,2,'copy_intent')).toThrow('conflict');}finally{lease.release();}
 }finally{f.cleanup();}
});
for(const checkpoint of ['temp_fsynced','renamed','directory_fsynced'] as const){
 test(`successful/unknown write reconciliation at ${checkpoint} rejects a blind stale retry`,()=>{
  const f=fixture();try{
   provision(f);let interrupt=true;
   const journal=new MasterAuthorityJournal(f.directory,f.installationId,point=>{if(point===checkpoint&&interrupt){interrupt=false;throw Error('synthetic-lost-reply');}});
   const lease=journal.acquire(f.operationId);
   try{
    expect(()=>journal.advance(lease,f.key,1,'copy_intent')).toThrow(/^outcome_unknown$/);
    const actual=journal.verify(f.key);
    if(checkpoint==='temp_fsynced'){
     expect(actual.generation).toBe(1);expect(actual.phase).toBe('file_authoritative');
     expect(readdirSync(f.directory).some(name=>name.endsWith('.pending'))).toBe(true);
     expect(()=>journal.advance(lease,f.key,1,'copy_intent')).toThrow('recovery_required');
     expect(()=>new MasterAuthorityJournal(f.directory,f.installationId).acquire(randomUUID())).toThrow('recovery_required');
    }else{
     expect(actual.generation).toBe(2);expect(actual.phase).toBe('copy_intent');
     expect(()=>journal.advance(lease,f.key,1,'copy_intent')).toThrow('conflict');
     expect(journal.advance(lease,f.key,actual.generation,'keychain_verified').phase).toBe('keychain_verified');
    }
   }finally{lease.release();}
  }finally{f.cleanup();}
 });
 test(`process death at ${checkpoint} preserves a readable atomic record and retained lock`,async()=>{
  const f=fixture();try{
   provision(f);
   const child=Bun.spawn([process.execPath,join(import.meta.dir,'master-authority.worker.ts')],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
   child.stdin.write(JSON.stringify({directory:f.directory,installationId:f.installationId,operationId:f.operationId,key:f.key.toString('hex'),checkpoint}));child.stdin.end();
   expect(await child.exited).toBe(73);
   const reopened=new MasterAuthorityJournal(f.directory,f.installationId),actual=reopened.verify(f.key);
   expect(actual.generation).toBe(checkpoint==='temp_fsynced'?1:2);
   expect(()=>reopened.acquire(f.operationId)).toThrow(checkpoint==='temp_fsynced'?'recovery_required':'conflict');
   expect(existsSync(reopened.lockPath)).toBe(true);
   const before=readFileSync(reopened.path),files=readdirSync(f.directory).sort();
   const inspection=reopened.inspectRecovery(f.key,f.operationId);
   expect(inspection.committed).toEqual(actual);expect(inspection.nextAction).toBe('external_stop_then_reconcile');
   expect(inspection.staged!==null).toBe(checkpoint==='temp_fsynced');
   expect(readFileSync(reopened.path)).toEqual(before);expect(readdirSync(f.directory).sort()).toEqual(files);
   expect(()=>reopened.acquire(f.operationId)).toThrow(checkpoint==='temp_fsynced'?'recovery_required':'conflict');
  }finally{f.cleanup();}
 });
}
test('missing/corrupt manifest, wrong modes and symlinks fail closed without replacing foreign paths',()=>{
 const f=fixture();try{
  provision(f);chmodSync(f.journal.path,0o644);expect(()=>f.journal.discover()).toThrow('recovery_required');chmodSync(f.journal.path,0o600);
  writeFileSync(f.journal.path,'{malformed');expect(()=>f.journal.discover()).toThrow('recovery_required');
  rmSync(f.journal.path);expect(()=>f.journal.verify(f.key)).toThrow('missing');
  const foreign=join(f.directory,'foreign');writeFileSync(foreign,'foreign-owned-evidence',{mode:0o600});
  symlinkSync(foreign,f.journal.path);expect(()=>f.journal.discover()).toThrow('recovery_required');
  const lease=f.journal.acquire(f.operationId);try{expect(()=>f.journal.provision(lease,f.key)).toThrow('conflict');}finally{lease.release();}
  expect(readFileSync(foreign,'utf8')).toBe('foreign-owned-evidence');
  rmSync(f.journal.path);symlinkSync(join(f.directory,'does-not-exist'),f.journal.path);
  const broken=f.journal.acquire(f.operationId);try{expect(()=>f.journal.provision(broken,f.key)).toThrow('conflict');}finally{broken.release();}
  const linked=join(f.directory,'linked-directory');symlinkSync(f.directory,linked);expect(()=>new MasterAuthorityJournal(linked,f.installationId)).toThrow('recovery_required');
 }finally{f.cleanup();}
});
test('recovery inspection is read-only and never converts a live lock into a lease',()=>{
 const f=fixture();try{
  const baseline=provision(f);
  expect(f.journal.inspectRecovery(f.key,f.operationId)).toMatchObject({committed:baseline,lock:null,staged:null,nextAction:'ordinary_acquire'});
  const lease=f.journal.acquire(f.operationId);
  try{
   const other=new MasterAuthorityJournal(f.directory,f.installationId),before=readFileSync(f.journal.path);
   expect(other.inspectRecovery(f.key,f.operationId).nextAction).toBe('external_stop_then_reconcile');
   expect(()=>other.acquire(f.operationId)).toThrow('conflict');
   expect(()=>other.inspectRecovery(f.key,randomUUID())).toThrow('conflict');
   expect(()=>other.inspectRecovery(randomBytes(32),f.operationId)).toThrow('recovery_required');
   expect(readFileSync(f.journal.path)).toEqual(before);
   f.journal.advance(lease,f.key,1,'recovery_required');
   expect(other.inspectRecovery(f.key,f.operationId).nextAction).toBe('protected_recovery');
  }finally{lease.release();}
 }finally{f.cleanup();}
});
test('uncommitted Keychain cutover is evidence requiring fresh validation, never authoritative promotion',()=>{
 const f=fixture();try{
  provision(f);let interrupt=false;
  const journal=new MasterAuthorityJournal(f.directory,f.installationId,point=>{if(interrupt&&point==='temp_fsynced')throw Error('synthetic-interruption');});
  const lease=journal.acquire(f.operationId);
  try{
   journal.advance(lease,f.key,1,'copy_intent');journal.advance(lease,f.key,2,'keychain_verified');interrupt=true;
   expect(()=>journal.advance(lease,f.key,3,'keychain_authoritative')).toThrow('outcome_unknown');
   const before=readFileSync(journal.path),inspection=journal.inspectRecovery(f.key,f.operationId,{requiredAuthority:'file',minimumGeneration:3});
   expect(inspection.committed.authority).toBe('file');expect(inspection.staged!.record.authority).toBe('keychain');
   expect(inspection.staged!.record.generation).toBe(4);expect(readFileSync(journal.path)).toEqual(before);
   expect(()=>journal.inspectRecovery(f.key,f.operationId,{requiredAuthority:'keychain'})).toThrow('recovery_required');
   // A valid staging record cannot replace lost authoritative metadata.
   rmSync(journal.path);expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('missing');
   expect(existsSync(join(f.directory,inspection.staged!.name))).toBe(true);
  }finally{lease.release();}
 }finally{f.cleanup();}
});
test('unknown, duplicate, corrupt, unowned or unbound staging and incomplete locks preserve evidence',()=>{
 const f=fixture();try{
  provision(f);
  const journal=new MasterAuthorityJournal(f.directory,f.installationId,point=>{if(point==='temp_fsynced')throw Error('synthetic-interruption');});
  const lease=journal.acquire(f.operationId);
  try{
   expect(()=>journal.advance(lease,f.key,1,'copy_intent')).toThrow('outcome_unknown');
   const name=readdirSync(f.directory).find(name=>name.endsWith('.pending'))!,path=join(f.directory,name),original=readFileSync(path);
   const duplicate=join(f.directory,`.master-authority.${f.operationId}.${randomUUID()}.pending`);copyFileSync(path,duplicate);
   expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('recovery_required');expect(existsSync(duplicate)).toBe(true);rmSync(duplicate);
   const bad=JSON.parse(original.toString());bad.generation=8;writeFileSync(path,JSON.stringify(bad));
   expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('recovery_required');expect(readFileSync(path,'utf8')).toBe(JSON.stringify(bad));
   writeFileSync(path,original);chmodSync(path,0o644);expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('recovery_required');chmodSync(path,0o600);
   const foreign=join(f.directory,'foreign-staging');writeFileSync(foreign,original,{mode:0o600});rmSync(path);symlinkSync(foreign,path);
   expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('recovery_required');expect(readFileSync(foreign)).toEqual(original);
   rmSync(path);writeFileSync(path,original,{mode:0o600});
  }finally{lease.release();}
  expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('recovery_required');
  mkdirSync(journal.lockPath,{mode:0o700});expect(()=>journal.inspectRecovery(f.key,f.operationId)).toThrow('recovery_required');
  expect(readdirSync(journal.lockPath)).toEqual([]);
 }finally{f.cleanup();}
});
