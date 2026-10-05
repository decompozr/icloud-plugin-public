import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {SqliteOwnerStore} from './owner-store.js';
import {MasterAuthorityJournal} from './master-authority.js';
import {MasterConsumerBaselineStore} from './master-consumer-baseline.js';
import {AccountAuthorityJournal} from './account-authority.js';
import {InstallationAccess} from '../server/installation-access.js';
import {captureAndEstablishMasterBaseline,type MasterBaselineSelection} from './master-baseline-capture.js';
import {ownerAuthSecret,resourceClientStorageId,sealResourceClient} from '../auth/key-contexts.js';
import {SqliteOutboundLedger} from '../mail/storage/outbound-ledger.js';
import {SqliteCalendarLedger} from '../calendar/storage/ledger.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-master-baseline-capture-')),key=Buffer.alloc(32,29),ownerPath=join(directory,'owner.sqlite'),authPath=join(directory,'auth.sqlite'),markerPath=join(directory,'marker');
 const store=SqliteOwnerStore.provision({databasePath:ownerPath,markerPath,masterKey:key,bootstrapProof:'synthetic-master-baseline-bootstrap-proof'});store.enroll({proof:'synthetic-master-baseline-bootstrap-proof',ownerId:'owner'});
 const accounts=['a','b'].map(user=>store.addAccount('owner',{user:user+'@example.invalid',credential:Buffer.from('synthetic-password-'+user)}));
 store.revokeAccountSecret('owner',accounts[1]!.id);store.replaceProviderSession('owner',accounts[0]!.id,'photos_web',store.providerSessionState('owner',accounts[0]!.id,'photos_web'),Buffer.from('synthetic-session'));
 const ownerDatabase=new Database(ownerPath),authDatabase=new Database(authPath);ownerDatabase.exec('PRAGMA synchronous=FULL');
 const requiredAuthRecordId=resourceClientStorageId('https://fixture.invalid/auth','https://fixture.invalid/mcp');authDatabase.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
 authDatabase.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(requiredAuthRecordId,sealResourceClient(ownerAuthSecret(key,'remote'),JSON.stringify({client_id:'synthetic-client',client_secret:'synthetic-secret'})));
 for(const account of accounts){const ledger=new SqliteOutboundLedger(authDatabase,key,()=>JSON.stringify(['owner',account.id]));const operationId=randomUUID();ledger.claim(operationId,'synthetic-digest','<fixture@example.invalid>');if(account===accounts[0])ledger.finish(operationId,{operationId,messageId:'<fixture@example.invalid>',status:'unknown',replayed:false});ledger.dispose();}
 const calendar=new SqliteCalendarLedger({database:authDatabase,masterKey:key});calendar.setPolicy('owner',{read:true,write:false,schedule:false,share:false});for(const account of accounts)calendar.commitSync({ownerId:'owner',accountId:account.id},'https://fixture.invalid/calendar',undefined,{token:'synthetic-token',snapshot:{},changes:[]});calendar.close();
 const installationId=JSON.parse(readFileSync(markerPath,'utf8')).id as string,access=InstallationAccess.acquire(directory,'maintenance'),journal=new MasterAuthorityJournal(directory,installationId),lease=journal.acquire(randomUUID());journal.provision(lease,key);
 const selection:MasterBaselineSelection={ownerId:'owner',ownerFormat:'accounts-v2',requiredAuthRecordId,presence:{auth:true,mail:true,calendar:true,accountCustody:false},historicalAccountIdentities:[]};
 const options={journal,lease,access,masterKey:key,minimumMasterGeneration:1,ownerDatabase,authDatabase,markerPath,selection};
 return{directory,key,ownerPath,authPath,markerPath,store,accounts,options,journal,lease,access,selection,ownerDatabase,authDatabase,capture:()=>captureAndEstablishMasterBaseline(options),cleanup(){lease.release();access.release();authDatabase.close();ownerDatabase.close();store.close();key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}
test('capture includes connected and revoked accounts and all consumers without changing DB/identity/key',()=>{
 const f=fixture();try{
  const custody=AccountAuthorityJournal.provision(f.ownerDatabase,f.journal.installationId,f.key,f.store);custody.close();f.selection.presence.accountCustody=true;
  const before=[readFileSync(f.ownerPath),readFileSync(f.authPath),readFileSync(f.markerPath)],baseline=f.capture();
  expect(baseline.expected).toEqual({owner:{format:1,accounts:2,accountCiphertexts:1,providerSessions:1,providerCiphertexts:1,legacyCiphertexts:0},auth:{format:1,records:1},mail:{format:1,records:2,encrypted:1,pending:1},calendar:{format:1,policies:1,operations:0,sync:2},accountCustody:{format:1,records:2,cleanup:0}});
  expect(baseline.calendarAccountIdentities.map(value=>value.accountId).sort()).toEqual(f.accounts.map(value=>value.id).sort());expect(baseline.mailOwnerNamespaces).toContain('owner');expect(baseline.mailOwnerNamespaces).toHaveLength(3);
  expect(Object.isFrozen(baseline.calendarAccountIdentities[0])).toBe(true);expect(f.key).toEqual(Buffer.alloc(32,29));expect([readFileSync(f.ownerPath),readFileSync(f.authPath),readFileSync(f.markerPath)]).toEqual(before);
  expect(f.journal.verify(f.key).baseline?.phase).toBe('established');expect(new MasterConsumerBaselineStore(f.journal).read(f.key,{operationId:f.lease.operationId,minimumMasterGeneration:1})).toEqual(baseline);
 }finally{f.cleanup();}
});
test('explicit consumer presence rejects missing/hidden tables rather than capturing absence',()=>{
 for(const scenario of ['missing-mail','hidden-calendar','partial-custody','wrong-db'] as const){const f=fixture();try{
  if(scenario==='missing-mail')f.authDatabase.exec('DROP TABLE icloudOutbound');if(scenario==='hidden-calendar')f.selection.presence.calendar=false;
  if(scenario==='partial-custody')f.ownerDatabase.exec('CREATE TABLE account_custody_meta(id INTEGER)');if(scenario==='wrong-db')f.ownerDatabase.exec('CREATE TABLE plugin_auth_private(id TEXT,value TEXT)');
  expect(()=>f.capture()).toThrow('recovery_required');expect(f.journal.verify(f.key).format).toBe(1);expect(existsSync(join(f.directory,'master-consumer-baseline.json'))).toBe(false);
 }finally{f.cleanup();}}
});
test('retained unknown account namespaces require independently approved historical identities',()=>{
 const f=fixture();try{const history={ownerId:'owner',accountId:randomUUID()},ledger=new SqliteOutboundLedger(f.authDatabase,f.key,()=>JSON.stringify([history.ownerId,history.accountId]));ledger.claim(randomUUID(),'synthetic-digest','<history@example.invalid>');ledger.dispose();
  expect(()=>f.capture()).toThrow('recovery_required');expect(f.journal.verify(f.key).format).toBe(1);
  f.selection.historicalAccountIdentities=[history,history];const baseline=f.capture();expect(baseline.calendarAccountIdentities).toHaveLength(3);expect(baseline.expected.mail?.pending).toBe(2);expect(f.ownerDatabase.query('SELECT id FROM mail_accounts WHERE id=?').get(history.accountId)).toBeNull();
 }finally{f.cleanup();}
});
test('corrupt consumers and wrong key cannot establish a fresh baseline',()=>{
 for(const scenario of ['owner','auth','mail','calendar','key'] as const){const f=fixture();try{
  if(scenario==='owner')f.ownerDatabase.exec("UPDATE provider_sessions SET secret='bad'");if(scenario==='auth')f.authDatabase.exec("UPDATE plugin_auth_private SET value='bad'");if(scenario==='mail')f.authDatabase.exec("UPDATE icloudOutbound SET receipt=x'00' WHERE receipt IS NOT NULL");if(scenario==='calendar')f.authDatabase.exec("UPDATE calendar_ledger SET payload='bad'");
  if(scenario==='key')f.options.masterKey=Buffer.alloc(32,31);
  expect(()=>f.capture()).toThrow('recovery_required');expect(f.journal.verify(f.key).format).toBe(1);expect(existsSync(join(f.directory,'master-consumer-baseline.json'))).toBe(false);
 }finally{f.cleanup();}}
});
test('established baseline loss rejects capture before any new inventory can be selected',()=>{
 const f=fixture();try{f.capture();const before=readFileSync(f.journal.path);rmSync(join(f.directory,'master-consumer-baseline.json'));f.selection.requiredAuthRecordId=null;f.selection.presence.auth=false;
  expect(()=>f.capture()).toThrow('conflict');expect(readFileSync(f.journal.path)).toEqual(before);expect(existsSync(join(f.directory,'master-consumer-baseline.json'))).toBe(false);
 }finally{f.cleanup();}
});
test('an unrelated installation maintenance lease cannot authorize capture',()=>{
 const f=fixture(),other=mkdtempSync(join(tmpdir(),'icloud-master-baseline-capture-')),access=InstallationAccess.acquire(other,'maintenance');try{
  expect(()=>captureAndEstablishMasterBaseline({...f.options,access})).toThrow('conflict');expect(f.journal.verify(f.key).format).toBe(1);
 }finally{access.release();rmSync(other,{recursive:true,force:true});f.cleanup();}
});
test('capture works with existing read-only handles without schema changes or construction',()=>{
 const f=fixture(),ownerDatabase=new Database(f.ownerPath,{readonly:true}),authDatabase=new Database(f.authPath,{readonly:true});try{
  const before=[readFileSync(f.ownerPath),readFileSync(f.authPath)],baseline=captureAndEstablishMasterBaseline({...f.options,ownerDatabase,authDatabase});
  expect(baseline.expected.owner.accounts).toBe(2);expect(baseline.expected.mail?.pending).toBe(1);expect([readFileSync(f.ownerPath),readFileSync(f.authPath)]).toEqual(before);
 }finally{authDatabase.close();ownerDatabase.close();f.cleanup();}
});
test('independently required authority generation floor rejects older capture without persistence',()=>{
 const f=fixture();try{expect(()=>captureAndEstablishMasterBaseline({...f.options,minimumMasterGeneration:2})).toThrow('recovery_required');expect(f.journal.verify(f.key).format).toBe(1);expect(existsSync(join(f.directory,'master-consumer-baseline.json'))).toBe(false);}finally{f.cleanup();}
});
