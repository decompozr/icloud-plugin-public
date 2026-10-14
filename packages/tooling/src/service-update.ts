import {join} from 'node:path';
import {symlink,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
/** Never switch back until the replacement has drained; preserve the pointer on failure. */
export async function restorePreviousRelease(prefix:string,previous:string,switched:boolean,controller:(action:string)=>Promise<unknown>){
 const pending=join(prefix,'.rollback-'+randomUUID());
 try{
  if(switched)await controller('stop');
  await symlink(previous,pending);await rename(pending,join(prefix,'current'));
  await controller('start');
 }catch(cause){throw new Error('SERVICE_UPDATE_RECOVERY_REQUIRED',{cause})}
 finally{await rm(pending,{force:true})}
}
