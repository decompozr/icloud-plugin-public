import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,chmodSync,symlinkSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InstallationAccess} from './installation-access.js';
import {installation} from './installation.js';
import {readSettings} from './settings.js';
import {Database} from 'bun:sqlite';
const worker=new URL('./installation-access.worker.ts',import.meta.url).pathname;
function fixture(){const directory=mkdtempSync(join(tmpdir(),'icloud-installation-access-'));return{directory,lock:join(directory,'installation-access.lock'),cleanup(){rmSync(directory,{recursive:true,force:true});}};}
test('runtime and maintenance exclude each other, including a second runtime',()=>{
 const f=fixture();try{const runtime=InstallationAccess.acquire(f.directory,'runtime');
  expect(()=>InstallationAccess.acquire(f.directory,'runtime')).toThrow('conflict');expect(()=>InstallationAccess.acquire(f.directory,'maintenance')).toThrow('conflict');
  expect(()=>runtime.assertStoppedMaintenance()).toThrow('conflict');runtime.assert();runtime.release();expect(()=>runtime.assert()).toThrow('conflict');
  const maintenance=InstallationAccess.acquire(f.directory,'maintenance');maintenance.assertStoppedMaintenance();expect(()=>InstallationAccess.acquire(f.directory,'runtime')).toThrow('conflict');maintenance.release();expect(existsSync(f.lock)).toBe(false);
 }finally{f.cleanup();}
});
test('another Bun process is excluded until explicit release',async()=>{
 const f=fixture();try{const maintenance=InstallationAccess.acquire(f.directory,'maintenance');
  const blocked=Bun.spawn([process.execPath,worker,f.directory],{stdout:'pipe',stderr:'pipe'});expect(await blocked.exited).toBe(1);expect(await new Response(blocked.stderr).text()).toBe('blocked\n');
  maintenance.release();const accepted=Bun.spawn([process.execPath,worker,f.directory],{stdout:'pipe',stderr:'pipe'});expect(await accepted.exited).toBe(0);expect(await new Response(accepted.stdout).text()).toBe('acquired\n');expect(existsSync(f.lock)).toBe(false);
 }finally{f.cleanup();}
});
test('SIGKILL retains exact evidence and never auto-steals a dead PID lock',async()=>{
 const f=fixture();const child=Bun.spawn([process.execPath,worker,f.directory,'hold'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 try{const reader=child.stdout.getReader();const ready=await reader.read();expect(new TextDecoder().decode(ready.value)).toBe('acquired\n');reader.releaseLock();
  const before=readFileSync(join(f.lock,'access.json'));child.kill('SIGKILL');await child.exited;
  expect(()=>InstallationAccess.acquire(f.directory,'maintenance')).toThrow('conflict');expect(()=>InstallationAccess.acquire(f.directory,'runtime')).toThrow('conflict');expect(readFileSync(join(f.lock,'access.json'))).toEqual(before);
 }finally{child.kill();await child.exited;f.cleanup();}
});
test('incomplete legacy-looking lock is not repaired or removed',()=>{
 const f=fixture();try{mkdirSync(f.lock,{mode:0o700});expect(()=>InstallationAccess.acquire(f.directory,'maintenance')).toThrow('conflict');expect(existsSync(join(f.lock,'access.json'))).toBe(false);}finally{f.cleanup();}
});
test('proof changes deny assertions and release without deleting evidence',()=>{
 const f=fixture();try{const access=InstallationAccess.acquire(f.directory,'maintenance'),path=join(f.lock,'access.json');writeFileSync(path,'changed');expect(()=>access.assertStoppedMaintenance()).toThrow('conflict');expect(()=>access.release()).toThrow('conflict');expect(readFileSync(path,'utf8')).toBe('changed');}finally{f.cleanup();}
});
test('replacement directory with copied proof cannot use the old lease',()=>{
 const f=fixture();try{const access=InstallationAccess.acquire(f.directory,'runtime'),proof=readFileSync(join(f.lock,'access.json'));renameSync(f.lock,join(f.directory,'retained'));mkdirSync(f.lock,{mode:0o700});writeFileSync(join(f.lock,'access.json'),proof,{mode:0o600});expect(()=>access.release()).toThrow('conflict');expect(existsSync(join(f.directory,'retained/access.json'))).toBe(true);expect(readFileSync(join(f.lock,'access.json'))).toEqual(proof);}finally{f.cleanup();}
});
test('private directory, proof permissions and single-link constraints fail closed',()=>{
 const f=fixture();try{chmodSync(f.directory,0o755);expect(()=>InstallationAccess.acquire(f.directory,'runtime')).toThrow('recovery_required');chmodSync(f.directory,0o700);const access=InstallationAccess.acquire(f.directory,'maintenance'),path=join(f.lock,'access.json');chmodSync(path,0o644);expect(()=>access.assert()).toThrow('conflict');chmodSync(path,0o600);linkSync(path,join(f.directory,'linked'));expect(()=>access.release()).toThrow('conflict');expect(existsSync(path)).toBe(true);}finally{f.cleanup();}
});
test('symlink directory is rejected without modifying its target',()=>{
 const f=fixture();try{const alias=join(f.directory,'alias');symlinkSync(f.directory,alias);expect(()=>InstallationAccess.acquire(alias,'runtime')).toThrow('recovery_required');expect(existsSync(f.lock)).toBe(false);}finally{f.cleanup();}
});
test('actual Bun initialization releases access; maintenance blocks entry before key or DB opens',async()=>{
 const f=fixture();try{
  const config=join(f.directory,'config.toml');writeFileSync(config,'public_origin="https://example.test"\nprivate_origin="https://example.test:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"');
  const entry=new URL('../index.ts',import.meta.url).pathname;
  const init=Bun.spawn([process.execPath,entry,'--config',config,'--initialize'],{stdout:'pipe',stderr:'pipe'});expect(await init.exited).toBe(0);expect(existsSync(join(f.directory,'custody/installation-access.lock'))).toBe(false);
  const directory=join(f.directory,'custody'),access=InstallationAccess.acquire(directory,'maintenance'),key=readFileSync(join(directory,'key')),marker=readFileSync(join(directory,'marker')),db=readFileSync(join(f.directory,'state/owner.sqlite')),proof=readFileSync(join(directory,'installation-access.lock/access.json'));
  // Removing only this synthetic key proves exclusion precedes attempted key reads.
  rmSync(join(directory,'key'));
  const start=Bun.spawn([process.execPath,entry,'--config',config],{stdout:'pipe',stderr:'pipe'});expect(await start.exited).toBe(1);expect(await new Response(start.stderr).text()).toContain('Startup failed');
  expect(existsSync(join(directory,'key'))).toBe(false);expect(readFileSync(join(directory,'marker'))).toEqual(marker);expect(readFileSync(join(f.directory,'state/owner.sqlite'))).toEqual(db);expect(readFileSync(join(directory,'installation-access.lock/access.json'))).toEqual(proof);key.fill(0);access.release();
 }finally{f.cleanup();}
});
test('actual listeners retain runtime exclusion until graceful shutdown completes',async()=>{
 const f=fixture();let child:ReturnType<typeof Bun.spawn>|undefined;
 try{
  const reservationA=Bun.serve({port:0,hostname:'127.0.0.1',fetch:()=>new Response('fixture')}),reservationB=Bun.serve({port:0,hostname:'127.0.0.1',fetch:()=>new Response('fixture')});
  const publicPort=reservationA.port,privatePort=reservationB.port;reservationA.stop(true);reservationB.stop(true);
  const config=join(f.directory,'config.toml');writeFileSync(config,'public_origin="https://example.test"\nprivate_origin="https://example.test:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"\npublic_port='+publicPort+'\nprivate_port='+privatePort);
  const entry=new URL('../index.ts',import.meta.url).pathname,init=Bun.spawn([process.execPath,entry,'--config',config,'--initialize'],{stdout:'pipe',stderr:'pipe'});expect(await init.exited).toBe(0);
  const running=Bun.spawn([process.execPath,entry,'--config',config],{stdout:'pipe',stderr:'pipe'});child=running;
  const reader=running.stderr.getReader();let output='';let timeout:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('synthetic startup deadline')),5000);});
  try{while(!output.includes('listeners started')){const part=await Promise.race([reader.read(),deadline]);if(part.done)throw Error('synthetic startup exited');output+=new TextDecoder().decode(part.value);}}finally{clearTimeout(timeout);reader.releaseLock();}
  const directory=join(f.directory,'custody');expect(()=>InstallationAccess.acquire(directory,'maintenance')).toThrow('conflict');
  running.kill('SIGTERM');expect(await running.exited).toBe(0);expect(existsSync(join(directory,'installation-access.lock'))).toBe(false);
  const maintenance=InstallationAccess.acquire(directory,'maintenance');maintenance.assertStoppedMaintenance();maintenance.release();
 }finally{child?.kill();if(child)await child.exited;f.cleanup();}
},10000);
test('actual application-factory rejection retains exclusion instead of assuming successful disposal',async()=>{
 const f=fixture();try{
  const config=join(f.directory,'config.toml');writeFileSync(config,'public_origin="https://example.test"\nprivate_origin="https://example.test:8443"\nstate_directory="state"\nmaster_key_file="custody/key"\ninstallation_marker="custody/marker"');
  const settings=readSettings(config),initial=installation(settings,true);
  try{initial.store.enroll({proof:readFileSync(join(f.directory,'custody/bootstrap-proof'),'utf8'),ownerId:'synthetic-owner'});}finally{initial.store.close();initial.masterKey.fill(0);}
  const db=new Database(join(settings.state_directory,'auth.sqlite'));db.exec('CREATE TABLE passkey(userId TEXT)');db.close();
  const key=readFileSync(settings.master_key_file),marker=readFileSync(settings.installation_marker),entry=new URL('../index.ts',import.meta.url).pathname;
  try{const failed=Bun.spawn([process.execPath,entry,'--config',config],{stdout:'pipe',stderr:'pipe'});expect(await failed.exited).toBe(1);expect(await new Response(failed.stderr).text()).toContain('Startup failed');
   const directory=join(f.directory,'custody'),proof=readFileSync(join(directory,'installation-access.lock/access.json'));expect(()=>InstallationAccess.acquire(directory,'maintenance')).toThrow('conflict');expect(readFileSync(join(directory,'installation-access.lock/access.json'))).toEqual(proof);expect(readFileSync(settings.master_key_file)).toEqual(key);expect(readFileSync(settings.installation_marker)).toEqual(marker);
  }finally{key.fill(0);}
 }finally{f.cleanup();}
});
