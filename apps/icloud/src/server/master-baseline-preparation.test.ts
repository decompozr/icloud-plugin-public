import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,chmodSync,symlinkSync,linkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {installation} from './installation.js';
import {readSettings,custodyDirectory} from './settings.js';
import {InstallationAccess} from './installation-access.js';
import {prepareExistingMasterBaseline} from './master-baseline-preparation.js';
import {MasterAuthorityJournal} from '../storage/master-authority.js';
import type {MasterBaselineSelection} from '../storage/master-baseline-capture.js';
import {ownerAuthSecret,resourceClientStorageId,sealResourceClient} from '../auth/key-contexts.js';
import {SqliteOutboundLedger} from '../mail/storage/outbound-ledger.js';
import {SqliteCalendarLedger} from '../calendar/storage/ledger.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-master-baseline-preparation-')),config=join(directory,'config.toml');
 writeFileSync(config,'public_origin="https://example.test"\nprivate_origin="https://example.test:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"');
 const settings=readSettings(config),initial=installation(settings,true);initial.store.enroll({proof:readFileSync(join(directory,'custody/bootstrap-proof'),'utf8'),ownerId:'owner'});initial.store.addAccount('owner',{user:'fixture@example.invalid',credential:Buffer.from('synthetic-password')});initial.store.close();initial.masterKey.fill(0);
 const key=readFileSync(settings.master_key_file),ownerPath=join(settings.state_directory,'owner.sqlite'),authPath=join(settings.state_directory,'auth.sqlite'),db=new Database(authPath);
 const requiredAuthRecordId=resourceClientStorageId('https://fixture.invalid/auth','https://fixture.invalid/mcp');db.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');db.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(requiredAuthRecordId,sealResourceClient(ownerAuthSecret(key,'remote'),JSON.stringify({client_id:'fixture',client_secret:'synthetic-secret'})));
 const mail=new SqliteOutboundLedger(db,key,()=> 'owner');mail.claim(randomUUID(),'synthetic-digest','<fixture@example.invalid>');mail.dispose();const calendar=new SqliteCalendarLedger({database:db,masterKey:key});calendar.setPolicy('owner',{read:true,write:false,schedule:false,share:false});calendar.close();db.close();chmodSync(authPath,0o600);
 const installationId=JSON.parse(readFileSync(settings.installation_marker,'utf8')).id as string,journal=new MasterAuthorityJournal(custodyDirectory(settings),installationId),lease=journal.acquire(randomUUID());try{journal.provision(lease,key);}finally{lease.release();}
 settings.custody={format:1,master_backend:'file',installation_id:installationId,minimum_generation:1};
 const selection:MasterBaselineSelection={ownerId:'owner',ownerFormat:'accounts-v2',requiredAuthRecordId,presence:{auth:true,mail:true,calendar:true,accountCustody:false},historicalAccountIdentities:[]};
 return{directory,settings,key,journal,selection,ownerPath,authPath,prepare:()=>prepareExistingMasterBaseline(settings,randomUUID(),selection),cleanup(){key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}
test('existing-path preparation preserves IDs/key/DBs and releases both leases after baseline establishment',()=>{
 const f=fixture();try{const before=[readFileSync(f.settings.master_key_file),readFileSync(f.settings.installation_marker),readFileSync(f.ownerPath),readFileSync(f.authPath)],baseline=f.prepare();
  expect(baseline.installationId).toBe(f.journal.installationId);expect(baseline.ownerId).toBe('owner');expect(baseline.expected.owner.accounts).toBe(1);expect(baseline.expected.mail?.pending).toBe(1);expect(Object.isFrozen(baseline)).toBe(true);
  expect([readFileSync(f.settings.master_key_file),readFileSync(f.settings.installation_marker),readFileSync(f.ownerPath),readFileSync(f.authPath)]).toEqual(before);expect(f.journal.verify(f.key).baseline?.phase).toBe('established');expect(existsSync(f.journal.lockPath)).toBe(false);expect(existsSync(join(custodyDirectory(f.settings),'installation-access.lock'))).toBe(false);
 }finally{f.cleanup();}
});
test('missing original files fail without creating key, DB, marker or baseline',()=>{
 for(const field of ['key','marker','owner','auth'] as const){const f=fixture();try{
  const path={key:f.settings.master_key_file,marker:f.settings.installation_marker,owner:f.ownerPath,auth:f.authPath}[field];rmSync(path);expect(()=>f.prepare()).toThrow('recovery_required');expect(existsSync(path)).toBe(false);expect(existsSync(join(custodyDirectory(f.settings),'master-consumer-baseline.json'))).toBe(false);expect(f.journal.verify(f.key).format).toBe(1);expect(existsSync(f.journal.lockPath)).toBe(false);
 }finally{f.cleanup();}}
});
test('unsafe key/DB/symlink/sidecar paths cannot supply baseline state',()=>{
 for(const scenario of ['key-size','key-mode','owner-link','auth-symlink','sidecar-mode'] as const){const f=fixture();try{
  if(scenario==='key-size')writeFileSync(f.settings.master_key_file,Buffer.alloc(31));if(scenario==='key-mode')chmodSync(f.settings.master_key_file,0o644);if(scenario==='owner-link')linkSync(f.ownerPath,join(f.directory,'owner-link'));
  if(scenario==='auth-symlink'){const target=join(f.directory,'auth-copy');writeFileSync(target,readFileSync(f.authPath),{mode:0o600});rmSync(f.authPath);symlinkSync(target,f.authPath);}
  if(scenario==='sidecar-mode'){writeFileSync(f.authPath+'-wal','synthetic-unsafe-sidecar',{mode:0o600});chmodSync(f.authPath+'-wal',0o644);}
  expect(()=>f.prepare()).toThrow('recovery_required');expect(existsSync(join(custodyDirectory(f.settings),'master-consumer-baseline.json'))).toBe(false);expect(f.journal.verify(f.key).format).toBe(1);
 }finally{f.cleanup();}}
});
test('live cooperating runtime blocks preparation before a missing key can be touched',()=>{
 const f=fixture(),access=InstallationAccess.acquire(custodyDirectory(f.settings),'runtime');try{rmSync(f.settings.master_key_file);expect(()=>f.prepare()).toThrow('conflict');expect(existsSync(f.settings.master_key_file)).toBe(false);access.assert();}finally{access.release();f.cleanup();}
});
test('native selection, missing authority and unsupported legacy policy never adopt or fallback',()=>{
 for(const scenario of ['native','container','missing-manifest','unconfigured','floor'] as const){const f=fixture();try{
  if(scenario==='container')f.settings.runtime_mode='container';
  if(scenario==='native')f.settings.custody!.master_backend='keychain';if(scenario==='missing-manifest')rmSync(f.journal.path);if(scenario==='unconfigured')f.settings.custody=undefined;if(scenario==='floor')f.settings.custody!.minimum_generation=2;
  const before=[readFileSync(f.settings.master_key_file),readFileSync(f.ownerPath),readFileSync(f.authPath)];expect(()=>f.prepare()).toThrow();expect([readFileSync(f.settings.master_key_file),readFileSync(f.ownerPath),readFileSync(f.authPath)]).toEqual(before);expect(existsSync(join(custodyDirectory(f.settings),'master-consumer-baseline.json'))).toBe(false);if(scenario==='missing-manifest')expect(existsSync(f.journal.path)).toBe(false);
 }finally{f.cleanup();}}
});
test('established-file loss refuses fresh preparation and preserves format-2 authority',()=>{
 const f=fixture();try{f.prepare();const before=readFileSync(f.journal.path),path=join(custodyDirectory(f.settings),'master-consumer-baseline.json');rmSync(path);expect(()=>f.prepare()).toThrow('recovery_required');expect(readFileSync(f.journal.path)).toEqual(before);expect(existsSync(path)).toBe(false);}finally{f.cleanup();}
});
test('held-file guards reject late key changes and byte-identical DB replacement before persistence',()=>{
 for(const scenario of ['key','auth'] as const){const f=fixture();try{
  const selection={...f.selection,get historicalAccountIdentities(){if(scenario==='key')writeFileSync(f.settings.master_key_file,Buffer.alloc(32,31));else{const bytes=readFileSync(f.authPath);rmSync(f.authPath);writeFileSync(f.authPath,bytes,{mode:0o600});}return[];}};
  expect(()=>prepareExistingMasterBaseline(f.settings,randomUUID(),selection)).toThrow('recovery_required');expect(f.journal.verify(f.key).format).toBe(1);expect(existsSync(join(custodyDirectory(f.settings),'master-consumer-baseline.json'))).toBe(false);expect(existsSync(f.journal.lockPath)).toBe(false);
 }finally{f.cleanup();}}
});
test('existing-path preparation permits genuine SQLite hot-journal recovery without application repair',async()=>{
 const f=fixture();try{
  const db=new Database(f.ownerPath);db.exec('PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; CREATE TABLE synthetic_crash_spill(id INTEGER PRIMARY KEY,bytes BLOB NOT NULL)');db.transaction(()=>{const insert=db.query('INSERT INTO synthetic_crash_spill(bytes) VALUES(?)');for(let index=0;index<500;index++)insert.run(Buffer.alloc(4096,7));})();db.close();
  const child=Bun.spawn([process.execPath,new URL('./custody-startup.worker.ts',import.meta.url).pathname],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});child.stdin.write(JSON.stringify({databasePath:f.ownerPath}));child.stdin.end();
  const deadline=setTimeout(()=>child.kill('SIGKILL'),10000);try{expect(await child.exited).toBe(137);}finally{clearTimeout(deadline);if(child.exitCode===null){child.kill('SIGKILL');await child.exited;}}
  expect(readFileSync(f.ownerPath+'-journal').subarray(0,8).toString('hex')).toBe('d9d505f920a163d7');
  const before=[readFileSync(f.settings.master_key_file),readFileSync(f.settings.installation_marker),readFileSync(f.authPath)],baseline=f.prepare();expect(baseline.expected.owner.accounts).toBe(1);
  const check=new Database(f.ownerPath,{readonly:true});try{expect(check.query("SELECT count(*) AS changed FROM synthetic_crash_spill WHERE hex(substr(bytes,1,1))<>'07'").get()).toEqual({changed:0});}finally{check.close();}
  expect([readFileSync(f.settings.master_key_file),readFileSync(f.settings.installation_marker),readFileSync(f.authPath)]).toEqual(before);
 }finally{f.cleanup();}
},15000);
