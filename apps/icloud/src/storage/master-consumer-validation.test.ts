import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOwnerStore} from './owner-store.js';
import {AccountAuthorityJournal} from './account-authority.js';
import {MasterAuthorityJournal} from './master-authority.js';
import {MasterKeyMigration} from './master-key-migration.js';
import {CustodyError} from './custody-contract.js';
import {validateMasterConsumers,type MasterConsumerBaseline} from './master-consumer-validation.js';
import {ownerAuthSecret,resourceClientStorageId,sealResourceClient} from '../auth/key-contexts.js';
import {SqliteOutboundLedger} from '../mail/storage/outbound-ledger.js';
import {SqliteCalendarLedger} from '../calendar/storage/ledger.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-consumer-validation-')),key=Buffer.alloc(32,23),ownerPath=join(directory,'owner.sqlite'),authPath=join(directory,'auth.sqlite'),markerPath=join(directory,'marker');
 const owner=SqliteOwnerStore.provision({databasePath:ownerPath,markerPath,masterKey:key,bootstrapProof:'synthetic-master-consumer-bootstrap-proof'});owner.enroll({proof:'synthetic-master-consumer-bootstrap-proof',ownerId:'owner'});
 const accounts=['a','b'].map(user=>owner.addAccount('owner',{user:user+'@example.invalid',credential:Buffer.from(JSON.stringify({user:user+'@example.invalid',appPassword:'synthetic-'+user}))}));
 owner.replaceProviderSession('owner',accounts[0]!.id,'photos_web',owner.providerSessionState('owner',accounts[0]!.id,'photos_web'),Buffer.from('synthetic-retained-session'));
 const installationId=JSON.parse(readFileSync(markerPath,'utf8')).id as string,ownerDb=new Database(ownerPath),authDb=new Database(authPath);ownerDb.exec('PRAGMA synchronous=FULL');
 const custody=AccountAuthorityJournal.provision(ownerDb,installationId,key,owner),operationId=randomUUID(),a=accounts[0]!.id;
 let state=custody.beginCopy('owner',a,custody.read('owner',a).epoch,operationId);custody.cancelCopy('owner',a,state.epoch,operationId);
 const required=resourceClientStorageId('https://fixture.invalid/icloud/auth','https://fixture.invalid/icloud/mcp');authDb.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
 for(const id of [required,'resource-client'])authDb.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(id,sealResourceClient(ownerAuthSecret(key,'remote'),JSON.stringify({client_id:id,client_secret:'synthetic-internal-client'})));
 const identities=accounts.map(account=>({ownerId:'owner',accountId:account.id})),namespaces=['owner',...identities.map(identity=>JSON.stringify([identity.ownerId,identity.accountId]))];
 const mailId=randomUUID();for(const [index,namespace]of namespaces.entries()){const ledger=new SqliteOutboundLedger(authDb,key,()=>namespace);ledger.claim(mailId,'synthetic-digest','<synthetic@example.invalid>');if(index!==2)ledger.finish(mailId,{operationId:mailId,messageId:'<synthetic@example.invalid>',status:'unknown',replayed:false});ledger.dispose();}
 const calendar=new SqliteCalendarLedger({database:authDb,masterKey:key});calendar.setPolicy('owner',{read:true,write:false,schedule:false,share:false});
 for(const identity of identities){calendar.begin(identity,{operationId:randomUUID(),fingerprint:'synthetic-fingerprint',command:{operation:'create_calendar'},state:'dispatched',updatedAt:'now'});calendar.commitSync(identity,'https://fixture.invalid/cal/',undefined,{token:'synthetic-sync-token',snapshot:{},changes:[]});}calendar.close();
 const baseline:MasterConsumerBaseline={installationId,ownerId:'owner',ownerFormat:'accounts-v2',requiredAuthRecordId:required,mailOwnerNamespaces:namespaces,calendarPolicyOwners:['owner'],calendarAccountIdentities:identities,expected:{owner:{format:1,accounts:2,accountCiphertexts:2,providerSessions:1,providerCiphertexts:1,legacyCiphertexts:0},auth:{format:1,records:2},mail:{format:1,records:3,encrypted:2,pending:1},calendar:{format:1,policies:1,operations:2,sync:2},accountCustody:{format:1,records:2,cleanup:1}}};
 let stopped=true;
 const assertStoppedMaintenance=()=>{if(!stopped)throw Error('Synthetic maintenance unavailable');};
 const validate=(masterKey:Uint8Array=key,selectedBaseline:MasterConsumerBaseline=baseline)=>validateMasterConsumers({ownerDatabase:ownerDb,authDatabase:authDb,markerPath,masterKey,baseline:selectedBaseline,assertStoppedMaintenance});
 return{directory,key,ownerPath,authPath,markerPath,owner,ownerDb,authDb,custody,baseline,validate,assertStoppedMaintenance,stopLease(){stopped=false;},cleanup(){custody.close();authDb.close();ownerDb.close();owner.close();key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}

test('whole retained inventory validates readonly handles without writes, repaired state or key ownership transfer',()=>{
 const f=fixture();const ownerDb=new Database(f.ownerPath,{readonly:true}),authDb=new Database(f.authPath,{readonly:true});try{
  const before=[readFileSync(f.ownerPath),readFileSync(f.authPath),readFileSync(f.markerPath)];
  const report=validateMasterConsumers({ownerDatabase:ownerDb,authDatabase:authDb,markerPath:f.markerPath,masterKey:f.key,baseline:f.baseline,assertStoppedMaintenance:f.assertStoppedMaintenance});
  expect(report).toEqual(f.baseline.expected);expect(Object.isFrozen(report)).toBe(true);expect(f.key).toEqual(Buffer.alloc(32,23));
  expect([readFileSync(f.ownerPath),readFileSync(f.authPath),readFileSync(f.markerPath)]).toEqual(before);expect(ownerDb.query('SELECT count(*) AS n FROM mail_accounts').get()).toEqual({n:2});
 }finally{authDb.close();ownerDb.close();f.cleanup();}
});

for(const consumer of ['photos','auth','mail','calendar','custody-state','custody-cleanup'])test(consumer+' corruption blocks complete validation on every retry',()=>{
 const f=fixture();try{
  if(consumer==='photos')f.ownerDb.exec("UPDATE provider_sessions SET secret='bad'");
  if(consumer==='auth')f.authDb.exec("UPDATE plugin_auth_private SET value='bad' WHERE id='resource-client'");
  if(consumer==='mail')f.authDb.exec("UPDATE icloudOutbound SET receipt=x'0001' WHERE receipt IS NOT NULL");
  if(consumer==='calendar')f.authDb.exec("UPDATE calendar_ledger SET payload='bad' WHERE kind='sync'");
  if(consumer==='custody-state')f.ownerDb.exec("UPDATE account_custody_state SET record=json_set(record,'$.mac',printf('%064d',0))");
  if(consumer==='custody-cleanup')f.ownerDb.exec("UPDATE account_custody_cleanup SET record=json_set(record,'$.mac',printf('%064d',0))");
  for(let attempt=0;attempt<4;attempt++)expect(()=>f.validate()).toThrow(/^recovery_required$/);
 }finally{f.cleanup();}
});

test('deleted rows and hidden/partial custody schema cannot be inferred away from the baseline',()=>{
 for(const scenario of ['auth-row','pending-mail','custody-state','custody-cleanup','custody-table','auth-table','mail-table','calendar-table','undeclared','undeclared-auth','undeclared-mail','undeclared-calendar','wrong-db'] as const){const f=fixture();try{
  if(scenario==='auth-row')f.authDb.exec("DELETE FROM plugin_auth_private WHERE id='resource-client'");
  if(scenario==='pending-mail')f.authDb.exec('DELETE FROM icloudOutbound WHERE receipt IS NULL');
  if(scenario==='custody-state')f.ownerDb.exec('DELETE FROM account_custody_state WHERE rowid=(SELECT min(rowid) FROM account_custody_state)');
  if(scenario==='custody-cleanup')f.ownerDb.exec('DELETE FROM account_custody_cleanup');
  if(scenario==='custody-table')f.ownerDb.exec('DROP TABLE account_custody_cleanup');
  if(scenario==='auth-table')f.authDb.exec('DROP TABLE plugin_auth_private');
  if(scenario==='mail-table')f.authDb.exec('DROP TABLE icloudOutbound');
  if(scenario==='calendar-table')f.authDb.exec('DROP TABLE calendar_ledger');
  if(scenario==='wrong-db')f.ownerDb.exec('CREATE TABLE plugin_auth_private(id TEXT,value TEXT)');
  const baseline={...f.baseline,expected:{...f.baseline.expected}};
  if(scenario==='undeclared')baseline.expected.accountCustody=null;
  if(scenario==='undeclared-auth')baseline.expected.auth=null;
  if(scenario==='undeclared-mail')baseline.expected.mail=null;
  if(scenario==='undeclared-calendar')baseline.expected.calendar=null;
  expect(()=>f.validate(f.key,baseline)).toThrow(/^recovery_required$/);
 }finally{f.cleanup();}}
});

test('wrong key or unavailable maintenance blocks complete validation without baseline repair',()=>{
 const f=fixture(),wrong=Buffer.alloc(32,24);try{expect(()=>f.validate(wrong)).toThrow(/^recovery_required$/);f.stopLease();expect(()=>f.validate()).toThrow(/^recovery_required$/);expect(f.ownerDb.query('SELECT count(*) AS n FROM account_custody_cleanup').get()).toEqual({n:1});}finally{wrong.fill(0);f.cleanup();}
});

test('maintenance loss after snapshots prevents returning successful validation',()=>{
 const f=fixture();let calls=0;try{expect(()=>validateMasterConsumers({ownerDatabase:f.ownerDb,authDatabase:f.authDb,markerPath:f.markerPath,masterKey:f.key,baseline:f.baseline,assertStoppedMaintenance:()=>{if(++calls===2)throw Error('Synthetic lost lease');}})).toThrow(/^recovery_required$/);expect(calls).toBe(2);}finally{f.cleanup();}
});

test('explicit absent-consumer baseline permits absence only after matching tables are absent',()=>{
 const f=fixture();try{
  const baseline={...f.baseline,requiredAuthRecordId:null,expected:{...f.baseline.expected,auth:null,mail:null,calendar:null}};
  expect(()=>f.validate(f.key,baseline)).toThrow(/^recovery_required$/);
  f.authDb.exec('DROP TABLE plugin_auth_private; DROP TABLE icloudOutbound; DROP TABLE calendar_ledger');
  expect(f.validate(f.key,baseline)).toEqual(baseline.expected);
 }finally{f.cleanup();}
});

test('populated complete consumer validation gates every master-copy step and a late corrupt client prevents cutover',async()=>{
 for(const corrupt of [false,true]){const f=fixture();let item:Uint8Array|undefined;const journal=new MasterAuthorityJournal(f.directory,f.baseline.installationId),lease=journal.acquire(randomUUID());try{
  journal.provision(lease,f.key);const migration=new MasterKeyMigration(journal,{assertStoppedMaintenance:f.assertStoppedMaintenance,readOriginalFile:async()=>Buffer.from(f.key),validateExistingState:async key=>{f.validate(key);}},
   {read:async()=>{if(!item)throw new CustodyError('missing');return Buffer.from(item);},addMaster:async(_id,bytes)=>{expect(item).toBeUndefined();item=Buffer.from(bytes);}});
  let state=await migration.begin(lease,1);state=await migration.advance(lease,state.generation,{interaction:'setup'});state=await migration.advance(lease,state.generation,{interaction:'prohibited'});expect(state.phase).toBe('keychain_verified');
  if(corrupt){f.authDb.exec("UPDATE plugin_auth_private SET value='late-bad' WHERE id='resource-client'");await expect(migration.advance(lease,state.generation,{interaction:'prohibited'})).rejects.toMatchObject({code:'recovery_required'});expect(journal.verify(f.key).phase).toBe('keychain_verified');}
  else{state=await migration.advance(lease,state.generation,{interaction:'prohibited'});expect(state.phase).toBe('keychain_authoritative');expect(item).toEqual(f.key);expect(f.validate()).toEqual(f.baseline.expected);}
 }finally{item?.fill(0);journal.release(lease);f.cleanup();}}
});
