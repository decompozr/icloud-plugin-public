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

// Cleanup shares the populated owner/session fixtures, never a live Keychain.
import {AccountPasswordCleanup} from './account-password-cleanup.js';
function cancellation(f:ReturnType<typeof fixture>){
 const {state,operationId}=begin(f);
 f.native.items.set(accountPasswordSelector(staged(f)).account,Buffer.from('synthetic-a'));
 const cancelled=f.journal.cancelCopy('owner',f.a,state.epoch,operationId);
 return {epoch:cancelled.epoch,item:f.journal.listCleanup('owner',f.a)[0]!};
}
test('cleanup deletes exact cancelled generation and requires a separate absence read',async()=>{
 const f=fixture();try{
  const {epoch,item}=cancellation(f),other=accountPasswordSelector({...staged(f),accountId:f.b}).account;
  f.native.items.set(other,Buffer.from('synthetic-b'));let deletes=0;
  const cleanup=new AccountPasswordCleanup(f.journal,{read:f.native.read.bind(f.native),async deletePassword(id,options){expect(options).toEqual({interaction:'prohibited'});deletes++;f.native.items.delete(accountPasswordSelector(id).account);}},{assertHeld(){}});
  expect(await cleanup.advance('owner',f.a,epoch,item)).toBe('pending');expect(f.journal.listCleanup('owner',f.a)).toHaveLength(1);
  expect(await cleanup.advance('owner',f.a,epoch,item)).toBe('complete');expect(deletes).toBe(1);expect(f.native.items.has(other)).toBe(true);
  expect(f.journal.read('owner',f.a).epoch).toBe(epoch);expect(f.journal.listCleanup('owner',f.a)).toHaveLength(0);expect(f.native.reads.every(zero)).toBe(true);
 }finally{f.cleanup();}
});
test('lost applied delete reply retains evidence and resumes by absence without repeated delete',async()=>{
 const f=fixture();try{
  const {epoch,item}=cancellation(f);let deletes=0;
  const cleanup=new AccountPasswordCleanup(f.journal,{read:f.native.read.bind(f.native),async deletePassword(id){deletes++;f.native.items.delete(accountPasswordSelector(id).account);throw new CustodyError('outcome_unknown');}},{assertHeld(){}});
  await expect(cleanup.advance('owner',f.a,epoch,item)).rejects.toThrow('outcome_unknown');expect(f.journal.listCleanup('owner',f.a)).toHaveLength(1);
  expect(await cleanup.advance('owner',f.a,epoch,item)).toBe('complete');expect(deletes).toBe(1);expect(f.native.reads.every(zero)).toBe(true);
 }finally{f.cleanup();}
});
test('cleanup fences concurrent revocation after read and rejects foreign or active selectors',async()=>{
 const f=fixture();try{
  const {epoch,item}=cancellation(f);let deletes=0;
  const cleanup=new AccountPasswordCleanup(f.journal,{read:f.native.read.bind(f.native),async deletePassword(){deletes++;}},{assertHeld(){}});
  await expect(cleanup.advance('owner',f.b,1,item)).rejects.toThrow('conflict');expect(f.native.readOptions).toHaveLength(0);
  f.native.beforeRead=()=>{f.journal.revoke('owner',f.a,epoch,randomUUID());};
  await expect(cleanup.advance('owner',f.a,epoch,item)).rejects.toThrow('conflict');expect(deletes).toBe(0);expect(f.journal.listCleanup('owner',f.a)).toHaveLength(1);expect(f.native.reads.every(zero)).toBe(true);
 }finally{f.cleanup();}
});
test('denied reads or lost maintenance never delete or acknowledge pending cleanup',async()=>{
 const f=fixture();try{
  const {epoch,item}=cancellation(f);let held=true,deletes=0;
  const cleanup=new AccountPasswordCleanup(f.journal,{async read(){throw new CustodyError('denied');},async deletePassword(){deletes++;}},{assertHeld(){if(!held)throw Error('private-diagnostic');}});
  await expect(cleanup.advance('owner',f.a,epoch,item)).rejects.toThrow(/^denied$/);held=false;
  await expect(cleanup.advance('owner',f.a,epoch,item)).rejects.toThrow(/^recovery_required$/);expect(deletes).toBe(0);expect(f.journal.listCleanup('owner',f.a)).toHaveLength(1);
 }finally{f.cleanup();}
});
test('revocation cleanup retains tombstone, revised account and invalidated Photos session',async()=>{
 const f=fixture();try{
  const {state,operationId}=begin(f);await advance(f,state.epoch,operationId);
  const verified=await advance(f,state.epoch,operationId),active=await advance(f,verified.epoch,operationId);
  let deletes=0;const cleanup=new AccountPasswordCleanup(f.journal,{read:f.native.read.bind(f.native),async deletePassword(id){deletes++;f.native.items.delete(accountPasswordSelector(id).account);}},{assertHeld(){}});
  const forged={...staged(f),operationId,mac:active.mac};
  await expect(cleanup.advance('owner',f.a,active.epoch,forged)).rejects.toThrow('conflict');expect(deletes).toBe(0);
  const revoked=f.journal.revoke('owner',f.a,active.epoch,randomUUID()),session=f.owner.providerSessionState('owner',f.a,'photos_web'),item=f.journal.listCleanup('owner',f.a)[0]!;
  expect(revoked.revision).toBe(2);expect(f.owner.readProviderSession('owner',f.a,'photos_web')).toBeNull();
  expect(await cleanup.advance('owner',f.a,revoked.epoch,item)).toBe('pending');
  expect(await cleanup.advance('owner',f.a,revoked.epoch,item)).toBe('complete');
  expect(f.journal.read('owner',f.a)).toEqual(revoked);expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  expect(f.owner.readAccountSecret('owner',f.a)).toBeNull();expect(f.journal.listCleanup('owner',f.a)).toHaveLength(0);
 }finally{f.cleanup();}
});

import {AccountPasswordRotation} from './account-password-rotation.js';
async function rotationFixture(){
 const f=fixture(),{state,operationId}=begin(f);await advance(f,state.epoch,operationId);
 const verified=await advance(f,state.epoch,operationId),active=await advance(f,verified.epoch,operationId);
 let held=true;
 const rotation=new AccountPasswordRotation(f.journal,f.native,{assertHeld(){if(!held)throw new CustodyError('denied');}});
 return {...f,active,rotation,loseRotationLease(){held=false;}};
}
test('rotation creates, freshly verifies and commits exact password without erasing caller input',async()=>{
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');try{
  const op=randomUUID(),session=f.owner.providerSessionState('owner',f.a,'photos_web'),state=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes),adds=f.native.added;
  expect((await f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'})).phase).toBe('rotation_intent');
  expect(f.journal.readTarget('owner',f.a,state.epoch).generation).toBe(1);expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);
  const checked=await f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'});
  const moved=await f.rotation.advance('owner',f.a,checked.epoch,op,bytes,{interaction:'prohibited'});
  expect(moved.revision).toBe(2);expect(moved.activeGeneration).toBe(2);expect(f.native.added).toBe(adds+1);expect(f.owner.readProviderSession('owner',f.a,'photos_web')).toBeNull();
  expect(bytes.toString()).toBe('replacement-password');expect([...f.native.reads,...f.native.writes].every(zero)).toBe(true);
  expect(f.native.items.has(accountPasswordSelector(staged(f)).account)).toBe(true);expect(f.journal.listCleanup('owner',f.a)).toHaveLength(1);
 }finally{bytes.fill(0);f.cleanup();}
});
test('lost rotation create reply resumes after journal reopen and rejects changed recovery input',async()=>{
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');let reopened:AccountAuthorityJournal|undefined;try{
  const op=randomUUID(),state=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes),adds=f.native.added;
  f.native.afterAdd=()=>{throw new CustodyError('outcome_unknown');};
  await expect(f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('outcome_unknown');
  expect(f.journal.read('owner',f.a)).toEqual(state);f.native.afterAdd=undefined;
  reopened=AccountAuthorityJournal.open(f.db,f.installationId,f.options.masterKey,f.owner);const resumed=new AccountPasswordRotation(reopened,f.native,{assertHeld(){}}),reads=f.native.readOptions.length;
  await expect(resumed.advance('owner',f.a,state.epoch,op,Buffer.from('changed'),{interaction:'prohibited'})).rejects.toThrow('conflict');expect(f.native.readOptions).toHaveLength(reads);
  expect((await resumed.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'})).phase).toBe('rotation_verified');expect(f.native.added).toBe(adds+1);
 }finally{reopened?.close();bytes.fill(0);f.cleanup();}
});
test('verified replacement absence or mismatch never recreates or revises the old authority',async()=>{
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');try{
  const op=randomUUID(),state=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes);await f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'});
  const checked=await f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'}),target=f.journal.rotationTarget('owner',f.a,checked.epoch,op,bytes),selector=accountPasswordSelector(target).account,adds=f.native.added;
  f.native.items.delete(selector);
  await expect(f.rotation.advance('owner',f.a,checked.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('missing');
  f.native.items.set(selector,Buffer.from('wrong-value'));
  await expect(f.rotation.advance('owner',f.a,checked.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('conflict');
  expect(f.native.added).toBe(adds);expect(f.journal.read('owner',f.a)).toEqual(checked);expect(f.native.reads.every(zero)).toBe(true);
 }finally{bytes.fill(0);f.cleanup();}
});
test('revocation during rotation write fences late success and retains both exact cleanup dependencies',async()=>{
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');try{
  const op=randomUUID(),state=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes);f.native.afterAdd=()=>{f.journal.revoke('owner',f.a,state.epoch,randomUUID());};
  await expect(f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('conflict');
  expect(f.journal.read('owner',f.a).phase).toBe('revoked');expect(f.journal.listCleanup('owner',f.a).map(row=>[row.revision,row.generation])).toEqual([[1,1],[2,2]]);expect(f.native.writes.every(zero)).toBe(true);
 }finally{bytes.fill(0);f.cleanup();}
});
test('rotation rejects invalid UTF-8 and lost lease before native access; unexpected diagnostics stay redacted',async()=>{
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');try{
  expect(()=>f.rotation.begin('owner',f.a,f.active.epoch,randomUUID(),Buffer.from([255]))).toThrow('invalid_input');expect(f.journal.read('owner',f.a)).toEqual(f.active);
  const op=randomUUID(),state=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes),reads=f.native.readOptions.length;f.loseRotationLease();
  await expect(f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('denied');expect(f.native.readOptions).toHaveLength(reads);
  const diagnostic=new AccountPasswordRotation(f.journal,{async read(){throw Error('private-password-detail');},addPassword:f.native.addPassword.bind(f.native)},{assertHeld(){}});
  await expect(diagnostic.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow(/^recovery_required$/);expect(f.journal.read('owner',f.a)).toEqual(state);
 }finally{bytes.fill(0);f.cleanup();}
});
test('rotation snapshots caller bytes across asynchronous reads and fences cancellation readback',async()=>{
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');try{
  const op=randomUUID(),state=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes);
  f.native.beforeRead=()=>{bytes.fill(0);};await f.rotation.advance('owner',f.a,state.epoch,op,bytes,{interaction:'prohibited'});
  const target={installationId:f.installationId,ownerId:'owner',accountId:f.a,revision:2,generation:2};expect(Buffer.from(f.native.items.get(accountPasswordSelector(target).account)!).toString()).toBe('replacement-password');expect(zero(bytes)).toBe(true);
  f.native.beforeRead=()=>{f.journal.cancelRotation('owner',f.a,state.epoch,op);};const resupplied=Buffer.from('replacement-password');
  try{await expect(f.rotation.advance('owner',f.a,state.epoch,op,resupplied,{interaction:'prohibited'})).rejects.toThrow('conflict');}finally{resupplied.fill(0);}
  const cancelled=f.journal.read('owner',f.a);expect(cancelled.revision).toBe(1);expect(cancelled.activeGeneration).toBe(1);expect(f.journal.listCleanup('owner',f.a).map(row=>[row.revision,row.generation])).toEqual([[2,2]]);expect(f.native.reads.every(zero)).toBe(true);
 }finally{bytes.fill(0);f.cleanup();}
});

import {AccountPasswordAddition} from './account-password-addition.js';
test('addition lost native write resumes same UUID, verifies before availability, and rejects changed password',async()=>{
 const f=fixture(),bytes=Buffer.from('new-password');try{
  const addition=new AccountPasswordAddition(f.journal,f.native,{assertHeld(){}}),op=randomUUID(),state=addition.begin('owner',{user:'c@example.test',operationId:op,password:bytes});
  expect(()=>f.journal.readTarget('owner',state.accountId,state.epoch)).toThrow('recovery_required');
  f.native.afterAdd=()=>{throw new CustodyError('outcome_unknown');};
  await expect(addition.advance('owner',state.accountId,state.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('outcome_unknown');f.native.afterAdd=undefined;
  await expect(addition.advance('owner',state.accountId,state.epoch,op,Buffer.from('different'),{interaction:'prohibited'})).rejects.toThrow('conflict');
  const checked=await addition.advance('owner',state.accountId,state.epoch,op,bytes,{interaction:'prohibited'}),active=await addition.advance('owner',state.accountId,checked.epoch,op,bytes,{interaction:'prohibited'});
  expect(active.accountId).toBe(state.accountId);expect(active.revision).toBe(1);expect(f.native.added).toBe(1);expect(f.owner.listAccounts('owner')).toHaveLength(3);expect(bytes.toString()).toBe('new-password');expect([...f.native.reads,...f.native.writes].every(zero)).toBe(true);
 }finally{bytes.fill(0);f.cleanup();}
});
test('addition cancellation during native create retains orphan cleanup and cannot publish availability',async()=>{
 const f=fixture(),bytes=Buffer.from('new-password');try{
  const addition=new AccountPasswordAddition(f.journal,f.native,{assertHeld(){}}),op=randomUUID(),state=addition.begin('owner',{user:'c@example.test',operationId:op,password:bytes});
  f.native.afterAdd=()=>{f.journal.cancelAddition('owner',state.accountId,state.epoch,op);};
  await expect(addition.advance('owner',state.accountId,state.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('conflict');
  const cancelled=f.journal.read('owner',state.accountId);expect(cancelled.phase).toBe('revoked');expect(f.journal.listCleanup('owner',state.accountId)).toHaveLength(1);expect(()=>f.journal.readTarget('owner',state.accountId,cancelled.epoch)).toThrow('revoked');expect(f.native.writes.every(zero)).toBe(true);
 }finally{bytes.fill(0);f.cleanup();}
});
test('addition verified-item loss cannot recreate; invalid input and maintenance errors remain bounded',async()=>{
 const f=fixture(),bytes=Buffer.from('new-password');try{
  const addition=new AccountPasswordAddition(f.journal,f.native,{assertHeld(){}}),op=randomUUID();
  expect(()=>addition.begin('owner',{user:'c@example.test',operationId:op,password:Buffer.from([255])})).toThrow('invalid_input');expect(f.owner.listAccounts('owner')).toHaveLength(2);
  const state=addition.begin('owner',{user:'c@example.test',operationId:op,password:bytes});await addition.advance('owner',state.accountId,state.epoch,op,bytes,{interaction:'prohibited'});
  const checked=await addition.advance('owner',state.accountId,state.epoch,op,bytes,{interaction:'prohibited'}),target=f.journal.additionTarget('owner',state.accountId,checked.epoch,op,bytes);f.native.items.delete(accountPasswordSelector(target).account);
  await expect(addition.advance('owner',state.accountId,checked.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow('missing');expect(f.native.added).toBe(1);expect(f.journal.read('owner',state.accountId)).toEqual(checked);
  const denied=new AccountPasswordAddition(f.journal,f.native,{assertHeld(){throw Error('private-detail');}});
  await expect(denied.advance('owner',state.accountId,checked.epoch,op,bytes,{interaction:'prohibited'})).rejects.toThrow(/^recovery_required$/);
 }finally{bytes.fill(0);f.cleanup();}
});

import {AccountCredentialReader} from './account-credential-reader.js';
function readerFixture(f:ReturnType<typeof fixture>){let sourceReads=0;const sourceBuffers:Uint8Array[]=[];const reader=new AccountCredentialReader(f.journal,{account:f.owner.account.bind(f.owner),listAccounts:f.owner.listAccounts.bind(f.owner),readAccountSecret(owner,id){sourceReads++;const bytes=f.owner.readAccountSecret(owner,id);if(bytes)sourceBuffers.push(bytes);return bytes;}},f.native,{assertHeld(){}});return{reader,sourceBuffers,sourceReads:()=>sourceReads};}
test('custody reader preserves SQLite bytes and native account metadata despite cleared ciphertext',async()=>{
 const original=Buffer.from('{ "user": "a@example.test", "appPassword": "synthetic-a" }'),f=fixture(original);try{
  const {reader,sourceBuffers,sourceReads}=readerFixture(f),metadata=f.owner.account('owner',f.a),old=reader.account('owner',f.a),read=await reader.read('owner',f.a);
  try{expect(Buffer.from(read.bytes)).toEqual(original);}finally{read.bytes.fill(0);}expect(sourceBuffers.every(zero)).toBe(true);expect(sourceReads()).toBe(1);
  const {state,operationId}=begin(f);await advance(f,state.epoch,operationId);const checked=await advance(f,state.epoch,operationId),active=await advance(f,checked.epoch,operationId);
  const current=reader.account('owner',f.a);expect(current.account).toEqual(metadata);expect(current.revision).toBe(old.revision);expect(current.custodyEpoch).toBe(active.epoch);expect(current.status).toBe('active');
  expect(()=>reader.assertCurrent(old)).toThrow('conflict');const native=await reader.read('owner',f.a);try{expect(JSON.parse(Buffer.from(native.bytes).toString())).toEqual({user:'a@example.test',appPassword:'synthetic-a'});}finally{native.bytes.fill(0);}expect(sourceReads()).toBe(1);expect(f.native.reads.every(zero)).toBe(true);
 }finally{f.cleanup();}
});
test('native reader missing or denied never reads SQLite or changes authority, revision or another account',async()=>{
 const f=await rotationFixture();try{
  const {reader,sourceReads}=readerFixture(f),before=f.journal.read('owner',f.a);f.native.items.delete(accountPasswordSelector(staged(f)).account);
  await expect(reader.read('owner',f.a)).rejects.toThrow('missing');expect(sourceReads()).toBe(0);expect(f.journal.read('owner',f.a)).toEqual(before);
  f.native.beforeRead=()=>{throw new CustodyError('denied');};await expect(reader.read('owner',f.a)).rejects.toThrow('denied');expect(sourceReads()).toBe(0);expect(f.journal.read('owner',f.a)).toEqual(before);
  expect(reader.listAccounts('owner').map(row=>row.account.id)).toEqual([f.a,f.b]);
 }finally{f.cleanup();}
});
test('pending addition and revoked accounts expose distinct custody status without credential reads',async()=>{
 const f=fixture(),bytes=Buffer.from('new-password');try{
  const {reader,sourceReads}=readerFixture(f),op=randomUUID(),pending=f.journal.beginAddition('owner',{user:'c@example.test',operationId:op,password:bytes});
  expect(reader.account('owner',pending.accountId).status).toBe('migration_pending');expect(reader.account('owner',pending.accountId).account.credentialStored).toBe(false);
  await expect(reader.read('owner',pending.accountId)).rejects.toThrow('migration_pending');
  f.journal.cancelAddition('owner',pending.accountId,pending.epoch,op);expect(reader.account('owner',pending.accountId).status).toBe('revoked');await expect(reader.read('owner',pending.accountId)).rejects.toThrow('revoked');expect(sourceReads()).toBe(0);expect(f.native.readOptions).toHaveLength(0);
 }finally{bytes.fill(0);f.cleanup();}
});
test('native read fences revocation and read failure races, clearing owned buffers',async()=>{
 const f=await rotationFixture();try{
  const {reader,sourceReads}=readerFixture(f),state=f.journal.read('owner',f.a);
  f.native.beforeRead=()=>{f.journal.revoke('owner',f.a,state.epoch,randomUUID());};await expect(reader.read('owner',f.a)).rejects.toThrow('conflict');expect(f.native.reads.every(zero)).toBe(true);expect(sourceReads()).toBe(0);
 }finally{f.cleanup();}
 const second=await rotationFixture();try{
  const {reader}=readerFixture(second),state=second.journal.read('owner',second.a);second.native.beforeRead=()=>{second.journal.revoke('owner',second.a,state.epoch,randomUUID());throw new CustodyError('denied');};await expect(reader.read('owner',second.a)).rejects.toThrow('conflict');
 }finally{second.cleanup();}
});
test('reader preserves BOM password bytes, fails closed on malformed native UTF8, and redacts access errors',async()=>{
 const f=await rotationFixture();try{
  const {reader}=readerFixture(f),selector=accountPasswordSelector(staged(f)).account;f.native.items.set(selector,Buffer.from('\uFEFFsynthetic-password'));
  const read=await reader.read('owner',f.a);try{expect(JSON.parse(Buffer.from(read.bytes).toString()).appPassword).toBe('\uFEFFsynthetic-password');}finally{read.bytes.fill(0);}
  f.native.items.set(selector,Buffer.from([255]));await expect(reader.read('owner',f.a)).rejects.toThrow(/^recovery_required$/);expect(f.native.reads.every(zero)).toBe(true);
  const denied=new AccountCredentialReader(f.journal,f.owner,f.native,{assertHeld(){throw Error('private-detail');}});expect(()=>denied.account('owner',f.a)).toThrow(/^recovery_required$/);
 }finally{f.cleanup();}
});
test('pending copy and rotation retain their prior source; recovery metadata never authorizes a read',async()=>{
 const sqlite=fixture();try{
  const {reader}=readerFixture(sqlite);begin(sqlite);expect(reader.account('owner',sqlite.a).status).toBe('migration_pending');const read=await reader.read('owner',sqlite.a);try{expect(JSON.parse(Buffer.from(read.bytes).toString()).appPassword).toBe('synthetic-a');}finally{read.bytes.fill(0);}
  await expect(reader.read('owner',sqlite.b)).rejects.toThrow(/^recovery_required$/);expect(sqlite.native.readOptions).toHaveLength(0);
 }finally{sqlite.cleanup();}
 const f=await rotationFixture(),bytes=Buffer.from('replacement-password');try{
  const {reader,sourceReads}=readerFixture(f),op=randomUUID(),pending=f.rotation.begin('owner',f.a,f.active.epoch,op,bytes);expect(reader.account('owner',f.a).status).toBe('migration_pending');const read=await reader.read('owner',f.a);try{expect(JSON.parse(Buffer.from(read.bytes).toString()).appPassword).toBe('synthetic-a');expect(read.state.revision).toBe(1);}finally{read.bytes.fill(0);}
  const cancelled=f.journal.cancelRotation('owner',f.a,pending.epoch,op);f.journal.markUnavailable('owner',f.a,cancelled.epoch);const count=f.native.readOptions.length;expect(reader.account('owner',f.a).account.credentialStored).toBe(true);expect(reader.account('owner',f.a).status).toBe('recovery_required');await expect(reader.read('owner',f.a)).rejects.toThrow('recovery_required');expect(f.native.readOptions).toHaveLength(count);expect(sourceReads()).toBe(0);
 }finally{bytes.fill(0);f.cleanup();}
});

import {createCalendarModule} from '../calendar/module.js';
import {OperationMonitor} from '../observability/operations.js';
import {withInvocationContext} from '../modules/context.js';
import type {CalendarGateway} from '../calendar/domain/calendar.js';
import type {AppSettings} from '../server/settings.js';
async function calendarCustodyFixture(){
 const f=await rotationFixture();f.journal.revoke('owner',f.b,1,randomUUID());
 const auth=new Database(':memory:'),{reader,sourceReads}=readerFixture(f);let reads=0,writes=0,late:(()=>void)|undefined,afterDispatch:(()=>void)|undefined,readGuard:((guard:(()=>void)|undefined)=>void)|undefined;
 const provider:CalendarGateway={async execute(command,guard){
  if(command.operation==='create_calendar'){late?.();guard?.({scheduled:false,mutation:true});writes++;afterDispatch?.();return{operation:command.operation,calendar:{href:'https://example.test/c/',name:'synthetic'}};}
  readGuard?.(guard?()=>guard({scheduled:false,mutation:false}):undefined);reads++;late?.();return{operation:command.operation,calendars:[]};
 }};
 const module=createCalendarModule({public_origin:'https://example.test'} as AppSettings,{store:f.owner,credentialReader:reader,authDatabase:auth,masterKey:f.options.masterKey,monitor:new OperationMonitor(()=>{}),provider:credential=>{if(credential.appPassword!=='synthetic-a')throw Error('wrong account password');return provider;}});
 return {...f,module,auth,sourceReads,reads:()=>reads,writes:()=>writes,late:(fn:()=>void)=>{late=fn;},afterDispatch:(fn:()=>void)=>{afterDispatch=fn;},readGuard:(fn:(guard:(()=>void)|undefined)=>void)=>{readGuard=fn;},dispose:async()=>{await module.registration.dispose?.();auth.close();f.cleanup();}};
}
test('Calendar injected custody reads cleared SQLite accounts; native denial yields no provider call or scope prompt',async()=>{
 const f=await calendarCustodyFixture();try{
  expect(f.owner.account('owner',f.a).credentialStored).toBe(false);await f.module.admin.updateCapabilities({read:true,write:true,schedule:true,share:true},true);
  const read=f.module.registration.tools.find(tool=>tool.tool.name==='calendar_list_calendars')!,before=f.reads();
  expect((await withInvocationContext({ownerId:'owner',accountId:f.a},()=>read.run({},new Set(['calendar.read'])))).isError).not.toBe(true);expect(f.reads()).toBe(before+1);expect(f.sourceReads()).toBe(0);
  f.native.beforeRead=()=>{throw new CustodyError('denied');};const update=f.module.registration.tools.find(tool=>tool.tool.name==='calendar_update_event')!;
  const denied=await withInvocationContext({ownerId:'owner',accountId:f.a},()=>update.run({operationId:randomUUID(),identity:{calendarHref:'https://example.test/c/',href:'https://example.test/c/e.ics',uid:'event',etag:'"1"'},fields:{summary:'changed'}},new Set(['calendar.read','calendar.write'])));
  expect(denied.isError).toBe(true);expect(denied._meta).toBeUndefined();expect(f.reads()).toBe(before+1);expect(f.writes()).toBe(0);
 }finally{await f.dispose();}
});
test('Calendar custody fences immediate pre-dispatch revocation and late read result',async()=>{
 for(const operation of ['calendar_create_calendar','calendar_list_calendars']){
  const f=await calendarCustodyFixture();try{
   await f.module.admin.updateCapabilities({read:true,write:true,schedule:false,share:false},true);const state=f.journal.read('owner',f.a);f.late(()=>{f.journal.revoke('owner',f.a,state.epoch,randomUUID());});
   const tool=f.module.registration.tools.find(tool=>tool.tool.name===operation)!,result=await withInvocationContext({ownerId:'owner',accountId:f.a},()=>tool.run(operation==='calendar_create_calendar'?{operationId:randomUUID(),name:'synthetic'}:{},new Set(['calendar.read','calendar.write'])));
   expect(result.isError).toBe(true);expect(f.writes()).toBe(0);expect(f.native.reads.every(zero)).toBe(true);
  }finally{await f.dispose();}
 }
});
test('Calendar custody preserves observed write and durable outcome after post-dispatch revocation',async()=>{
 const f=await calendarCustodyFixture();try{
  await f.module.admin.updateCapabilities({read:true,write:true,schedule:false,share:false},true);const state=f.journal.read('owner',f.a);f.afterDispatch(()=>{f.journal.revoke('owner',f.a,state.epoch,randomUUID());});
  const tool=f.module.registration.tools.find(tool=>tool.tool.name==='calendar_create_calendar')!,result=await withInvocationContext({ownerId:'owner',accountId:f.a},()=>tool.run({operationId:randomUUID(),name:'synthetic'},new Set(['calendar.read','calendar.write'])));
  expect(result.isError).not.toBe(true);expect(f.writes()).toBe(1);expect(f.journal.read('owner',f.a).phase).toBe('revoked');expect((f.auth.query('SELECT count(*) AS count FROM calendar_ledger').get() as {count:number}).count).toBeGreaterThan(1);
 }finally{await f.dispose();}
});
test('retained Calendar service cannot read ledger status after credential revocation',async()=>{
 const f=await calendarCustodyFixture();try{
  await f.module.admin.updateCapabilities({read:true,write:true,schedule:false,share:false},true);
  const service=await withInvocationContext({ownerId:'owner',accountId:f.a},()=>f.module.service(new Set(['calendar.read','calendar.write']))),state=f.journal.read('owner',f.a);
  f.journal.revoke('owner',f.a,state.epoch,randomUUID());expect(()=>service.operationStatus(randomUUID())).toThrow('Account credential changed');
 }finally{await f.dispose();}
});
test('Calendar activation guards provider discovery requests before policy publication',async()=>{
 const f=await calendarCustodyFixture();try{
  const initial=f.module.admin.capabilities(),state=f.journal.read('owner',f.a);let guardPresent=false;
  f.readGuard(guard=>{guardPresent=!!guard;f.journal.revoke('owner',f.a,state.epoch,randomUUID());guard?.();});
  await expect(f.module.admin.updateCapabilities({read:true,write:true,schedule:false,share:false},true)).rejects.toThrow('Account credential changed');expect(guardPresent).toBe(true);expect(f.reads()).toBe(0);expect(f.module.admin.capabilities()).toEqual(initial);
 }finally{await f.dispose();}
});
