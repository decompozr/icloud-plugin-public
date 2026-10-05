import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,chmodSync,symlinkSync,linkSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOwnerStore} from './owner-store.js';
import {MasterAuthorityJournal} from './master-authority.js';
import {MasterConsumerBaselineStore} from './master-consumer-baseline.js';
import type {MasterConsumerBaseline} from './master-consumer-validation.js';
import {ownerAuthSecret,resourceClientStorageId,sealResourceClient} from '../auth/key-contexts.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-baseline-')),key=Buffer.alloc(32,29),ownerPath=join(directory,'owner.sqlite'),markerPath=join(directory,'marker');
 const owner=SqliteOwnerStore.provision({databasePath:ownerPath,markerPath,masterKey:key,bootstrapProof:'synthetic-baseline-bootstrap-proof'});owner.enroll({proof:'synthetic-baseline-bootstrap-proof',ownerId:'owner'});owner.addAccount('owner',{user:'synthetic@example.invalid',credential:Buffer.from('synthetic-private-password')});
 const ownerDatabase=new Database(ownerPath),authDatabase=new Database(':memory:'),installationId=JSON.parse(readFileSync(markerPath,'utf8')).id as string;
 const required=resourceClientStorageId('https://baseline.invalid/icloud/auth','https://baseline.invalid/icloud/mcp');authDatabase.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
 authDatabase.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(required,sealResourceClient(ownerAuthSecret(key,'remote'),JSON.stringify({client_id:'synthetic-client',client_secret:'synthetic-client-secret'})));
 const journal=new MasterAuthorityJournal(directory,installationId),lease=journal.acquire(randomUUID());journal.provision(lease,key);
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
