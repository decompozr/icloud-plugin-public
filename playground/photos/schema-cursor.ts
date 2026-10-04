import {constants} from 'node:fs';
import {open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {SessionStore} from './session-store';
import {readCloudPersonSchema,type SchemaCursor} from './cloud-person-schema';
import {responseLibrary,type CloudSession} from './cloud-client';
import {ProbeError,type ProbeStage} from './probe-diagnostics';
export function checkedCursor(value:unknown,dsid:string):SchemaCursor {
 const x=value as SchemaCursor;
 if(!x||x.version!==1||Object.keys(x).sort().join()!=='dsid,recordsSeen,syncToken,version,zoneID'||x.dsid!==dsid||!x.zoneID||typeof x.zoneID!=='object'||Array.isArray(x.zoneID)||typeof x.syncToken!=='string'||!x.syncToken.trim()||x.syncToken.length>16384||!Number.isSafeInteger(x.recordsSeen)||x.recordsSeen<0)throw new ProbeError('session_cache_invalid');
 responseLibrary({records:[{zoneID:x.zoneID}]},{database:'private',zoneID:{zoneName:'PrimarySync'}},true);
 return x;
}
export async function resumePersonSchema(session:CloudSession,directory:string,limits={maxPages:2,maxRecords:200},onStage?:(stage:ProbeStage)=>void) {
 // Reuse the already established private-session directory custody checks.
 const saved=await new SessionStore(directory).load();
 if(!saved||saved.dsid!==session.dsid)throw new ProbeError('session_account_mismatch');
 const path=join(directory,'people-schema-cursor.json'),lockPath=join(directory,'.people-schema.lock');
 let lock;
 try{lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch{throw new ProbeError('session_cache_unsafe');}
 let temporary:string|undefined;
 try{
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK).catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});
  let cursor:SchemaCursor|undefined;
  if(file)try{const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid?.()||stat.size>32768)throw new ProbeError('session_cache_unsafe');const b=Buffer.alloc(32769);const {bytesRead}=await file.read(b,0,b.length,0);if(bytesRead>32768)throw new ProbeError('session_cache_invalid');cursor=checkedCursor(JSON.parse(b.subarray(0,bytesRead).toString()),session.dsid);}finally{await file.close();}
  return await readCloudPersonSchema(session,onStage,limits,{cursor,checkpoint:async next=>{
   const body=JSON.stringify(checkedCursor(next,session.dsid));if(Buffer.byteLength(body)>32768)throw new ProbeError('session_cache_invalid');
   temporary=join(directory,`.people-schema-${randomUUID()}.tmp`);
   const output=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{await output.writeFile(body);await output.sync();}finally{await output.close();}
   await rename(temporary,path);temporary=undefined;
  }});
 }finally{if(temporary)await unlink(temporary).catch(()=>{});await lock.close();await unlink(lockPath);}
}
