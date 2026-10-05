import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOwnerStore} from './owner-store.js';
import {AccountAuthorityJournal} from './account-authority.js';
import {AccountPasswordMigration} from './account-password-migration.js';
import {CustodyError,accountPasswordSelector,type AccountCustodyIdentity} from './custody-contract.js';

class SyntheticNative {
 items=new Map<string,Uint8Array>();reads:Uint8Array[]=[];writes:Uint8Array[]=[];
 added=0;readOptions:unknown[]=[];addOptions:unknown[]=[];
 beforeRead:(()=>void|Promise<void>)|undefined;afterAdd:(()=>void|Promise<void>)|undefined;
 async read(id:AccountCustodyIdentity,options:{interaction:'prohibited'}){
  this.readOptions.push(options);await this.beforeRead?.();
  const item=this.items.get(accountPasswordSelector(id).account);if(!item)throw new CustodyError('missing');
  const result=Uint8Array.from(item);this.reads.push(result);return result;
 }
 async addPassword(id:AccountCustodyIdentity,bytes:Uint8Array,options:{interaction:'setup'|'prohibited'}){
  this.added++;this.writes.push(bytes);this.addOptions.push(options);
  const selector=accountPasswordSelector(id).account;if(this.items.has(selector))throw new CustodyError('conflict');
  this.items.set(selector,Uint8Array.from(bytes));await this.afterAdd?.();
 }
 close(){for(const bytes of this.items.values())bytes.fill(0);}
}
function fixture(credential=Buffer.from(JSON.stringify({user:'a@example.test',appPassword:'synthetic-a'}))){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-password-'));
 const options={databasePath:join(directory,'owner.sqlite'),markerPath:join(directory,'marker'),masterKey:randomBytes(32),bootstrapProof:randomBytes(32).toString('hex')};
 const owner=SqliteOwnerStore.provision(options);owner.enroll({proof:options.bootstrapProof,ownerId:'owner'});
 const a=owner.addAccount('owner',{user:'a@example.test',label:'Account A',credential});
 const b=owner.addAccount('owner',{user:'b@example.test',credential:Buffer.from('unrelated-opaque-account')});
 owner.replaceProviderSession('owner',a.id,'photos_web',owner.providerSessionState('owner',a.id,'photos_web'),Buffer.from('synthetic-session'));
 const db=new Database(options.databasePath,{create:false,readwrite:true});db.exec('PRAGMA synchronous=FULL');
 const installationId=JSON.parse(readFileSync(options.markerPath,'utf8')).id as string;
 const journal=AccountAuthorityJournal.provision(db,installationId,options.masterKey,owner),native=new SyntheticNative(),sourceBuffers:Uint8Array[]=[];
 let held=true;
 const migration=new AccountPasswordMigration(journal,{readAccountSecret(ownerId,accountId){const bytes=owner.readAccountSecret(ownerId,accountId);if(bytes)sourceBuffers.push(bytes);return bytes;}},native,{assertHeld(){if(!held)throw new CustodyError('denied');}});
 return{owner,db,options,journal,native,migration,a:a.id,b:b.id,installationId,sourceBuffers,loseLease(){held=false;},
  cleanup(){native.close();journal.close();db.close();owner.close();options.masterKey.fill(0);credential.fill(0);rmSync(directory,{recursive:true});}};
}
function begin(f:ReturnType<typeof fixture>){const operationId=randomUUID(),state=f.migration.begin('owner',f.a,1,operationId);return{state,operationId};}
function staged(f:ReturnType<typeof fixture>,generation=1){return{installationId:f.installationId,ownerId:'owner',accountId:f.a,revision:1,generation};}
const advance=(f:ReturnType<typeof fixture>,epoch:number,operationId:string)=>f.migration.advance('owner',f.a,epoch,operationId,{interaction:'setup'});
const zero=(bytes:Uint8Array)=>bytes.every(byte=>byte===0);

test('password-only copy, fresh verification and fresh cutover preserve installation/account/session state',async()=>{
 const f=fixture();try{
  const marker=readFileSync(f.options.markerPath),metadata=f.owner.account('owner',f.a),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  const {state,operationId}=begin(f);
  expect((await advance(f,state.epoch,operationId)).phase).toBe('copy_intent');
  expect(f.native.added).toBe(1);expect(Buffer.from(f.native.items.values().next().value!).toString()).toBe('synthetic-a');
  const verified=await advance(f,state.epoch,operationId);expect(verified.phase).toBe('keychain_verified');
  const active=await advance(f,verified.epoch,operationId);expect(active.phase).toBe('keychain_authoritative');expect(active.revision).toBe(1);
  expect(f.owner.account('owner',f.a)).toEqual({...metadata,credentialStored:false});
  expect(readFileSync(f.options.markerPath)).toEqual(marker);expect(f.owner.ownerId()).toBe('owner');
  expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  const other=f.owner.readAccountSecret('owner',f.b)!;try{expect(Buffer.from(other).toString()).toBe('unrelated-opaque-account');}finally{other.fill(0);}
  expect(f.native.readOptions).toEqual(Array(3).fill({interaction:'prohibited'}));expect(f.native.addOptions).toEqual([{interaction:'setup'}]);
  expect([...f.sourceBuffers,...f.native.writes,...f.native.reads].every(zero)).toBe(true);
  await expect(advance(f,active.epoch,operationId)).rejects.toThrow('conflict');expect(f.native.added).toBe(1);
 }finally{f.cleanup();}
});
test('lost applied create reply resumes by exact read and never repeats mutation',async()=>{
 const f=fixture();try{
  const {state,operationId}=begin(f);f.native.afterAdd=()=>{throw new CustodyError('outcome_unknown');};
  await expect(advance(f,state.epoch,operationId)).rejects.toThrow('outcome_unknown');expect(f.journal.read('owner',f.a)).toEqual(state);
  f.native.afterAdd=undefined;const verified=await advance(f,state.epoch,operationId);expect(verified.phase).toBe('keychain_verified');expect(f.native.added).toBe(1);
  expect((await advance(f,verified.epoch,operationId)).phase).toBe('keychain_authoritative');
 }finally{f.cleanup();}
});
test('unexpected maintenance diagnostics are redacted before intent or native access',async()=>{
 const f=fixture();try{
  const blocked=new AccountPasswordMigration(f.journal,f.owner,f.native,{assertHeld(){throw Error('synthetic-secret-diagnostic');}});
  expect(()=>blocked.begin('owner',f.a,1,randomUUID())).toThrow(/^recovery_required$/);
  await expect(blocked.advance('owner',f.a,1,randomUUID(),{interaction:'prohibited'})).rejects.toThrow(/^recovery_required$/);
  expect(f.journal.read('owner',f.a).epoch).toBe(1);expect(f.native.added).toBe(0);expect(f.native.readOptions).toHaveLength(0);
 }finally{f.cleanup();}
});
test('reopened coordinator resumes intent from readback; cancellation fences a late native read',async()=>{
 const f=fixture();let reopened:AccountAuthorityJournal|undefined;try{
  const {state,operationId}=begin(f);await advance(f,state.epoch,operationId);f.journal.close();
  reopened=AccountAuthorityJournal.open(f.db,f.installationId,f.options.masterKey,f.owner);
  const resumed=new AccountPasswordMigration(reopened,f.owner,f.native,{assertHeld(){}});
  const verified=await resumed.advance('owner',f.a,state.epoch,operationId,{interaction:'prohibited'});
  expect(verified.phase).toBe('keychain_verified');expect(f.native.added).toBe(1);
  const journal=reopened;f.native.beforeRead=()=>{journal.cancelCopy('owner',f.a,verified.epoch,operationId);};
  await expect(resumed.advance('owner',f.a,verified.epoch,operationId,{interaction:'prohibited'})).rejects.toThrow('conflict');
  expect(journal.read('owner',f.a).phase).toBe('sqlite_authoritative');
  expect(journal.listCleanup('owner',f.a)[0]).toMatchObject({revision:1,generation:1});expect(f.native.items.size).toBe(1);
  expect(f.native.reads.every(zero)).toBe(true);
 }finally{reopened?.close();f.cleanup();}
});
test('different existing value conflicts without replacement; wrong generation cannot satisfy the intent',async()=>{
 const f=fixture();try{
  const {state,operationId}=begin(f);const key=accountPasswordSelector(staged(f)).account;
  f.native.items.set(key,Buffer.from('foreign-synthetic'));
  await expect(advance(f,state.epoch,operationId)).rejects.toThrow('conflict');expect(f.native.added).toBe(0);expect(f.journal.read('owner',f.a)).toEqual(state);
  expect(Buffer.from(f.native.items.get(key)!).toString()).toBe('foreign-synthetic');
  f.native.items.get(key)!.fill(0);f.native.items.delete(key);f.native.items.set(accountPasswordSelector(staged(f,2)).account,Buffer.from('synthetic-a'));
  expect((await advance(f,state.epoch,operationId)).phase).toBe('copy_intent');expect(f.native.added).toBe(1);
 }finally{f.cleanup();}
});
test('verified-item loss or replacement cannot recreate it or discard SQLite ciphertext',async()=>{
 const f=fixture();try{
  const {state,operationId}=begin(f);await advance(f,state.epoch,operationId);const verified=await advance(f,state.epoch,operationId);
  const key=accountPasswordSelector(staged(f)).account;f.native.items.get(key)!.fill(0);f.native.items.delete(key);
  await expect(advance(f,verified.epoch,operationId)).rejects.toThrow('missing');expect(f.native.added).toBe(1);
  f.native.items.set(key,Buffer.from('different'));await expect(advance(f,verified.epoch,operationId)).rejects.toThrow('conflict');
  expect(f.journal.read('owner',f.a)).toEqual(verified);expect(f.db.query('SELECT secret FROM mail_accounts WHERE id=?').get(f.a)).not.toEqual({secret:null});
 }finally{f.cleanup();}
});
test('locked/denied/unknown reads and native diagnostics fail redacted without creating or switching',async()=>{
 for(const code of ['locked','denied','outcome_unknown','unknown'] as const){const f=fixture();try{
  const {state,operationId}=begin(f);f.native.beforeRead=()=>{throw code==='unknown'?Error('synthetic-secret-diagnostic'):new CustodyError(code);};
  await expect(advance(f,state.epoch,operationId)).rejects.toThrow(new RegExp('^'+(code==='unknown'?'recovery_required':code)+'$'));
  expect(f.native.added).toBe(0);expect(f.journal.read('owner',f.a)).toEqual(state);expect(f.sourceBuffers.every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
test('revocation during read fences late success; revocation during add retains exact orphan cleanup',async()=>{
 for(const moment of ['read','add'] as const){const f=fixture();try{
  const {state,operationId}=begin(f),revoke=()=>{f.journal.revoke('owner',f.a,state.epoch,randomUUID());};
  if(moment==='read'){f.native.items.set(accountPasswordSelector(staged(f)).account,Buffer.from('synthetic-a'));f.native.beforeRead=revoke;}else f.native.afterAdd=revoke;
  await expect(advance(f,state.epoch,operationId)).rejects.toThrow('conflict');expect(f.journal.read('owner',f.a).phase).toBe('revoked');
  expect(f.journal.listCleanup('owner',f.a)[0]).toMatchObject({revision:1,generation:1});
  expect(f.native.items.size).toBe(1);expect([...f.sourceBuffers,...f.native.writes,...f.native.reads].every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
test('legacy rotation and lost maintenance fence late readbacks and preserve recovery evidence',async()=>{
 for(const action of ['rotate','lease'] as const){const f=fixture();try{
  const {state,operationId}=begin(f);f.native.items.set(accountPasswordSelector(staged(f)).account,Buffer.from('synthetic-a'));
  f.native.beforeRead=()=>{if(action==='rotate')f.owner.rotateAccountSecret('owner',f.a,Buffer.from(JSON.stringify({user:'a@example.test',appPassword:'synthetic-new'})));else f.loseLease();};
  await expect(advance(f,state.epoch,operationId)).rejects.toThrow(action==='rotate'?'conflict':'denied');
  expect(f.native.added).toBe(0);expect([...f.sourceBuffers,...f.native.reads].every(zero)).toBe(true);
 }finally{f.cleanup();}}
});
test('opaque, mismatched-user, malformed UTF-8/Unicode and extra fields require remediation before intent',()=>{
 for(const raw of [Buffer.from('opaque'),Buffer.from(JSON.stringify({user:'b@example.test',appPassword:'synthetic'})),
  Buffer.from(JSON.stringify({user:'a@example.test',appPassword:'\ud800'})),Buffer.from('{"user":"a@example.test","appPassword":"synthetic","extra":1}'),Buffer.from([0xff])]){
  const f=fixture(raw);try{expect(()=>begin(f)).toThrow(/^recovery_required$/);expect(f.journal.read('owner',f.a).epoch).toBe(1);expect(f.native.added).toBe(0);expect(f.sourceBuffers.every(zero)).toBe(true);}finally{f.cleanup();}
 }
});
