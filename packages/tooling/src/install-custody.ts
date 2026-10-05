import {Database} from 'bun:sqlite';
import {constants,lstatSync,openSync,fstatSync,readSync,closeSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {readSettings,custodyDirectory} from '../../../apps/icloud/src/server/settings.js';
import {custodyStartup} from '../../../apps/icloud/src/server/custody-startup.js';
import {InstallationAccess} from '../../../apps/icloud/src/server/installation-access.js';
import type {Artifact} from './artifact.js';

function exists(path:string):boolean {try{lstatSync(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
function databaseEvidence(path:string):boolean{return ['', '-wal','-shm','-journal'].some(suffix=>exists(path+suffix));}
/** Selected/default configuration only; no live credential reads, repair,
 * initialization, stopping processes or config writes. Metadata compatibility is
 * not signature/provenance verification. Old installers do not gain this gate. */
export function acquireInstallCustodyGuard(artifact:Artifact,prefix:string,selectedConfig?:string):InstallationAccess|null {
 let access:InstallationAccess|undefined,db:Database|undefined,fd:number|undefined,teardownUncertain=false;
 try{
  const config=selectedConfig??join(prefix,'runtime/config.toml');
  if(!exists(config)){
   if(selectedConfig||databaseEvidence(join(prefix,'runtime/state/owner.sqlite'))||databaseEvidence(join(prefix,'runtime/state/auth.sqlite'))||exists(join(prefix,'runtime/custody')))throw Error('missing config');
   return null; // fresh uninitialized installation; no state namespace to acquire
  }
  const configInfo=lstatSync(config);if(!configInfo.isFile()||configInfo.uid!==process.getuid?.()||(configInfo.mode&0o077)!==0||configInfo.nlink!==1||configInfo.size>1048576)throw Error('unsafe config');
  const settings=readSettings(config),journal=custodyStartup(settings,false),ownerPath=join(settings.state_directory,'owner.sqlite');
  if(exists(custodyDirectory(settings))){access=InstallationAccess.acquire(custodyDirectory(settings),'maintenance');custodyStartup(settings,false);access.assertStoppedMaintenance();}
  if(!exists(ownerPath)){
   if(journal||databaseEvidence(ownerPath)||databaseEvidence(join(settings.state_directory,'auth.sqlite'))||exists(settings.master_key_file)||exists(settings.installation_marker))throw Error('partial installation');
   if(access&&readdirSync(custodyDirectory(settings)).some(name=>name!=='installation-access.lock'))throw Error('retained custody evidence');
   return access??null;
  }
  if(!artifact.custodyCompatibility)throw Error('legacy artifact has no compatibility declaration');
  if(!exists(settings.master_key_file)||!exists(settings.installation_marker))throw Error('partial installation');
  // Initialized state requires an existing private namespace and stopped new
  // runtime. Older/custom writers still need independent operator exclusion.
  access??=InstallationAccess.acquire(custodyDirectory(settings),'maintenance');
  custodyStartup(settings,false);access.assertStoppedMaintenance();
  const directory=lstatSync(settings.state_directory);if(!directory.isDirectory()||directory.uid!==process.getuid?.()||(directory.mode&0o077)!==0)throw Error('unsafe state');
  for(const suffix of ['-wal','-shm','-journal'])if(exists(ownerPath+suffix))throw Error('SQLite recovery/checkpoint required');
  fd=openSync(ownerPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const info=fstatSync(fd);
  if(!info.isFile()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0||info.nlink!==1)throw Error('unsafe DB');
  const header=Buffer.alloc(20);if(readSync(fd,header,0,20,0)!==20||header.subarray(0,16).toString('binary')!=='SQLite format 3\0'||header[18]!==1||header[19]!==1)throw Error('unsupported SQLite mode');
  db=new Database(ownerPath,{readonly:true,create:false});
  if(db.query("SELECT name FROM sqlite_master WHERE name IN ('account_custody_meta','account_custody_state','account_custody_cleanup') LIMIT 1").get())throw Error('unsupported account custody');
  const after=lstatSync(ownerPath);if(after.dev!==info.dev||after.ino!==info.ino||after.nlink!==1)throw Error('DB replacement');
  for(const suffix of ['-wal','-shm','-journal'])if(exists(ownerPath+suffix))throw Error('unexpected SQLite companion');
  access.assertStoppedMaintenance();const closingDb=db;db=undefined;try{closingDb.close();}catch(error){teardownUncertain=true;throw error;}
  const closing=fd;fd=undefined;try{closeSync(closing);}catch(error){teardownUncertain=true;throw error;}
  return access; // installer holds through release selection or failure cleanup
 }catch{
  // Teardown must succeed before exclusion is released. All failures stay
  // bounded: never print TOML, database rows, key paths or raw parse errors.
  let closed=!teardownUncertain;try{db?.close();}catch{closed=false;}if(fd!==undefined){const closing=fd;fd=undefined;try{closeSync(closing);}catch{closed=false;}}
  if(closed)try{access?.release();}catch{}
  throw Error('Installation custody compatibility unavailable; retain current release and use explicit stopped recovery');
 }
}
