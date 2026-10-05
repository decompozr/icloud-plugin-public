import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,chmodSync,symlinkSync,linkSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOwnerStore} from './owner-store.js';
import {MasterAuthorityJournal,type AuthorityCheckpoint} from './master-authority.js';
import {MasterConsumerBaselineStore} from './master-consumer-baseline.js';
import {validateMasterConsumers,type MasterConsumerBaseline} from './master-consumer-validation.js';
import {MasterKeyMigration} from './master-key-migration.js';
import {ownerAuthSecret,resourceClientStorageId,sealResourceClient} from '../auth/key-contexts.js';

function fixture(authorityFault?:(point:AuthorityCheckpoint)=>void){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-baseline-')),key=Buffer.alloc(32,29),ownerPath=join(directory,'owner.sqlite'),markerPath=join(directory,'marker');
 const owner=SqliteOwnerStore.provision({databasePath:ownerPath,markerPath,masterKey:key,bootstrapProof:'synthetic-baseline-bootstrap-proof'});owner.enroll({proof:'synthetic-baseline-bootstrap-proof',ownerId:'owner'});owner.addAccount('owner',{user:'synthetic@example.invalid',credential:Buffer.from('synthetic-private-password')});
 const ownerDatabase=new Database(ownerPath),authDatabase=new Database(':memory:'),installationId=JSON.parse(readFileSync(markerPath,'utf8')).id as string;
 const required=resourceClientStorageId('https://baseline.invalid/icloud/auth','https://baseline.invalid/icloud/mcp');authDatabase.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
 authDatabase.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(required,sealResourceClient(ownerAuthSecret(key,'remote'),JSON.stringify({client_id:'synthetic-client',client_secret:'synthetic-client-secret'})));
 const journal=new MasterAuthorityJournal(directory,installationId,authorityFault),lease=journal.acquire(randomUUID());journal.provision(lease,key);
 const store=new MasterConsumerBaselineStore(journal),baseline:MasterConsumerBaseline={installationId,ownerId:'owner',ownerFormat:'accounts-v2',requiredAuthRecordId:required,mailOwnerNamespaces:[],calendarPolicyOwners:[],calendarAccountIdentities:[],expected:{owner:{format:1,accounts:1,accountCiphertexts:1,providerSessions:0,providerCiphertexts:0,legacyCiphertexts:0},auth:{format:1,records:1},mail:null,calendar:null,accountCustody:null}};
 let stopped=true;const stores={ownerDatabase,authDatabase,markerPath,assertStoppedMaintenance:()=>{if(!stopped)throw Error('Synthetic missing maintenance');}};
 const expectation={operationId:lease.operationId,minimumMasterGeneration:1};
 return{directory,key,journal,lease,store,baseline,stores,expectation,stopLease(){stopped=false;},cleanup(){journal.release(lease);authDatabase.close();ownerDatabase.close();owner.close();key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}

test('validated immutable baseline survives reopen, preserves borrowed key and stores no plaintext credentials',()=>{
 const f=fixture();try{
  expect(f.store.create(f.lease,f.key,f.baseline,f.stores)).toEqual(f.baseline);
  const reopened=new MasterConsumerBaselineStore(f.journal),baseline=reopened.read(f.key,f.expectation),bytes=readFileSync(f.store.path);
  expect(baseline).toEqual(f.baseline);expect(Object.isFrozen(baseline)).toBe(true);expect(Object.isFrozen(baseline.expected.owner)).toBe(true);expect(Object.isFrozen(baseline.mailOwnerNamespaces)).toBe(true);
  expect(bytes.includes(Buffer.from('synthetic-private-password'))).toBe(false);expect(bytes.includes(Buffer.from('synthetic-client-secret'))).toBe(false);expect(f.key).toEqual(Buffer.alloc(32,29));
  expect(()=>reopened.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^conflict$/);expect(readFileSync(f.store.path)).toEqual(bytes);
 }finally{f.cleanup();}
});

test('missing, tampered, wrong-key, wrong-operation, wrong-installation or insufficient-floor baseline fails without replacement',()=>{
 for(const scenario of ['missing','tamper','wrong-key','operation','installation','floor','truncated'] as const){const f=fixture(),wrong=Buffer.alloc(32,30);try{
  if(scenario!=='missing')f.store.create(f.lease,f.key,f.baseline,f.stores);
  if(scenario==='tamper'||scenario==='installation'){const record=JSON.parse(readFileSync(f.store.path,'utf8'));if(scenario==='tamper')record.baseline.expected.auth.records=0;else record.baseline.installationId=randomUUID();writeFileSync(f.store.path,JSON.stringify(record));}
  if(scenario==='truncated')writeFileSync(f.store.path,'{"format":');
  const before=existsSync(f.store.path)?readFileSync(f.store.path):undefined;
  expect(()=>f.store.read(scenario==='wrong-key'?wrong:f.key,{operationId:scenario==='operation'?randomUUID():f.lease.operationId,minimumMasterGeneration:scenario==='floor'?2:1})).toThrow(/^recovery_required$/);
  if(before)expect(readFileSync(f.store.path)).toEqual(before);else expect(existsSync(f.store.path)).toBe(false);
 }finally{wrong.fill(0);f.cleanup();}}
});

test('unsafe file permissions, symlinks and hardlinks cannot supply an authenticated baseline',()=>{
 for(const scenario of ['permissions','symlink','hardlink'] as const){const f=fixture();try{
  f.store.create(f.lease,f.key,f.baseline,f.stores);
  if(scenario==='permissions')chmodSync(f.store.path,0o644);
  else if(scenario==='hardlink')linkSync(f.store.path,join(f.directory,'retained-copy'));
  else{const bytes=readFileSync(f.store.path),target=join(f.directory,'other');writeFileSync(target,bytes,{mode:0o600});rmSync(f.store.path);symlinkSync(target,f.store.path);}
  expect(()=>f.store.read(f.key,f.expectation)).toThrow(/^recovery_required$/);
 }finally{f.cleanup();}}
});

test('invalid consumers or missing maintenance cannot persist a fresh baseline',()=>{
 for(const scenario of ['consumer','maintenance','counts','foreign-installation'] as const){const f=fixture();try{
  if(scenario==='consumer')f.stores.authDatabase.exec("UPDATE plugin_auth_private SET value='bad'");
  if(scenario==='maintenance')f.stopLease();
  const baseline=scenario==='counts'?{...f.baseline,expected:{...f.baseline.expected,auth:{format:1 as const,records:2}}}:scenario==='foreign-installation'?{...f.baseline,installationId:randomUUID()}:f.baseline;
  expect(()=>f.store.create(f.lease,f.key,baseline,f.stores)).toThrow();expect(existsSync(f.store.path)).toBe(false);
 }finally{f.cleanup();}}
});

for(const point of ['file_fsynced','directory_fsynced'] as const)test('lost '+point+' result retains baseline and requires readback, never overwrite',()=>{
 const f=fixture();try{
  const store=new MasterConsumerBaselineStore(f.journal,checkpoint=>{if(checkpoint===point)throw Error('Synthetic lost result');});
  expect(()=>store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);
  expect(f.store.read(f.key,f.expectation)).toEqual(f.baseline);const before=readFileSync(f.store.path);
  expect(()=>f.store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^conflict$/);expect(readFileSync(f.store.path)).toEqual(before);
 }finally{f.cleanup();}
});

test('consumer corruption after baseline file sync retains uncertain evidence rather than accepting or deleting it',()=>{
 const f=fixture();try{
  const store=new MasterConsumerBaselineStore(f.journal,checkpoint=>{if(checkpoint==='file_fsynced')f.stores.authDatabase.exec("UPDATE plugin_auth_private SET value='late-bad'");});
  expect(()=>store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);expect(existsSync(store.path)).toBe(true);expect(store.read(f.key,f.expectation)).toEqual(f.baseline);
 }finally{f.cleanup();}
});

test('baseline creation after copy intent cannot replace original authority-generation evidence',()=>{
 const f=fixture();try{f.journal.advance(f.lease,f.key,1,'copy_intent');expect(()=>f.store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^conflict$/);expect(existsSync(f.store.path)).toBe(false);}finally{f.cleanup();}
});

test('file-close failure stays redacted and preserves uncertain evidence without retrying the same handle',()=>{
 const f=fixture();let closes=0;try{
  const store=new MasterConsumerBaselineStore(f.journal,undefined,fd=>{closes++;closeSync(fd);throw Error('Synthetic raw teardown diagnostic');});
  expect(()=>store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);expect(closes).toBe(1);
  const before=readFileSync(store.path);expect(f.store.read(f.key,f.expectation)).toEqual(f.baseline);
  expect(()=>store.read(f.key,f.expectation)).toThrow(/^recovery_required$/);expect(closes).toBe(2);expect(readFileSync(store.path)).toEqual(before);
 }finally{f.cleanup();}
});

test('established baseline loss cannot recapture',()=>{
 const f=fixture();try{
  f.store.create(f.lease,f.key,f.baseline,f.stores);expect(f.journal.verify(f.key).baseline?.phase).toBe('established');rmSync(f.store.path);
  expect(()=>f.store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^conflict$/);expect(()=>f.store.resume(f.lease,f.key,f.stores)).toThrow(/^recovery_required$/);expect(existsSync(f.store.path)).toBe(false);
  expect(()=>f.journal.beginBaseline(f.lease,f.key,3,'0'.repeat(64))).toThrow(/^conflict$/);
 }finally{f.cleanup();}
});

for(const point of ['temp_fsynced','renamed','directory_fsynced'] as const)test('baseline intent '+point+' interruption remains inspectable without fresh capture',()=>{
 let armed=false;const f=fixture(checkpoint=>{if(armed&&checkpoint===point)throw Error('Synthetic lost authority result');});try{
  armed=true;expect(()=>f.store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);
  const inspection=f.journal.inspectRecovery(f.key,f.lease.operationId,{requiredAuthority:'file'});
  if(point==='temp_fsynced'){expect(inspection.committed.format).toBe(1);expect(inspection.staged?.record.baseline?.phase).toBe('intent');expect(()=>f.store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^conflict$/);}
  else{expect(inspection.committed.baseline?.phase).toBe('intent');expect(inspection.staged).toBeNull();expect(()=>f.store.create(f.lease,f.key,{...f.baseline,mailOwnerNamespaces:['changed']},f.stores)).toThrow(/^conflict$/);}
  expect(existsSync(f.store.path)).toBe(false);
 }finally{f.cleanup();}
});

test('intent recovery pins original metadata and resyncs retained readback before establishing exactly once',()=>{
 const f=fixture();try{
  const interrupted=new MasterConsumerBaselineStore(f.journal,point=>{if(point==='file_fsynced')throw Error('Synthetic lost result');});
  expect(()=>interrupted.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);const intent=f.journal.verify(f.key);expect(intent.baseline?.phase).toBe('intent');
  expect(()=>f.journal.advance(f.lease,f.key,intent.generation,'copy_intent')).toThrow(/^conflict$/);
  expect(()=>f.store.create(f.lease,f.key,{...f.baseline,mailOwnerNamespaces:['changed-baseline']},f.stores)).toThrow(/^conflict$/);
  const before=readFileSync(f.store.path);expect(f.store.resume(f.lease,f.key,f.stores)).toEqual(f.baseline);const established=f.journal.verify(f.key);expect(established.baseline?.phase).toBe('established');
  expect(f.store.resume(f.lease,f.key,f.stores)).toEqual(f.baseline);expect(f.journal.verify(f.key).generation).toBe(established.generation);expect(readFileSync(f.store.path)).toEqual(before);
 }finally{f.cleanup();}
});

test('format-2 master coordinator rejects established-file loss before native requests even with a no-op consumer port',async()=>{
 const f=fixture();let requests=0;try{
  f.store.create(f.lease,f.key,f.baseline,f.stores);const state=f.journal.verify(f.key);rmSync(f.store.path);
  const migration=new MasterKeyMigration(f.journal,{assertStoppedMaintenance:f.stores.assertStoppedMaintenance,readOriginalFile:async()=>Buffer.from(f.key),validateExistingState:async()=>{}},{read:async()=>{requests++;return Buffer.from(f.key);},addMaster:async()=>{requests++;}});
  await expect(migration.begin(f.lease,state.generation)).rejects.toMatchObject({code:'recovery_required'});expect(requests).toBe(0);expect(f.journal.verify(f.key).generation).toBe(state.generation);
 }finally{f.cleanup();}
});

test('format-2 established binding survives exact-key copy with fresh persisted baseline validation',async()=>{
 const f=fixture();try{
  f.store.create(f.lease,f.key,f.baseline,f.stores);let state=f.journal.verify(f.key);const binding=state.baseline;
  const migration=new MasterKeyMigration(f.journal,{assertStoppedMaintenance:f.stores.assertStoppedMaintenance,readOriginalFile:async()=>Buffer.from(f.key),validateExistingState:async key=>{const baseline=f.store.read(key,f.expectation);validateMasterConsumers({...f.stores,masterKey:key,baseline});}},
   {read:async()=>Buffer.from(f.key),addMaster:async()=>{throw Error('Existing synthetic item must not be replaced');}});
  state=await migration.begin(f.lease,state.generation);state=await migration.advance(f.lease,state.generation,{interaction:'prohibited'});state=await migration.advance(f.lease,state.generation,{interaction:'prohibited'});
  expect(state.phase).toBe('keychain_authoritative');expect(state.format).toBe(2);expect(state.baseline).toEqual(binding);expect(f.store.read(f.key,f.expectation)).toEqual(f.baseline);
 }finally{f.cleanup();}
});

for(const point of ['temp_fsynced','renamed','directory_fsynced'] as const)test('baseline establishment '+point+' interruption reconciles without repeating the manifest commit',()=>{
 let armed=false,path='';const f=fixture(checkpoint=>{if(armed&&checkpoint===point&&existsSync(path))throw Error('Synthetic lost establishment result');});try{
  path=f.store.path;armed=true;expect(()=>f.store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);
  const inspection=f.journal.inspectRecovery(f.key,f.lease.operationId,{requiredAuthority:'file'});
  if(point==='temp_fsynced'){expect(inspection.committed.baseline?.phase).toBe('intent');expect(inspection.staged?.record.baseline?.phase).toBe('established');expect(()=>f.store.resume(f.lease,f.key,f.stores)).toThrow(/^recovery_required$/);}
  else{expect(inspection.committed.baseline?.phase).toBe('established');expect(inspection.staged).toBeNull();expect(f.store.resume(f.lease,f.key,f.stores)).toEqual(f.baseline);expect(f.journal.verify(f.key).generation).toBe(inspection.committed.generation);}
  expect(f.store.read(f.key,f.expectation)).toEqual(f.baseline);
 }finally{f.cleanup();}
});

test('late baseline-file corruption after validated readback reports unknown establishment instead of success',()=>{
 const f=fixture();let closes=0;try{
  const store=new MasterConsumerBaselineStore(f.journal,undefined,fd=>{closeSync(fd);if(++closes===2)writeFileSync(f.store.path,'bad');});
  expect(()=>store.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);expect(()=>f.store.read(f.key,f.expectation)).toThrow(/^recovery_required$/);
 }finally{f.cleanup();}
});

test('resume reauthenticates after resync before promoting an intent',()=>{
 const f=fixture();let closes=0;try{
  const interrupted=new MasterConsumerBaselineStore(f.journal,point=>{if(point==='file_fsynced')throw Error('Synthetic lost result');});expect(()=>interrupted.create(f.lease,f.key,f.baseline,f.stores)).toThrow(/^outcome_unknown$/);
  const store=new MasterConsumerBaselineStore(f.journal,undefined,fd=>{closeSync(fd);if(++closes===1)writeFileSync(f.store.path,'bad');});
  expect(()=>store.resume(f.lease,f.key,f.stores)).toThrow(/^recovery_required$/);expect(f.journal.verify(f.key).baseline?.phase).toBe('intent');
 }finally{f.cleanup();}
});
