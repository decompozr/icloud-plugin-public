import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOwnerStore} from './owner-store.js';
import {AccountAuthorityJournal} from './account-authority.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-account-'));
 const options={databasePath:join(directory,'owner.sqlite'),markerPath:join(directory,'marker'),masterKey:randomBytes(32),bootstrapProof:randomBytes(32).toString('hex')};
 const owner=SqliteOwnerStore.provision(options);owner.enroll({proof:options.bootstrapProof,ownerId:'owner'});
 const a=owner.addAccount('owner',{user:'a@example.test',label:'Account A',credential:Buffer.from(JSON.stringify({user:'a@example.test',appPassword:'synthetic-a'}))});
 const b=owner.addAccount('owner',{user:'b@example.test',credential:Buffer.from(JSON.stringify({user:'b@example.test',appPassword:'synthetic-b'}))});
 owner.replaceProviderSession('owner',a.id,'photos_web',owner.providerSessionState('owner',a.id,'photos_web'),Buffer.from('synthetic-photos-session'));
 const db=new Database(options.databasePath,{create:false,readwrite:true});db.exec('PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000');
 const installationId=(JSON.parse(readFileSync(options.markerPath,'utf8')) as {id:string}).id;
 const journal=AccountAuthorityJournal.provision(db,installationId,options.masterKey,owner);
 return{directory,options,owner,db,journal,installationId,a:a.id,b:b.id,
  cleanup(){journal.close();db.close();owner.close();options.masterKey.fill(0);rmSync(directory,{recursive:true,force:true});}};
}
function verified(f:ReturnType<typeof fixture>){
 let state=f.journal.read('owner',f.a),operationId=randomUUID();
 state=f.journal.beginCopy('owner',f.a,state.epoch,operationId);state=f.journal.markVerified('owner',f.a,state.epoch,operationId);
 return{state,operationId};
}
test('ordinary open never creates missing schema; explicit baseline and revoked registry records persist',()=>{
 const f=fixture();try{
  expect(()=>f.journal.read('owner',randomUUID())).toThrow('missing');
  const baseline=f.journal.read('owner',f.a);expect(baseline.authority).toBe('sqlite');
  f.owner.revokeAccountSecret('owner',f.b);expect(f.journal.reconcileSqliteMutation('owner',f.b,1).phase).toBe('revoked');
  const reopened=AccountAuthorityJournal.open(f.db,f.installationId,f.options.masterKey,f.owner);
  try{expect(reopened.read('owner',f.a)).toEqual(baseline);expect(()=>reopened.read('foreign-owner',f.a)).toThrow('denied');}finally{reopened.close();}
  expect(()=>AccountAuthorityJournal.provision(f.db,f.installationId,f.options.masterKey,f.owner)).toThrow('conflict');
  const separate=new Database(':memory:');try{
   separate.exec('CREATE TABLE owner_state(singleton INTEGER,install TEXT,owner TEXT)');separate.query('INSERT INTO owner_state VALUES(1,?,?)').run(f.installationId,'owner');
   expect(()=>AccountAuthorityJournal.open(separate,f.installationId,f.options.masterKey,f.owner)).toThrow('recovery_required');
   expect(separate.query("SELECT name FROM sqlite_master WHERE name='account_custody_state'").get()).toBeNull();
  }finally{separate.close();}
 }finally{f.cleanup();}
});
test('cutover commits pointer and ciphertext removal without changing registry identity/revision or Photos sessions',()=>{
 const f=fixture();try{
  const marker=readFileSync(f.options.markerPath),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  const metadata=f.owner.account('owner',f.a);const {state,operationId}=verified(f);
  const moved=f.journal.activate('owner',f.a,state.epoch,operationId);
  expect(moved.authority).toBe('keychain');expect(moved.revision).toBe(1);expect(moved.epoch).toBeGreaterThan(state.epoch);
  expect(f.db.query('SELECT id,user,label,version,secret FROM mail_accounts WHERE id=?').get(f.a)).toEqual({id:f.a,user:metadata.user,label:metadata.label,version:1,secret:null});
  expect(readFileSync(f.options.markerPath)).toEqual(marker);expect(f.owner.ownerId()).toBe('owner');
  expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  expect(Buffer.from(f.owner.readProviderSession('owner',f.a,'photos_web')!.bytes).toString()).toBe('synthetic-photos-session');
  expect(f.journal.readTarget('owner',f.a,moved.epoch)).toEqual({installationId:f.installationId,ownerId:'owner',accountId:f.a,revision:1,generation:1});
  expect(()=>f.journal.readTarget('owner',f.a,state.epoch)).toThrow('conflict');
  expect(f.owner.readAccountSecret('owner',f.b)).not.toBeNull();
  const persisted=f.db.query('SELECT record FROM account_custody_state').all() as {record:string}[];
  expect(persisted.some(row=>row.record.includes('synthetic-a'))).toBe(false);
  const reopened=AccountAuthorityJournal.open(f.db,f.installationId,f.options.masterKey,f.owner);try{expect(reopened.read('owner',f.a)).toEqual(moved);}finally{reopened.close();}
 }finally{f.cleanup();}
});
test('competing copy operations and lost replies have one CAS winner, never repeat activation',()=>{
 const f=fixture();const otherDb=new Database(f.options.databasePath,{create:false,readwrite:true});otherDb.exec('PRAGMA synchronous=FULL');
 const other=AccountAuthorityJournal.open(otherDb,f.installationId,f.options.masterKey,f.owner);
 try{
  const baseline=f.journal.read('owner',f.a),operationId=randomUUID();
  const intent=f.journal.beginCopy('owner',f.a,baseline.epoch,operationId);
  expect(()=>other.beginCopy('owner',f.a,baseline.epoch,randomUUID())).toThrow('conflict');
  expect(()=>other.markVerified('owner',f.a,intent.epoch,randomUUID())).toThrow('conflict');
  const checked=other.markVerified('owner',f.a,intent.epoch,operationId),committed=other.activate('owner',f.a,checked.epoch,operationId);
  // Simulate caller losing the committed reply: authoritative readback precedes
  // any decision; a retry carrying the old epoch cannot repeat the transition.
  expect(f.journal.read('owner',f.a)).toEqual(committed);
  expect(()=>f.journal.activate('owner',f.a,checked.epoch,operationId)).toThrow('conflict');
 }finally{other.close();otherDb.close();f.cleanup();}
});
test('competing legacy rotation cancels stale copy and retains exact orphan cleanup without generation reuse',()=>{
 const f=fixture();try{
  const baseline=f.journal.read('owner',f.a),operationId=randomUUID();
  const intent=f.journal.beginCopy('owner',f.a,baseline.epoch,operationId);
  f.owner.rotateAccountSecret('owner',f.a,Buffer.from('synthetic-replacement'));
  expect(()=>f.journal.markVerified('owner',f.a,intent.epoch,operationId)).toThrow('conflict');
  const updated=f.journal.reconcileSqliteMutation('owner',f.a,intent.epoch);
  expect(updated.revision).toBe(2);expect(updated.authority).toBe('sqlite');expect(updated.nextGeneration).toBe(2);
  const cleanup=f.journal.listCleanup('owner',f.a);expect(cleanup).toHaveLength(1);
  expect(cleanup[0]).toMatchObject({revision:1,generation:1,operationId,accountId:f.a});
  const next=f.journal.beginCopy('owner',f.a,updated.epoch,randomUUID());expect(next.stagedGeneration).toBe(2);
  f.journal.acknowledgeCleanup('owner',f.a,cleanup[0]!);expect(f.journal.listCleanup('owner',f.a)).toHaveLength(0);
  expect(()=>f.journal.acknowledgeCleanup('owner',f.a,cleanup[0]!)).toThrow('conflict');
 }finally{f.cleanup();}
});
test('revocation atomically advances registry revision, invalidates sessions and tombstones custody before item cleanup',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f),active=f.journal.activate('owner',f.a,state.epoch,operationId),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  const revokeId=randomUUID(),revoked=f.journal.revoke('owner',f.a,active.epoch,revokeId);
  expect(revoked.phase).toBe('revoked');expect(revoked.revision).toBe(2);expect(revoked.activeGeneration).toBeNull();
  expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual({accountRevision:2,generation:session.generation+1,stored:false});
  expect(()=>f.journal.readTarget('owner',f.a,revoked.epoch)).toThrow('revoked');
  expect(()=>f.journal.activate('owner',f.a,state.epoch,operationId)).toThrow('conflict');
  expect(()=>f.journal.revoke('owner',f.a,active.epoch,revokeId)).toThrow('conflict');
  expect(f.journal.listCleanup('owner',f.a)[0]).toMatchObject({revision:1,generation:1,operationId:revokeId});
  expect(f.owner.readAccountSecret('owner',f.b)).not.toBeNull();
 }finally{f.cleanup();}
});
test('revocation of a pending copy prevents late verification and keeps staging deletion intent',()=>{
 const f=fixture();try{
  const baseline=f.journal.read('owner',f.a),op=randomUUID(),intent=f.journal.beginCopy('owner',f.a,baseline.epoch,op);
  const revoked=f.journal.revoke('owner',f.a,intent.epoch,randomUUID());
  expect(revoked.phase).toBe('revoked');expect(f.journal.listCleanup('owner',f.a)[0]).toMatchObject({revision:1,generation:1});
  expect(()=>f.journal.markVerified('owner',f.a,intent.epoch,op)).toThrow('conflict');
 }finally{f.cleanup();}
});
test('unavailable native custody retains authoritative pointer and revision with no SQLite fallback or revocation',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f),active=f.journal.activate('owner',f.a,state.epoch,operationId);
  const closed=f.journal.markUnavailable('owner',f.a,active.epoch);
  expect(closed.authority).toBe('keychain');expect(closed.activeGeneration).toBe(1);expect(closed.revision).toBe(1);
  expect(()=>f.journal.readTarget('owner',f.a,closed.epoch)).toThrow('recovery_required');
  expect(()=>f.journal.reconcileSqliteMutation('owner',f.a,closed.epoch)).toThrow('conflict');
  expect(f.db.query('SELECT secret FROM mail_accounts WHERE id=?').get(f.a)).toEqual({secret:null});
 }finally{f.cleanup();}
});
test('transaction failure leaves ciphertext, pointer, revision, sessions and cleanup as one prior state',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  f.db.exec("CREATE TRIGGER fail_custody BEFORE UPDATE ON account_custody_state BEGIN SELECT RAISE(ABORT,'synthetic-secret-must-not-escape'); END");
  expect(()=>f.journal.activate('owner',f.a,state.epoch,operationId)).toThrow(/^recovery_required$/);
  expect(f.journal.read('owner',f.a)).toEqual(state);expect(f.owner.readAccountSecret('owner',f.a)).not.toBeNull();
  expect(()=>f.journal.revoke('owner',f.a,state.epoch,randomUUID())).toThrow(/^recovery_required$/);
  expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);expect(f.journal.listCleanup('owner',f.a)).toHaveLength(0);
  f.db.exec('DROP TRIGGER fail_custody');
  f.db.exec("CREATE TRIGGER ignore_registry BEFORE UPDATE ON mail_accounts BEGIN SELECT RAISE(IGNORE); END");
  expect(()=>f.journal.revoke('owner',f.a,state.epoch,randomUUID())).toThrow('conflict');
  expect(f.journal.read('owner',f.a)).toEqual(state);
 }finally{f.cleanup();}
});
test('wrong key, transplanted/tampered pointer or cleanup metadata, and altered account user fail closed',()=>{
 const f=fixture();try{
  f.journal.read('owner',f.a);f.journal.read('owner',f.b);
  const wrong=AccountAuthorityJournal.open(f.db,f.installationId,randomBytes(32),f.owner);try{expect(()=>wrong.read('owner',f.a)).toThrow('recovery_required');}finally{wrong.close();}
  const a=f.db.query('SELECT record FROM account_custody_state WHERE account=?').get(f.a) as {record:string};
  f.db.query('UPDATE account_custody_state SET record=? WHERE account=?').run(a.record,f.b);expect(()=>f.journal.read('owner',f.b)).toThrow('recovery_required');
  const changed=JSON.parse(a.record);changed.nextGeneration=99;
  f.db.query('UPDATE account_custody_state SET record=? WHERE account=?').run(JSON.stringify(changed),f.a);expect(()=>f.journal.read('owner',f.a)).toThrow(/^recovery_required$/);
  f.db.query('UPDATE account_custody_state SET record=? WHERE account=?').run(a.record,f.a);
  const pending=f.journal.beginCopy('owner',f.a,1,randomUUID());f.journal.revoke('owner',f.a,pending.epoch,randomUUID());
  const row=f.db.query('SELECT record FROM account_custody_cleanup').get() as {record:string};const cleanup=JSON.parse(row.record);cleanup.generation=999;
  f.db.query('UPDATE account_custody_cleanup SET generation=999,record=?').run(JSON.stringify(cleanup));expect(()=>f.journal.listCleanup('owner',f.a)).toThrow('recovery_required');
  f.db.query('UPDATE mail_accounts SET user=? WHERE id=?').run('changed@example.test',f.a);expect(()=>f.journal.read('owner',f.a)).toThrow('recovery_required');
 }finally{f.cleanup();}
});
test('unsafe durability settings fail closed without silently changing connection settings',()=>{
 const f=fixture();try{
  f.db.exec('PRAGMA synchronous=OFF');expect(()=>f.journal.read('owner',f.a)).toThrow('recovery_required');
  expect(f.db.query('PRAGMA synchronous').get()).toEqual({synchronous:0});
  f.db.exec('PRAGMA synchronous=FULL; PRAGMA journal_mode=MEMORY');
  expect(f.db.query('PRAGMA journal_mode').get()).toEqual({journal_mode:'memory'});
  expect(()=>f.journal.read('owner',f.a)).toThrow('recovery_required');
  expect(f.db.query('PRAGMA journal_mode').get()).toEqual({journal_mode:'memory'});
 }finally{f.cleanup();}
});
test('missing active pointer cannot be rebaselined or silently interpreted as revocation',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f);f.journal.activate('owner',f.a,state.epoch,operationId);
  f.db.query('DELETE FROM account_custody_state WHERE account=?').run(f.a);
  const reopened=AccountAuthorityJournal.open(f.db,f.installationId,f.options.masterKey,f.owner);
  try{expect(()=>reopened.read('owner',f.a)).toThrow('missing');expect(()=>reopened.readTarget('owner',f.a,4)).toThrow('missing');}finally{reopened.close();}
  expect(()=>AccountAuthorityJournal.provision(f.db,f.installationId,f.options.masterKey,f.owner)).toThrow('conflict');
  expect(f.db.query('SELECT secret FROM mail_accounts WHERE id=?').get(f.a)).toEqual({secret:null});
 }finally{f.cleanup();}
});
test('authentic cleanup from another snapshot cannot authorize removal of a currently referenced item',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f),active=f.journal.activate('owner',f.a,state.epoch,operationId);
  f.journal.revoke('owner',f.a,active.epoch,randomUUID());
  // Deliberately mix authenticated old pointer with newer deletion intent. This
  // is not a consistent backup and must fail before any native deletion.
  f.db.query('UPDATE account_custody_state SET record=? WHERE account=?').run(JSON.stringify(active),f.a);
  f.db.query('UPDATE mail_accounts SET version=1 WHERE id=?').run(f.a);
  expect(()=>f.journal.listCleanup('owner',f.a)).toThrow('recovery_required');
 }finally{f.cleanup();}
});
test('ignored pointer update or session invalidation rolls back the entire mutation',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  f.db.exec('CREATE TRIGGER ignore_pointer BEFORE UPDATE ON account_custody_state BEGIN SELECT RAISE(IGNORE); END');
  expect(()=>f.journal.activate('owner',f.a,state.epoch,operationId)).toThrow('conflict');expect(f.owner.readAccountSecret('owner',f.a)).not.toBeNull();
  f.db.exec('DROP TRIGGER ignore_pointer');
  f.db.exec('CREATE TRIGGER ignore_session BEFORE UPDATE ON provider_sessions BEGIN SELECT RAISE(IGNORE); END');
  expect(()=>f.journal.revoke('owner',f.a,state.epoch,randomUUID())).toThrow('conflict');
  expect(f.journal.read('owner',f.a)).toEqual(state);expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  expect(f.journal.listCleanup('owner',f.a)).toHaveLength(0);
  f.db.exec('DROP TRIGGER ignore_session');
  const active=f.journal.activate('owner',f.a,state.epoch,operationId);
  f.db.exec('CREATE TRIGGER ignore_cleanup BEFORE INSERT ON account_custody_cleanup BEGIN SELECT RAISE(IGNORE); END');
  expect(()=>f.journal.revoke('owner',f.a,active.epoch,randomUUID())).toThrow('conflict');
  expect(f.journal.read('owner',f.a)).toEqual(active);expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  f.db.exec('DROP TRIGGER ignore_cleanup');
  f.journal.revoke('owner',f.a,active.epoch,randomUUID());
  const item=f.journal.listCleanup('owner',f.a)[0]!;
  f.db.exec('CREATE TRIGGER ignore_cleanup_delete BEFORE DELETE ON account_custody_cleanup BEGIN SELECT RAISE(IGNORE); END');
  expect(()=>f.journal.acknowledgeCleanup('owner',f.a,item)).toThrow('conflict');
  expect(f.journal.listCleanup('owner',f.a)).toEqual([item]);
 }finally{f.cleanup();}
});
for(const checkpoint of ['before_commit','after_commit']){
 test(`process death ${checkpoint} preserves the atomic SQLite credential/pointer decision`,async()=>{
  const f=fixture();try{
   const {state,operationId}=verified(f),session=f.owner.providerSessionState('owner',f.a,'photos_web');
   const child=Bun.spawn([process.execPath,join(import.meta.dir,'account-authority.worker.ts')],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
   child.stdin.write(JSON.stringify({databasePath:f.options.databasePath,markerPath:f.options.markerPath,key:f.options.masterKey.toString('hex'),installationId:f.installationId,accountId:f.a,epoch:state.epoch,operationId,checkpoint}));child.stdin.end();
   const exit=await child.exited;
   if(exit!==73)throw Error(`Synthetic worker exited ${exit}: ${await new Response(child.stderr).text()}`);
   expect(exit).toBe(73);
   const reopened=AccountAuthorityJournal.open(f.db,f.installationId,f.options.masterKey,f.owner);
   try{
    const actual=reopened.read('owner',f.a);expect(actual.authority).toBe(checkpoint==='before_commit'?'sqlite':'keychain');
    expect(actual.revision).toBe(1);expect(f.owner.readAccountSecret('owner',f.a)===null).toBe(checkpoint==='after_commit');
    expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
   }finally{reopened.close();}
  }finally{f.cleanup();}
 });
}
for(const phase of ['copy_intent','keychain_verified']){
 test(`cancelling ${phase} retains SQLite authority, identity, sessions and exact cleanup without generation reuse`,()=>{
  const f=fixture();try{
   let state=f.journal.read('owner',f.a);const operationId=randomUUID(),session=f.owner.providerSessionState('owner',f.a,'photos_web');
   state=f.journal.beginCopy('owner',f.a,state.epoch,operationId);
   if(phase==='keychain_verified')state=f.journal.markVerified('owner',f.a,state.epoch,operationId);
   expect(()=>f.journal.cancelCopy('owner',f.a,state.epoch,randomUUID())).toThrow('conflict');
   const cancelled=f.journal.cancelCopy('owner',f.a,state.epoch,operationId);
   expect(cancelled).toMatchObject({authority:'sqlite',phase:'sqlite_authoritative',revision:1,stagedGeneration:null,nextGeneration:2});
   expect(f.owner.readAccountSecret('owner',f.a)).not.toBeNull();expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
   expect(f.journal.listCleanup('owner',f.a)[0]).toMatchObject({revision:1,generation:1,operationId});
   expect(()=>f.journal.markVerified('owner',f.a,state.epoch,operationId)).toThrow('conflict');
   expect(()=>f.journal.activate('owner',f.a,state.epoch,operationId)).toThrow('conflict');
   const again=f.journal.beginCopy('owner',f.a,cancelled.epoch,randomUUID());expect(again.stagedGeneration).toBe(2);
  }finally{f.cleanup();}
 });
}
test('cancellation fails atomically if cleanup cannot be queued; committed native authority cannot cancel',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f);
  f.db.exec('CREATE TRIGGER ignore_cancel_cleanup BEFORE INSERT ON account_custody_cleanup BEGIN SELECT RAISE(IGNORE); END');
  expect(()=>f.journal.cancelCopy('owner',f.a,state.epoch,operationId)).toThrow('conflict');expect(f.journal.read('owner',f.a)).toEqual(state);
  f.db.exec('DROP TRIGGER ignore_cancel_cleanup');
  const active=f.journal.activate('owner',f.a,state.epoch,operationId);
  expect(()=>f.journal.cancelCopy('owner',f.a,active.epoch,operationId)).toThrow('conflict');expect(f.journal.read('owner',f.a)).toEqual(active);
 }finally{f.cleanup();}
});
test('unavailable recovery requires exact fresh identity and epoch, retaining native authority and blocking late recovery after revoke',()=>{
 const f=fixture();try{
  const {state,operationId}=verified(f),active=f.journal.activate('owner',f.a,state.epoch,operationId);
  const identity=f.journal.readTarget('owner',f.a,active.epoch),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  const unavailable=f.journal.markUnavailable('owner',f.a,active.epoch);
  expect(()=>f.journal.restoreAvailable('owner',f.a,unavailable.epoch,{...identity,generation:0})).toThrow(/^invalid_input$/);
  for(const changed of [{installationId:randomUUID()},{ownerId:'foreign'},{accountId:f.b},{revision:2},{generation:2}])expect(()=>f.journal.restoreAvailable('owner',f.a,unavailable.epoch,{...identity,...changed})).toThrow('conflict');
  expect(()=>f.journal.restoreAvailable('owner',f.a,active.epoch,identity)).toThrow('conflict');
  const recovered=f.journal.restoreAvailable('owner',f.a,unavailable.epoch,identity);
  expect(f.journal.readTarget('owner',f.a,recovered.epoch)).toEqual(identity);expect(recovered.revision).toBe(1);
  expect(f.owner.readAccountSecret('owner',f.a)).toBeNull();expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  expect(()=>f.journal.restoreAvailable('owner',f.a,unavailable.epoch,identity)).toThrow('conflict');
  const nextUnavailable=f.journal.markUnavailable('owner',f.a,recovered.epoch);
  const revoked=f.journal.revoke('owner',f.a,nextUnavailable.epoch,randomUUID());
  expect(()=>f.journal.restoreAvailable('owner',f.a,nextUnavailable.epoch,identity)).toThrow('conflict');
  expect(()=>f.journal.restoreAvailable('owner',f.a,revoked.epoch,identity)).toThrow('conflict');
 }finally{f.cleanup();}
});
