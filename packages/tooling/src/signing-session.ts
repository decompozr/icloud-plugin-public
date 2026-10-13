import {constants} from 'node:fs';
import {open,mkdtemp,writeFile,rm,lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';

export interface SigningCredentials {p12File:string;passwordFile:string;identity:string}
export interface BuildSigner {keychain:string;identity:string}
export type SigningCommand=(args:string[])=>Promise<string>;
async function boundedText(stream:ReadableStream<Uint8Array>,limit:number,stop:()=>void){const reader=stream.getReader();let size=0;const chunks:Uint8Array[]=[];try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit){stop();throw Error('SIGNING_RESPONSE_LIMIT');}chunks.push(next.value);}return Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
async function command(args:string[]){
 const child=Bun.spawn(args,{stdout:'pipe',stderr:'ignore'});
 const timeout=setTimeout(()=>child.kill(),30000);
 try{const output=await boundedText(child.stdout,65536,()=>child.kill());if(await child.exited!==0)throw Error('SIGNING_TOOL_FAILED');return output;}finally{clearTimeout(timeout);}
}
export async function privateSigningFile(path:string,limit:number){
 if(!isAbsolute(path))throw Error('PRIVATE_SIGNING_FILE_REQUIRED');
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const info=await file.stat();
  if(!info.isFile()||info.nlink!==1||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size>limit)throw Error('PRIVATE_SIGNING_FILE_REQUIRED');
  const data=await file.readFile();if(data.length>limit)throw Error('SIGNING_FILE_LIMIT');return data;
 }finally{await file.close();}
}
async function responseLine(stream:ReadableStream<Uint8Array>){
 const reader=stream.getReader();let text='';
 const timer=setTimeout(()=>{void reader.cancel();},15000);
 try{while(true){const next=await reader.read();if(next.done)throw Error('SIGNING_SESSION_FAILED');text+=new TextDecoder().decode(next.value);if(text.length>8192)throw Error('SIGNING_RESPONSE_LIMIT');const newline=text.indexOf('\n');if(newline>=0)return JSON.parse(text.slice(0,newline)) as unknown;}}
 finally{clearTimeout(timer);reader.releaseLock();}
}
/** A new per-job keychain; no login keychain, global default or secret argv. */
export async function withBuildSigner<T>(credentials:SigningCredentials,use:(signer:BuildSigner)=>Promise<T>,run:SigningCommand=command):Promise<T>{
 if(!/^[A-Fa-f0-9]{40}$/.test(credentials.identity))throw Error('SIGNING_IDENTITY_REQUIRED');
 // Validate provisioned assets before creating any native keychain.
 const certificate=await privateSigningFile(credentials.p12File,1024*1024);
 const passwordBytes=await privateSigningFile(credentials.passwordFile,4096);
 let password:string;try{password=new TextDecoder('utf-8',{fatal:true}).decode(passwordBytes).replace(/\r?\n$/,'');}catch{throw Error('INVALID_SIGNING_PASSWORD_FILE');}
 const directory=await mkdtemp(join(tmpdir(),'decompozr-signing-'));
 const keychain=join(directory,'signing.keychain-db'),helper=join(directory,'signing-session'),p12=join(directory,'identity.p12');
 const keychainPassword=randomBytes(32).toString('hex');
 let child:Bun.Subprocess<'pipe','pipe','ignore'>|undefined;
 let result:T|undefined,failure:unknown;
 try{
  await writeFile(p12,certificate,{mode:0o600,flag:'wx'});
  await run(['swiftc','-parse-as-library',join(import.meta.dir,'native/SigningSession.swift'),'-o',helper,'-framework','Security']);
  child=Bun.spawn([helper],{stdin:'pipe',stdout:'pipe',stderr:'ignore'});
  child.stdin.write(JSON.stringify({keychainPath:keychain,p12Path:p12,p12Password:password,keychainPassword})+'\n');
  // The encrypted identity/password go only to the owner's native process pipe.
  const ready=z.object({ready:z.literal(true),identity:z.string().regex(/^[A-F0-9]{40}$/)}).strict().safeParse(await responseLine(child.stdout));
  if(!ready.success)throw Error('SIGNING_IMPORT_FAILED');
  if(ready.data.identity!==credentials.identity.toUpperCase())throw Error('SIGNING_IDENTITY_MISMATCH');
  // Supply only this ephemeral keychain to the interactive security CLI. The
  // generated session password remains in its private stdin, never process argv.
  if(!/^[A-Za-z0-9_./-]+$/.test(keychain))throw Error('UNSUPPORTED_SIGNING_TEMP_PATH');
  const configure=Bun.spawn(['/usr/bin/security','-i'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
  configure.stdin.write(`set-key-partition-list -S apple-tool:,apple: -s -k ${keychainPassword} ${keychain}\n`);configure.stdin.end();
  const configureTimeout=setTimeout(()=>configure.kill(),15000);
  const [out,err,exit]=await Promise.all([boundedText(configure.stdout,65536,()=>configure.kill()),boundedText(configure.stderr,65536,()=>configure.kill()),configure.exited]).finally(()=>clearTimeout(configureTimeout));
  if(exit!==0||/SecKeychain|SecItem|error:/i.test(out+err))throw Error('SIGNING_ACCESS_SETUP_FAILED');
  const identities=await run(['/usr/bin/security','find-identity','-p','codesigning','-v',keychain]);
  if(!identities.includes(ready.data.identity))throw Error('SIGNING_IDENTITY_UNTRUSTED');
  result=await use({keychain,identity:ready.data.identity});
 }catch(error){failure=error;}
 finally{
  certificate.fill(0);passwordBytes.fill(0);password='';
  if(child){
   let closeTimer:ReturnType<typeof setTimeout>|undefined;
   try{child.stdin.write('close\n');child.stdin.end();await Promise.race([child.exited,new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('SIGNING_CLOSE_TIMEOUT')),5000);})]);}catch{child.kill();await child.exited;}finally{clearTimeout(closeTimer);}
  }
  // A crashed native owner may not have executed its defer. Delete only our exact
  // private session path; never replace or clear the user's keychain search list.
  if(await lstat(keychain).then(()=>true,()=>false)){
   try{await run(['/usr/bin/security','delete-keychain',keychain]);}catch{failure=Error('SIGNING_CLEANUP_FAILED');}
  }
  if(!await lstat(keychain).then(()=>true,()=>false))await rm(directory,{recursive:true,force:true});
  else failure=Error('SIGNING_CLEANUP_FAILED');
 }
 if(failure)throw failure;
 return result as T;
}
