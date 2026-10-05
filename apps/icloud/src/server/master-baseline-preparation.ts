import {Database} from 'bun:sqlite';
import {constants,lstatSync,fstatSync,openSync,closeSync,readSync,type Stats} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {custodyDirectory,type AppSettings} from './settings.js';
import {custodyStartup} from './custody-startup.js';
import {InstallationAccess} from './installation-access.js';
import {CustodyError} from '../storage/custody-contract.js';
import {type AuthorityLease} from '../storage/master-authority.js';
import {captureAndEstablishMasterBaseline,type MasterBaselineSelection} from '../storage/master-baseline-capture.js';
import type {MasterConsumerBaseline} from '../storage/master-consumer-validation.js';
import {z} from 'zod';

function privateDirectory(path:string):void {
 const info=lstatSync(path);if(!info.isDirectory()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw new CustodyError('recovery_required');
}
function privateFile(info:Stats):void {
 if(!info.isFile()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0||info.nlink!==1)throw new CustodyError('recovery_required');
}
function readAt(fd:number,length:number):Buffer {
 const bytes=Buffer.alloc(length);
 try{if(readSync(fd,bytes,0,length,0)!==length)throw new CustodyError('recovery_required');return bytes;}catch(error){bytes.fill(0);throw error;}
}

/** Inactive administrative file-mode adapter, NOT an operator authentication
 * mechanism or CLI. Caller must authenticate selection and exclude old/custom
 * writers. Requires configured existing format-1 authority; never adopts,
 * provisions, opens owner/auth factories or reads native custody. SQLite handles
 * use create:false/readwrite for ordinary hot-journal recovery, no application
 * schema repair. Held private nofollow single-link files + inode checks detect
 * replacement; this is not isolation against hostile same-user pathname races
 * inside Bun/SQLite's pathname-based constructor. No secrets are returned. */
export function prepareExistingMasterBaseline(settings:AppSettings,operationId:string,selection:MasterBaselineSelection):MasterConsumerBaseline {
 let access:InstallationAccess|undefined,lease:AuthorityLease|undefined,key:Buffer|undefined,marker:Buffer|undefined;
 let ownerDatabase:Database|undefined,authDatabase:Database|undefined,attempted=false;
 const files:{fd:number;path:string;dev:number;ino:number}[]=[];
 try{
  if(settings.runtime_mode!=='native')throw new CustodyError('invalid_input');
  if(!z.string().uuid().safeParse(operationId).success)throw new CustodyError('invalid_input');
  const initial=custodyStartup(settings,false);if(!initial||!settings.custody)throw new CustodyError('conflict');
  access=InstallationAccess.acquire(custodyDirectory(settings),'maintenance');
  const journal=custodyStartup(settings,false);if(!journal)throw new CustodyError('conflict');
  privateDirectory(settings.state_directory);privateDirectory(dirname(settings.installation_marker));
  const inside=relative(settings.state_directory,settings.installation_marker);if(!inside.startsWith('../')&&inside!=='..')throw new CustodyError('invalid_input');
  const openExisting=(path:string)=>{
   const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const file={fd,path,dev:0,ino:0};files.push(file);
   const info=fstatSync(fd);privateFile(info);file.dev=info.dev;file.ino=info.ino;return file;
  };
  const keyFile=openExisting(settings.master_key_file);if(fstatSync(keyFile.fd).size!==32)throw new CustodyError('recovery_required');key=readAt(keyFile.fd,32);
  const expectation={requiredAuthority:'file' as const,minimumGeneration:settings.custody.minimum_generation};
  const record=journal.verify(key,expectation);if(record.format!==1||record.phase!=='file_authoritative')throw new CustodyError('conflict');
  lease=journal.acquire(operationId);
  const markerFile=openExisting(settings.installation_marker),markerSize=fstatSync(markerFile.fd).size;if(markerSize<1||markerSize>4096)throw new CustodyError('recovery_required');marker=readAt(markerFile.fd,markerSize);
  const ownerPath=join(settings.state_directory,'owner.sqlite'),authPath=join(settings.state_directory,'auth.sqlite');openExisting(ownerPath);openExisting(authPath);
  const assertSnapshotFiles=()=>{
   privateDirectory(settings.state_directory);privateDirectory(custodyDirectory(settings));privateDirectory(dirname(settings.installation_marker));
   for(const file of files){const actual=lstatSync(file.path),held=fstatSync(file.fd);privateFile(actual);privateFile(held);if(actual.dev!==file.dev||actual.ino!==file.ino||held.dev!==file.dev||held.ino!==file.ino)throw new CustodyError('recovery_required');}
   if(fstatSync(keyFile.fd).size!==32||fstatSync(markerFile.fd).size!==markerSize)throw new CustodyError('recovery_required');
   const currentKey=readAt(keyFile.fd,32);let currentMarker:Buffer|undefined;
   try{currentMarker=readAt(markerFile.fd,markerSize);if(!currentKey.equals(key!)||!currentMarker.equals(marker!))throw new CustodyError('recovery_required');}finally{currentKey.fill(0);currentMarker?.fill(0);}
   for(const path of [ownerPath,authPath])for(const suffix of ['-wal','-shm','-journal']){try{privateFile(lstatSync(path+suffix));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  };
  assertSnapshotFiles();ownerDatabase=new Database(ownerPath,{create:false,readwrite:true});assertSnapshotFiles();authDatabase=new Database(authPath,{create:false,readwrite:true});assertSnapshotFiles();
  attempted=true;
  return captureAndEstablishMasterBaseline({journal,lease,access,masterKey:key,minimumMasterGeneration:settings.custody.minimum_generation,ownerDatabase,authDatabase,markerPath:settings.installation_marker,selection,assertSnapshotFiles});
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 finally{
  let failed=false;
  for(const db of [authDatabase,ownerDatabase])if(db)try{db.close();}catch{failed=true;}
  for(const file of files.splice(0))try{closeSync(file.fd);}catch{failed=true;}
  key?.fill(0);marker?.fill(0);
  // Never release exclusion when owned handle teardown is uncertain.
  if(!failed){try{lease?.release();}catch{failed=true;}if(!failed)try{access?.release();}catch{failed=true;}}
  if(failed)throw new CustodyError(attempted?'outcome_unknown':'recovery_required');
 }
}
