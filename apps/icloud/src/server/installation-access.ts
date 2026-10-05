import {constants,mkdirSync,lstatSync,fstatSync,openSync,writeFileSync,readFileSync,fsyncSync,closeSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {CustodyError} from '../storage/custody-contract.js';

/** Cooperative installation-wide exclusion, independent of master authority.
 * Hold runtime access before any credential/database opens, through full drain
 * and disposal. Maintenance acquires this before the authority mutation lease.
 * Crash evidence is never stolen based on PID liveness. Older/custom writers
 * must separately be stopped; this is not an authenticated-caller boundary. */
export class InstallationAccess {
 private released=false;
 private constructor(private readonly directory:string,private readonly purpose:'runtime'|'maintenance',private readonly identity:{dev:number;ino:number},private readonly proof:string){}
 private static privateDirectory(path:string){
  const info=lstatSync(path);
  if(!info.isDirectory()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw new CustodyError('recovery_required');
  return info;
 }
 static acquire(directory:string,purpose:'runtime'|'maintenance',createDirectory=false):InstallationAccess {
  try{
   if(!['runtime','maintenance'].includes(purpose))throw new CustodyError('invalid_input');
   if(createDirectory)mkdirSync(directory,{recursive:true,mode:0o700});
   this.privateDirectory(directory);const path=join(directory,'installation-access.lock');
   try{mkdirSync(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new CustodyError('conflict');throw error;}
   // Any failure after mkdir retains the lock, including incomplete proof.
   const identity=this.privateDirectory(path),proof=JSON.stringify({format:1,purpose,token:randomUUID(),pid:process.pid})+'\n';
   const fd=openSync(join(path,'access.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{writeFileSync(fd,proof);fsyncSync(fd);}finally{closeSync(fd);}
   for(const entry of [path,directory]){const handle=openSync(entry,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(handle);}finally{closeSync(handle);}}
   return new InstallationAccess(directory,purpose,{dev:identity.dev,ino:identity.ino},proof);
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
 assert():void {
  try{
   if(this.released)throw new CustodyError('conflict');
   InstallationAccess.privateDirectory(this.directory);
   const path=join(this.directory,'installation-access.lock'),info=InstallationAccess.privateDirectory(path);
   if(info.dev!==this.identity.dev||info.ino!==this.identity.ino)throw new CustodyError('conflict');
   const fd=openSync(join(path,'access.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
   try{const file=fstatSync(fd);if(!file.isFile()||file.nlink!==1||file.uid!==process.getuid?.()||(file.mode&0o077)!==0||file.size>4096||readFileSync(fd,'utf8')!==this.proof)throw new CustodyError('conflict');}finally{closeSync(fd);}
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
 /** Suitable only after all older/noncooperating writers were independently stopped. */
 readonly assertStoppedMaintenance=():void=>{if(this.purpose!=='maintenance')throw new CustodyError('conflict');this.assert();};
 assertStoppedMaintenanceFor(directory:string):void{if(resolve(directory)!==resolve(this.directory))throw new CustodyError('conflict');this.assertStoppedMaintenance();}
 release():void {
  this.assert();
  try{
   const path=join(this.directory,'installation-access.lock');unlinkSync(join(path,'access.json'));rmdirSync(path);this.released=true;
   const fd=openSync(this.directory,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}
  }catch{throw new CustodyError('recovery_required');}
 }
}
