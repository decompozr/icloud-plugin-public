import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readSettings,custodyDirectory,type AppSettings} from './settings.js';
import {installation} from './installation.js';
import {MasterAuthorityJournal} from '../storage/master-authority.js';
import {AccountAuthorityJournal} from '../storage/account-authority.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-startup-')),path=join(directory,'config.toml');
 const source='public_origin="https://example.test"\nprivate_origin="https://example.test:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"';
 writeFileSync(path,source);const settings=readSettings(path),initial=installation(settings,true);
 initial.store.enroll({proof:readFileSync(join(directory,'custody/bootstrap-proof'),'utf8'),ownerId:'owner'});
 const account=initial.store.addAccount('owner',{user:'synthetic@example.test',credential:Buffer.from('synthetic-opaque-credential')});
 initial.store.close();initial.masterKey.fill(0);
 const key=readFileSync(settings.master_key_file),installationId=JSON.parse(readFileSync(settings.installation_marker,'utf8')).id as string;
 const journal=new MasterAuthorityJournal(custodyDirectory(settings),installationId),operationId=randomUUID();
 const policy:NonNullable<AppSettings['custody']>={format:1,master_backend:'file',installation_id:installationId,minimum_generation:1};
 const auth=join(settings.state_directory,'auth.sqlite');writeFileSync(auth,'untouched-auth-fixture',{mode:0o600});
 return{directory,path,source,settings,key,installationId,journal,operationId,policy,account,auth,
  baseline(){const lease=journal.acquire(operationId);try{journal.provision(lease,key);}finally{lease.release();}},
  cleanup(){key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}
test('stable custody namespace and explicit file adoption preserve installation/account/key/auth state',()=>{
 const f=fixture();try{
  expect(custodyDirectory(f.settings)).toBe(join(f.directory,'custody'));f.baseline();
  writeFileSync(f.path,f.source+'\ncustody_directory="custody"\n[custody]\nformat=1\nmaster_backend="file"\ninstallation_id="'+f.installationId+'"\nminimum_generation=1');
  const settings=readSettings(f.path),marker=readFileSync(settings.installation_marker),auth=readFileSync(f.auth);
  const opened=installation(settings);try{
   expect(opened.masterKey).toEqual(f.key);expect(opened.store.ownerId()).toBe('owner');expect(opened.store.account('owner',f.account.id)).toEqual(f.account);
   expect(Buffer.from(opened.store.readAccountSecret('owner',f.account.id)!)).toEqual(Buffer.from('synthetic-opaque-credential'));
  }finally{opened.store.close();opened.masterKey.fill(0);}
  expect(readFileSync(settings.installation_marker)).toEqual(marker);expect(readFileSync(f.auth)).toEqual(auth);expect(f.journal.verify(f.key).generation).toBe(1);
 }finally{f.cleanup();}
});
test('native selection rejects before file/owner/auth access, including initialization, with no fallback',()=>{
 const f=fixture();try{
  const marker=readFileSync(f.settings.installation_marker),owner=readFileSync(join(f.settings.state_directory,'owner.sqlite')),auth=readFileSync(f.auth);
  rmSync(f.settings.master_key_file);
  const selected={...f.settings,custody:{...f.policy,master_backend:'keychain' as const}};
  expect(()=>installation(selected)).toThrow(/^recovery_required$/);expect(()=>installation(selected,true)).toThrow(/^recovery_required$/);
  expect(readdirSync(custodyDirectory(f.settings))).not.toContain('key');expect(readFileSync(f.settings.installation_marker)).toEqual(marker);
  expect(readFileSync(join(f.settings.state_directory,'owner.sqlite'))).toEqual(owner);expect(readFileSync(f.auth)).toEqual(auth);
 }finally{f.cleanup();}
});
test('actual Bun entry point rejects native custody without opening listeners or creating auth state',async()=>{
 const f=fixture();try{
  rmSync(f.auth);rmSync(f.settings.master_key_file);
  writeFileSync(f.path,f.source+'\n[custody]\nformat=1\nmaster_backend="keychain"\ninstallation_id="'+f.installationId+'"\nminimum_generation=1');
  const child=Bun.spawn([process.execPath,join(import.meta.dir,'../index.ts'),'--config',f.path],{stdin:'ignore',stdout:'pipe',stderr:'pipe'});
  const deadline=setTimeout(()=>child.kill('SIGKILL'),10000);
  try{
   const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
   expect(exit).toBe(1);expect(stdout).toBe('');expect(stderr).toBe('Startup failed. Check required configuration.\n');
  }finally{clearTimeout(deadline);if(child.exitCode===null){child.kill('SIGKILL');await child.exited;}}
  expect(readdirSync(f.settings.state_directory)).not.toContain('auth.sqlite');expect(readdirSync(custodyDirectory(f.settings))).not.toContain('key');
 }finally{f.cleanup();}
});
test('legacy settings cannot ignore authority metadata or initialize over an interrupted baseline',()=>{
 const f=fixture();try{
  f.baseline();const before=readFileSync(f.journal.path);
  expect(()=>installation(f.settings)).toThrow('recovery_required');expect(()=>installation(f.settings,true)).toThrow('recovery_required');
  expect(readFileSync(f.journal.path)).toEqual(before);expect(readFileSync(f.settings.master_key_file)).toEqual(f.key);
 }finally{f.cleanup();}
});
test('known native cutover rejects stale file settings and retains exact master bytes/state',()=>{
 const f=fixture();try{
  f.baseline();const lease=f.journal.acquire(f.operationId);
  try{f.journal.advance(lease,f.key,1,'copy_intent');f.journal.advance(lease,f.key,2,'keychain_verified');f.journal.advance(lease,f.key,3,'keychain_authoritative');}finally{lease.release();}
  const owner=readFileSync(join(f.settings.state_directory,'owner.sqlite'));
  expect(()=>installation({...f.settings,custody:f.policy})).toThrow('recovery_required');
  expect(readFileSync(f.settings.master_key_file)).toEqual(f.key);expect(readFileSync(join(f.settings.state_directory,'owner.sqlite'))).toEqual(owner);
 }finally{f.cleanup();}
});
test('explicit format requires original-key manifest HMAC and installation binding, without regeneration',()=>{
 const f=fixture();try{
  const settings={...f.settings,custody:f.policy};expect(()=>installation(settings)).toThrow('missing');
  f.baseline();const record=readFileSync(f.journal.path),owner=readFileSync(join(f.settings.state_directory,'owner.sqlite'));
  const changed=JSON.parse(record.toString());changed.generation=2;writeFileSync(f.journal.path,JSON.stringify(changed));
  expect(()=>installation(settings)).toThrow('recovery_required');expect(readFileSync(join(f.settings.state_directory,'owner.sqlite'))).toEqual(owner);
  writeFileSync(f.journal.path,record);
  expect(()=>installation({...settings,custody:{...f.policy,installation_id:randomUUID()}})).toThrow('recovery_required');
  expect(()=>installation({...settings,custody:{...f.policy,minimum_generation:2}})).toThrow('recovery_required');
  expect(()=>installation(settings,true)).toThrow('conflict');expect(readFileSync(f.settings.master_key_file)).toEqual(f.key);
 }finally{f.cleanup();}
});
test('unresolved locks/staging block runtime without being deleted or adopted',()=>{
 const f=fixture();try{
  const path=join(custodyDirectory(f.settings),'.master-authority.unknown.pending');writeFileSync(path,'incomplete-synthetic-intent',{mode:0o600});
  expect(()=>installation(f.settings)).toThrow('recovery_required');expect(readFileSync(path,'utf8')).toBe('incomplete-synthetic-intent');rmSync(path);
  mkdirSync(f.journal.lockPath,{mode:0o700});expect(()=>installation(f.settings)).toThrow('recovery_required');expect(readdirSync(f.journal.lockPath)).toEqual([]);
 }finally{f.cleanup();}
});
test('account custody state is rejected before SQLite-only consumers can reinterpret native pointers',()=>{
 const f=fixture();try{
  const opened=installation(f.settings),db=new Database(join(f.settings.state_directory,'owner.sqlite'),{create:false,readwrite:true});db.exec('PRAGMA synchronous=FULL');
  const journal=AccountAuthorityJournal.provision(db,f.installationId,f.key,opened.store);
  try{
   let state=journal.read('owner',f.account.id);const op=randomUUID();state=journal.beginCopy('owner',f.account.id,state.epoch,op);state=journal.markVerified('owner',f.account.id,state.epoch,op);journal.activate('owner',f.account.id,state.epoch,op);
  }finally{journal.close();db.close();opened.store.close();opened.masterKey.fill(0);}
  const owner=readFileSync(join(f.settings.state_directory,'owner.sqlite')),auth=readFileSync(f.auth);
  expect(()=>installation(f.settings)).toThrow('recovery_required');expect(readFileSync(join(f.settings.state_directory,'owner.sqlite'))).toEqual(owner);expect(readFileSync(f.auth)).toEqual(auth);
 }finally{f.cleanup();}
});
test('partial account journals also fail closed without repairing schema',()=>{
 const f=fixture();try{
  const db=new Database(join(f.settings.state_directory,'owner.sqlite'),{create:false,readwrite:true});db.exec('CREATE TABLE account_custody_cleanup(unknown TEXT)');db.close();
  expect(()=>installation(f.settings)).toThrow('recovery_required');
  const check=new Database(join(f.settings.state_directory,'owner.sqlite'),{readonly:true});try{expect(check.query("SELECT name FROM sqlite_master WHERE name='account_custody_meta'").get()).toBeNull();}finally{check.close();}
 }finally{f.cleanup();}
});
test('legacy file startup lets SQLite recover a genuine hot journal without changing credentials or owner',async()=>{
 const f=fixture();try{
  const path=join(f.settings.state_directory,'owner.sqlite'),db=new Database(path,{create:false,readwrite:true});
  db.exec('PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; CREATE TABLE synthetic_crash_spill(id INTEGER PRIMARY KEY,bytes BLOB NOT NULL)');
  db.transaction(()=>{const statement=db.query('INSERT INTO synthetic_crash_spill(bytes) VALUES(?)');for(let i=0;i<500;i++)statement.run(Buffer.alloc(4096,7));})();db.close();
  const child=Bun.spawn([process.execPath,join(import.meta.dir,'custody-startup.worker.ts')],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
  child.stdin.write(JSON.stringify({databasePath:path}));child.stdin.end();
  const deadline=setTimeout(()=>child.kill('SIGKILL'),10000);
  try{const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);expect(exit).toBe(137);expect(stdout).toBe('');expect(stderr).toBe('');}finally{clearTimeout(deadline);if(child.exitCode===null){child.kill('SIGKILL');await child.exited;}}
  // Require the hot magic, rather than treating any empty journal file as crash evidence.
  expect(readFileSync(path+'-journal').subarray(0,8).toString('hex')).toBe('d9d505f920a163d7');
  const marker=readFileSync(f.settings.installation_marker),auth=readFileSync(f.auth),opened=installation(f.settings);
  try{expect(opened.masterKey).toEqual(f.key);expect(opened.store.ownerId()).toBe('owner');expect(opened.store.account('owner',f.account.id)).toEqual(f.account);expect(opened.store.readAccountSecret('owner',f.account.id)).toEqual(Buffer.from('synthetic-opaque-credential'));}
  finally{opened.store.close();opened.masterKey.fill(0);}
  const check=new Database(path,{readonly:true});try{expect(check.query('SELECT count(*) AS changed FROM synthetic_crash_spill WHERE hex(substr(bytes,1,1))<>?').get('07')).toEqual({changed:0});}finally{check.close();}
  expect(readFileSync(f.settings.installation_marker)).toEqual(marker);expect(readFileSync(f.auth)).toEqual(auth);
 }finally{f.cleanup();}
});
test('settings reject unsupported formats and native container custody; startup rejects path shadowing',()=>{
 const f=fixture();try{
  for(const addition of ['\n[custody]\nformat=2\nmaster_backend="file"','\nruntime_mode="container"\n[custody]\nformat=1\nmaster_backend="keychain"\ninstallation_id="'+f.installationId+'"\nminimum_generation=1']){writeFileSync(f.path,f.source+addition);expect(()=>readSettings(f.path)).toThrow();}
  expect(()=>installation({...f.settings,custody_directory:f.settings.state_directory})).toThrow('invalid_input');
  expect(()=>installation({...f.settings,custody_directory:join(f.directory,'other-custody')})).toThrow('invalid_input');
 }finally{f.cleanup();}
});
