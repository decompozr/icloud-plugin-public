import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomBytes,randomUUID,createCipheriv} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOwnerStore} from './owner-store.js';
import {MasterAuthorityJournal} from './master-authority.js';
import {MasterKeyMigration} from './master-key-migration.js';
import {CustodyError} from './custody-contract.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-owner-validation-'));
 const options={databasePath:join(directory,'owner.sqlite'),markerPath:join(directory,'marker'),masterKey:randomBytes(32),bootstrapProof:randomBytes(32).toString('hex')};
 const owner=SqliteOwnerStore.provision(options);owner.enroll({proof:options.bootstrapProof,ownerId:'owner'});
 const a=owner.addAccount('owner',{user:'a@example.test',credential:Buffer.from('synthetic-opaque-account')});
 const b=owner.addAccount('owner',{user:'b@example.test',credential:Buffer.from('synthetic-other-account')});
 owner.replaceProviderSession('owner',a.id,'photos_web',owner.providerSessionState('owner',a.id,'photos_web'),Buffer.from('synthetic-photos'));
 owner.replaceProviderSession('owner',b.id,'photos_web',owner.providerSessionState('owner',b.id,'photos_web'),Buffer.from('synthetic-session-to-revoke'));
 owner.revokeAccountSecret('owner',b.id);
 const db=new Database(options.databasePath,{readwrite:true,create:false});
 const binding={markerPath:options.markerPath,masterKey:options.masterKey,installationId:JSON.parse(readFileSync(options.markerPath,'utf8')).id as string,ownerId:'owner',ownerFormat:'accounts-v2' as const};
 return{directory,options,owner,db,binding,a:a.id,b:b.id,validate(){return SqliteOwnerStore.validateExistingCiphertexts({...binding,database:db});},
  cleanup(){db.close();owner.close();options.masterKey.fill(0);rmSync(directory,{recursive:true});}};
}

test('readonly supplied handle authenticates actual account/provider writers without migration or data changes',()=>{
 const f=fixture();let db:Database|undefined;try{
  const before=readFileSync(f.options.databasePath),marker=readFileSync(f.options.markerPath);db=new Database(f.options.databasePath,{readonly:true,create:false});
  expect(SqliteOwnerStore.validateExistingCiphertexts({...f.binding,database:db})).toEqual({format:1,accounts:2,accountCiphertexts:1,providerSessions:2,providerCiphertexts:1,legacyCiphertexts:0});
  expect(readFileSync(f.options.databasePath)).toEqual(before);expect(readFileSync(f.options.markerPath)).toEqual(marker);
  expect(db.query('SELECT count(*) AS count FROM mail_accounts').get()).toEqual({count:2});
  expect(f.owner.providerSessionState('owner',f.a,'photos_web').stored).toBe(true);expect(f.owner.providerSessionState('owner',f.b,'photos_web').stored).toBe(false);
  expect(f.options.masterKey.some(byte=>byte!==0)).toBe(true);
 }finally{db?.close();f.cleanup();}
});
test('wrong key, changed installation/owner bindings or declared format fail closed and leave caller handles usable',()=>{
 const f=fixture();try{
  for(const patch of [{masterKey:randomBytes(32)},{installationId:randomUUID()},{ownerId:'foreign-owner'},{ownerFormat:'legacy-v1' as const}])expect(()=>SqliteOwnerStore.validateExistingCiphertexts({...f.binding,...patch,database:f.db})).toThrow(/^STATE_UNAVAILABLE$/);
  expect(f.validate().accounts).toBe(2);expect(f.owner.ownerId()).toBe('owner');
 }finally{f.cleanup();}
});
test('account ciphertext transplantation or corruption is rejected without rewriting records',()=>{
 for(const transplant of [true,false]){const f=fixture();try{
  const row=f.db.query('SELECT secret FROM mail_accounts WHERE id=?').get(f.a) as {secret:string};
  f.db.query('UPDATE mail_accounts SET secret=? WHERE id=?').run(transplant?row.secret:'synthetic-invalid-envelope',transplant?f.b:f.a);
  const before=readFileSync(f.options.databasePath);expect(()=>f.validate()).toThrow(/^STATE_UNAVAILABLE$/);expect(readFileSync(f.options.databasePath)).toEqual(before);
 }finally{f.cleanup();}}
});
test('Photos ciphertext uses stored revision/generation AAD even when retained revision is stale',()=>{
 const f=fixture();try{
  // Retain an authentic old session as deliberately stale metadata; do not use
  // account rotation, which correctly deletes it. The validator must authenticate
  // its stored AAD without declaring the session current or rewriting it.
  f.db.query('UPDATE mail_accounts SET secret=NULL,version=2 WHERE id=?').run(f.a);
  expect(f.validate()).toMatchObject({accountCiphertexts:0,providerCiphertexts:1});expect(f.owner.providerSessionState('owner',f.a,'photos_web').stored).toBe(false);
  f.db.query('UPDATE provider_sessions SET generation=generation+1 WHERE account=?').run(f.a);expect(()=>f.validate()).toThrow(/^STATE_UNAVAILABLE$/);
 }finally{f.cleanup();}
});
test('missing tables, broken legacy link, foreign/orphan provider records are never repaired',()=>{
 for(const corruption of ['table','link','owner','orphan'] as const){const f=fixture();try{
  if(corruption==='table')f.db.exec('DROP TABLE provider_sessions');
  if(corruption==='link')f.db.query('UPDATE owner_state SET legacy_account=?').run(randomUUID());
  if(corruption==='owner')f.db.query('UPDATE provider_sessions SET owner=? WHERE account=?').run('foreign',f.a);
  if(corruption==='orphan')f.db.query('UPDATE provider_sessions SET account=? WHERE account=?').run(randomUUID(),f.a);
  const schema=f.db.query('SELECT sql FROM sqlite_master ORDER BY name').all();expect(()=>f.validate()).toThrow(/^STATE_UNAVAILABLE$/);expect(f.db.query('SELECT sql FROM sqlite_master ORDER BY name').all()).toEqual(schema);
 }finally{f.cleanup();}}
});
test('explicit original-v1 format authenticates opaque legacy ciphertext without converting it to an account',()=>{
 const f=fixture();const db=new Database(':memory:');try{
  db.exec('CREATE TABLE owner_state(singleton INTEGER PRIMARY KEY,install TEXT,owner TEXT,proof TEXT,secret TEXT,version INTEGER)');
  const cipher=createCipheriv('aes-256-gcm',f.options.masterKey,Buffer.alloc(12,1));cipher.setAAD(Buffer.from('credential:v1:owner:7'));
  const data=Buffer.concat([cipher.update(Buffer.from('synthetic-v1-opaque')),cipher.final()]);
  const secret=JSON.stringify({iv:Buffer.alloc(12,1).toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
  db.query('INSERT INTO owner_state VALUES(1,?,?,NULL,?,7)').run(f.binding.installationId,'owner',secret);
  const binding={...f.binding,database:db,ownerFormat:'legacy-v1' as const};
  expect(SqliteOwnerStore.validateExistingCiphertexts(binding)).toMatchObject({accounts:0,legacyCiphertexts:1,providerSessions:0});
  expect(db.query("SELECT name FROM sqlite_master WHERE name IN ('mail_accounts','provider_sessions')").all()).toEqual([]);
  expect(db.query('SELECT secret,version FROM owner_state').get()).toEqual({secret,version:7});
  db.exec('UPDATE owner_state SET version=8');expect(()=>SqliteOwnerStore.validateExistingCiphertexts(binding)).toThrow(/^STATE_UNAVAILABLE$/);
 }finally{db.close();f.cleanup();}
});
test('populated owner validator gates master copy cutover; corrupted Photos state prevents authority change',async()=>{
 for(const corrupt of [false,true]){const f=fixture();let item:Uint8Array|undefined;try{
  const journal=new MasterAuthorityJournal(f.directory,f.binding.installationId),lease=journal.acquire(randomUUID());journal.provision(lease,f.options.masterKey);
  const marker=readFileSync(f.options.markerPath),account=f.owner.account('owner',f.a),session=f.owner.providerSessionState('owner',f.a,'photos_web');
  const migration=new MasterKeyMigration(journal,{assertStoppedMaintenance(){},async readOriginalFile(){return Uint8Array.from(f.options.masterKey);},async validateExistingState(key){SqliteOwnerStore.validateExistingCiphertexts({...f.binding,masterKey:key,database:f.db});}},
   {async read(){if(!item)throw new CustodyError('missing');return Uint8Array.from(item);},async addMaster(_id,bytes){if(item)throw new CustodyError('conflict');item=Uint8Array.from(bytes);}});
  await migration.begin(lease,1);await migration.advance(lease,2,{interaction:'setup'});await migration.advance(lease,2,{interaction:'prohibited'});
  if(corrupt){f.db.query('UPDATE provider_sessions SET generation=generation+1 WHERE account=?').run(f.a);
   await expect(migration.advance(lease,3,{interaction:'prohibited'})).rejects.toThrow(/^recovery_required$/);expect(journal.verify(f.options.masterKey).authority).toBe('file');
  }else{expect((await migration.advance(lease,3,{interaction:'prohibited'})).authority).toBe('keychain');expect(f.owner.account('owner',f.a)).toEqual(account);expect(f.owner.providerSessionState('owner',f.a,'photos_web')).toEqual(session);}
  expect(readFileSync(f.options.markerPath)).toEqual(marker);expect(Buffer.from(item!).equals(f.options.masterKey)).toBe(true);
  lease.release();
 }finally{item?.fill(0);f.cleanup();}}
});
