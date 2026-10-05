import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Database} from 'bun:sqlite';
import {installArtifact,uninstallArtifact} from './install.js';
import {currentCustodyCompatibility} from './artifact.js';
import {readSettings,custodyDirectory} from '../../../apps/icloud/src/server/settings.js';
import {installation} from '../../../apps/icloud/src/server/installation.js';
import {MasterAuthorityJournal} from '../../../apps/icloud/src/storage/master-authority.js';
import {InstallationAccess} from '../../../apps/icloud/src/server/installation-access.js';

async function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-install-custody-')),source=join(directory,'artifact'),prefix=join(directory,'install');mkdirSync(join(source,'apps/icloud/dist'),{recursive:true});writeFileSync(join(source,'runtime.sh'),'#!/bin/sh\n');writeFileSync(join(source,'apps/icloud/dist/index.js'),'// synthetic artifact');
 const metadata={format:1,name:'icloud-plugin',version:'0.1.0',platform:process.platform,arch:process.arch,bun:Bun.version,custodyCompatibility:currentCustodyCompatibility};writeFileSync(join(source,'artifact.json'),JSON.stringify(metadata));await installArtifact(source,prefix);
 const runtime=join(prefix,'runtime');mkdirSync(runtime,{mode:0o700});const config=join(runtime,'config.toml'),base='public_origin="https://example.test"\nprivate_origin="https://example.test:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"';writeFileSync(config,base,{mode:0o600});const settings=readSettings(config),initial=installation(settings,true);initial.store.close();initial.masterKey.fill(0);
 const key=readFileSync(settings.master_key_file),installationId=JSON.parse(readFileSync(settings.installation_marker,'utf8')).id as string,journal=new MasterAuthorityJournal(custodyDirectory(settings),installationId),policy='\n[custody]\nformat=1\nmaster_backend="file"\ninstallation_id="'+installationId+'"\nminimum_generation=1';
 const writeMetadata=(value:unknown={...metadata,version:'0.2.0'})=>writeFileSync(join(source,'artifact.json'),JSON.stringify(value));writeMetadata();
 const adopt=()=>{const lease=journal.acquire(randomUUID());try{journal.provision(lease,key);}finally{lease.release();}writeFileSync(config,base+policy);};
 return{directory,source,prefix,config,base,settings,key,journal,metadata,writeMetadata,adopt,cleanup(){key.fill(0);rmSync(directory,{recursive:true,force:true});}};
}
test('compatible initialized update preserves private bytes and releases exclusion after selection',async()=>{
 const f=await fixture();try{f.adopt();const paths=[f.config,f.settings.master_key_file,f.settings.installation_marker,join(f.settings.state_directory,'owner.sqlite')],before=paths.map(path=>readFileSync(path));await installArtifact(f.source,f.prefix,true);
  expect(readlinkSync(join(f.prefix,'current'))).toContain('0.2.0');expect(paths.map(path=>readFileSync(path))).toEqual(before);expect(readdirSync(custodyDirectory(f.settings))).not.toContain('installation-access.lock');expect(f.journal.verify(f.key).generation).toBe(1);
 }finally{f.cleanup();}
});
test('unsupported authority, account journals and legacy candidates reject before deployment writes',async()=>{
 for(const scenario of ['format2','native','partial-account','legacy-artifact','missing-key'] as const){const f=await fixture();try{
  f.adopt();if(scenario==='format2'){const lease=f.journal.acquire(randomUUID());try{f.journal.beginBaseline(lease,f.key,1,'0'.repeat(64));}finally{lease.release();}}
  if(scenario==='native')writeFileSync(f.config,readFileSync(f.config,'utf8').replace('master_backend="file"','master_backend="keychain"'));
  if(scenario==='partial-account'){const db=new Database(join(f.settings.state_directory,'owner.sqlite'));db.exec('CREATE TABLE account_custody_meta(id INTEGER)');db.close();}
  if(scenario==='legacy-artifact')f.writeMetadata({...f.metadata,version:'0.2.0',custodyCompatibility:undefined});if(scenario==='missing-key')rmSync(f.settings.master_key_file);
  const current=readlinkSync(join(f.prefix,'current')),entries=readdirSync(join(f.prefix,'releases')),config=readFileSync(f.config),state=readFileSync(join(f.settings.state_directory,'owner.sqlite'));
  await expect(installArtifact(f.source,f.prefix,true)).rejects.toThrow('compatibility unavailable');expect(readlinkSync(join(f.prefix,'current'))).toBe(current);expect(readdirSync(join(f.prefix,'releases'))).toEqual(entries);expect(readFileSync(f.config)).toEqual(config);expect(readFileSync(join(f.settings.state_directory,'owner.sqlite'))).toEqual(state);
 }finally{f.cleanup();}}
});
test('running runtime or unresolved SQLite recovery prevents update without taking over evidence',async()=>{
 for(const scenario of ['runtime','journal'] as const){const f=await fixture();let access:InstallationAccess|undefined;try{
  f.adopt();if(scenario==='runtime')access=InstallationAccess.acquire(custodyDirectory(f.settings),'runtime');else writeFileSync(join(f.settings.state_directory,'owner.sqlite-journal'),'synthetic-recovery-evidence',{mode:0o600});
  const current=readlinkSync(join(f.prefix,'current'));await expect(installArtifact(f.source,f.prefix,true)).rejects.toThrow('compatibility unavailable');expect(readlinkSync(join(f.prefix,'current'))).toBe(current);if(access)access.assert();else expect(readFileSync(join(f.settings.state_directory,'owner.sqlite-journal'),'utf8')).toBe('synthetic-recovery-evidence');
 }finally{access?.release();f.cleanup();}}
});
test('retained-state reinstall is inspected; external config must be explicitly selected',async()=>{
 const f=await fixture();try{f.adopt();const external=join(f.directory,'external-config.toml');writeFileSync(external,readFileSync(f.config),{mode:0o600});
  // Relative private paths must continue to point at the original installation.
  writeFileSync(external,readFileSync(f.config,'utf8').replace('state_directory="state"','state_directory='+JSON.stringify(f.settings.state_directory)).replace('master_key_file="custody/key"','master_key_file='+JSON.stringify(f.settings.master_key_file)).replace('installation_marker="custody/marker"','installation_marker='+JSON.stringify(f.settings.installation_marker)));
  rmSync(f.config);await expect(installArtifact(f.source,f.prefix,true)).rejects.toThrow('compatibility unavailable');
  const child=Bun.spawn([process.execPath,join(import.meta.dir,'install.ts'),'update',f.source,f.prefix,'--config',external],{stdout:'pipe',stderr:'pipe'});expect(await child.exited).toBe(0);expect(readlinkSync(join(f.prefix,'current'))).toContain('0.2.0');
  await uninstallArtifact(f.prefix);f.writeMetadata({...f.metadata,version:'0.3.0'});await installArtifact(f.source,f.prefix,false,external);expect(readlinkSync(join(f.prefix,'current'))).toContain('0.3.0');expect(readFileSync(f.settings.master_key_file)).toEqual(f.key);
 }finally{f.cleanup();}
});
test('auth-only state or DB companions never become a fresh unguarded installation',async()=>{
 for(const scenario of ['config-present','config-missing','auth-companion'] as const){const f=await fixture();try{
  rmSync(join(f.settings.state_directory,'owner.sqlite'));rmSync(custodyDirectory(f.settings),{recursive:true,force:true});
  const auth=join(f.settings.state_directory,'auth.sqlite'),db=new Database(auth);db.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT)');db.close();
  let retained=auth;if(scenario==='config-missing')rmSync(f.config);if(scenario==='auth-companion'){rmSync(auth);retained=auth+'-journal';writeFileSync(retained,'synthetic-unresolved-auth-journal',{mode:0o600});}
  f.writeMetadata({...f.metadata,version:'0.2.0',custodyCompatibility:undefined});const before=readFileSync(retained),current=readlinkSync(join(f.prefix,'current')),releases=readdirSync(join(f.prefix,'releases'));
  await expect(installArtifact(f.source,f.prefix,true)).rejects.toThrow('compatibility unavailable');expect(readFileSync(retained)).toEqual(before);expect(readlinkSync(join(f.prefix,'current'))).toBe(current);expect(readdirSync(join(f.prefix,'releases'))).toEqual(releases);
 }finally{f.cleanup();}}
});
test('runtime initialization holds exclusion before owner creation and cannot be treated as fresh',async()=>{
 const f=await fixture();let access:InstallationAccess|undefined;try{
  rmSync(join(f.settings.state_directory,'owner.sqlite'));rmSync(custodyDirectory(f.settings),{recursive:true,force:true});mkdirSync(custodyDirectory(f.settings),{mode:0o700});access=InstallationAccess.acquire(custodyDirectory(f.settings),'runtime');
  f.writeMetadata({...f.metadata,version:'0.2.0',custodyCompatibility:undefined});const current=readlinkSync(join(f.prefix,'current')),proof=readFileSync(join(custodyDirectory(f.settings),'installation-access.lock/access.json'));
  await expect(installArtifact(f.source,f.prefix,true)).rejects.toThrow('compatibility unavailable');access.assert();expect(readFileSync(join(custodyDirectory(f.settings),'installation-access.lock/access.json'))).toEqual(proof);expect(readlinkSync(join(f.prefix,'current'))).toBe(current);
 }finally{access?.release();f.cleanup();}
});
