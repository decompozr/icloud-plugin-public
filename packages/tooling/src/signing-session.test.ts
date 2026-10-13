import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,chmod,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {privateSigningFile,withBuildSigner,type SigningCommand} from './signing-session.js';

test('signing inputs require private owned files before any build or keychain action',async()=>{
 const root=await mkdtemp(join(tmpdir(),'signing-input-test-'));
 try{
  const file=join(root,'credentials');await writeFile(file,'private test credential',{mode:0o600});
  expect((await privateSigningFile(file,4096)).toString()).toBe('private test credential');
  await chmod(file,0o644);await expect(privateSigningFile(file,4096)).rejects.toThrow('PRIVATE_SIGNING_FILE_REQUIRED');
  let actions=0;
  await expect(withBuildSigner({p12File:file,passwordFile:file,identity:'A'.repeat(40)},async()=>{actions++;},async()=>{actions++;return '';})).rejects.toThrow('PRIVATE_SIGNING_FILE_REQUIRED');
  expect(actions).toBe(0);
  await expect(withBuildSigner({p12File:file,passwordFile:file,identity:'Apple Development'},async()=>{})).rejects.toThrow('SIGNING_IDENTITY_REQUIRED');
 }finally{await rm(root,{recursive:true,force:true});}
});

const fixture=process.env.SIGNING_FIXTURE_DIRECTORY;
const scenario=fixture&&process.platform==='darwin'?test:test.skip;
async function credentials(){const root=resolve(fixture!);const identity=(await Bun.file(join(root,'identity.sha1')).text()).trim();return{p12File:join(root,'identity.p12'),passwordFile:join(root,'password.txt'),identity};}
const searchList=()=>Bun.spawnSync(['/usr/bin/security','list-keychains','-d','user']).stdout.toString();
scenario('untrusted fixture identity is rejected and temporary native keychain is removed',async()=>{
 const before=searchList(),creds=await credentials();let called=false,temporary='';
 const run:SigningCommand=async args=>{if(args.includes('find-identity'))temporary=args.at(-1)!;const child=Bun.spawn(args,{stdout:'pipe',stderr:'ignore'});const out=await new Response(child.stdout).text();if(await child.exited!==0)throw Error('fixture tool failed');return out;};
 await expect(withBuildSigner(creds,async()=>{called=true;},run)).rejects.toThrow('SIGNING_IDENTITY_UNTRUSTED');
 expect(called).toBe(false);expect(await Bun.file(temporary).exists()).toBe(false);expect(searchList()).toBe(before);
},30000);
scenario('callback failure cleans an isolated session without secret arguments or login-keychain selection',async()=>{
 const before=searchList(),creds=await credentials(),calls:string[][]=[];let temporary='';
 // Fixture certificate is deliberately untrusted; mock only the trust readback
 // to exercise failure cleanup. This is not real trusted-signing acceptance.
 const run:SigningCommand=async args=>{calls.push(args);if(args.includes('find-identity')){temporary=args.at(-1)!;return creds.identity;}const child=Bun.spawn(args,{stdout:'pipe',stderr:'ignore'});const out=await new Response(child.stdout).text();if(await child.exited!==0)throw Error('fixture tool failed');return out;};
 await expect(withBuildSigner(creds,async signer=>{expect(await Bun.file(signer.keychain).exists()).toBe(true);throw Error('build rejected');},run)).rejects.toThrow('build rejected');
 expect(await Bun.file(temporary).exists()).toBe(false);expect(searchList()).toBe(before);
 expect(calls.flat().join(' ')).not.toContain('fixture-only');expect(calls.flat().join(' ')).not.toContain('login.keychain');
},30000);
scenario('native session cleans up when owner closes both pipes during import',async()=>{
 const before=searchList(),creds=await credentials(),root=await mkdtemp(join(tmpdir(),'signing-disconnect-test-'));
 const helper=join(root,'session'),keychain=join(root,'signing.keychain-db');
 try{
  const compile=Bun.spawn(['swiftc','-parse-as-library',join(import.meta.dir,'native/SigningSession.swift'),'-o',helper,'-framework','Security'],{stdout:'ignore',stderr:'ignore'});
  expect(await compile.exited).toBe(0);
  const child=Bun.spawn([helper],{stdin:'pipe',stdout:'pipe',stderr:'ignore'});
  await child.stdout.cancel();
  child.stdin.write(JSON.stringify({keychainPath:keychain,p12Path:creds.p12File,p12Password:(await Bun.file(creds.passwordFile).text()).trim(),keychainPassword:'a'.repeat(64)})+'\n');child.stdin.end();
  expect(await child.exited).toBe(0);
  expect(await Bun.file(keychain).exists()).toBe(false);expect(searchList()).toBe(before);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
scenario('concurrent private sessions leave the user search list unchanged while alive',async()=>{
 const before=searchList(),creds=await credentials(),paths:string[]=[];
 const run:SigningCommand=async args=>{if(args.includes('find-identity'))return creds.identity;const child=Bun.spawn(args,{stdout:'pipe',stderr:'ignore'});const out=await new Response(child.stdout).text();if(await child.exited!==0)throw Error('fixture tool failed');return out;};
 let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
 await Promise.all([0,1].map(()=>withBuildSigner(creds,async signer=>{
  paths.push(signer.keychain);expect(searchList()).toBe(before);
  if(paths.length===2)release();await barrier;
 },run)));
 expect(paths.length).toBe(2);for(const path of paths)expect(await Bun.file(path).exists()).toBe(false);expect(searchList()).toBe(before);
},30000);
scenario('wrong password and fingerprint refuse build and preserve user search list',async()=>{
 const before=searchList(),creds=await credentials(),root=await mkdtemp(join(tmpdir(),'signing-rejection-test-'));
 try{
  const passwordFile=join(root,'password');await writeFile(passwordFile,'wrong-password',{mode:0o600});
  let called=false;
  await expect(withBuildSigner({...creds,passwordFile},async()=>{called=true;})).rejects.toThrow('SIGNING_IMPORT_FAILED');
  await expect(withBuildSigner({...creds,identity:'A'.repeat(40)},async()=>{called=true;})).rejects.toThrow('SIGNING_IDENTITY_MISMATCH');
  expect(called).toBe(false);expect(searchList()).toBe(before);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
