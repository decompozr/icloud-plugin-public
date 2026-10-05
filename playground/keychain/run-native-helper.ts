import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {CustodyHelper} from '../../apps/icloud/src/storage/custody-helper.js';
import {CustodyError} from '../../apps/icloud/src/storage/custody-contract.js';

const directory=mkdtempSync(join(tmpdir(),'icloud-native-helper-')),bundleMode=process.argv.includes('--bundle-fixture'),bundle=join(directory,'CustodyFixture.app'),binary=bundleMode?join(bundle,'Contents/MacOS/ICloudCustodyHelper'):join(directory,'helper'),installationId=randomUUID(),source=join(import.meta.dir,'../../apps/icloud/src/storage/native/CustodyHelper.swift');
let checks=0;
let bundleChecks=0;
async function tool(args:string[],expectSuccess=true){const process=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const[exit,stdout,stderr]=await Promise.all([process.exited,new Response(process.stdout).text(),new Response(process.stderr).text()]);if((exit===0)!==expectSuccess)throw Error('bundle_tool_unexpected_exit');return stdout+stderr;}
async function compile(flags:string[]){const child=Bun.spawn(['xcrun','swiftc','-warnings-as-errors','-target',(process.arch==='arm64'?'arm64':'x86_64')+'-apple-macosx13.0','-module-cache-path',join(directory,'modules'),...flags,source],{stdout:'pipe',stderr:'pipe'});const[exit,diagnostics]=await Promise.all([child.exited,new Response(child.stderr).text()]);if(exit!==0||diagnostics)throw Error('native_helper_compile_failed: '+diagnostics);}
const command=(mode:string)=>[binary,'--installation-id',installationId,'--access-group','EXPERIMENT.unprovisioned.helper','--fixture-mode',mode];
const helper=(mode:string)=>new CustodyHelper({installationId,command:command(mode)});
const identity={installationId,ownerId:'synthetic/照片"\\owner',accountId:randomUUID(),revision:1,generation:2};
async function fails(run:()=>Promise<unknown>,code:string){try{await run();}catch(error){if(error instanceof CustodyError&&error.code===code){checks++;return;}throw Error('unexpected_failure');}throw Error('expected_failure');}
function frame(header:object,payload=Buffer.alloc(0)){const metadata=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(8);prefix.writeUInt32BE(metadata.length);prefix.writeUInt32BE(payload.length,4);return Buffer.concat([prefix,metadata,payload]);}
async function invalid(extra:object,payload=Buffer.alloc(0),code='invalid_input'){
 const header={version:1,requestId:randomUUID(),action:'read',kind:'password',...identity,interaction:'prohibited',...extra},input=frame(header,payload);
 const child=Bun.spawn(command('success'),{stdin:new Blob([Uint8Array.from(input)]),stdout:'pipe',stderr:'pipe'});let output:Buffer|undefined;
 try{const[exit,raw,stderr]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);output=Buffer.from(raw);if(exit!==0||stderr||output.length<8)throw Error('invalid_request_fixture_failed');const length=output.readUInt32BE(0),reply=JSON.parse(output.subarray(8,8+length).toString());if(reply.requestId!==header.requestId||reply.status!=='error'||reply.code!==code||output.readUInt32BE(4)!==0)throw Error('invalid_request_accepted');checks++;}finally{input.fill(0);output?.fill(0);}
}
try{
 if(bundleMode){
  mkdirSync(join(bundle,'Contents/MacOS'),{recursive:true});mkdirSync(join(bundle,'Contents/Resources'));
  writeFileSync(join(bundle,'Contents/Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.decompozr.icloud-plugin.custody.fixture</string><key>CFBundleExecutable</key><string>ICloudCustodyHelper</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>0.0.0</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>LSUIElement</key><true/><key>ICLOUDCustodyFixture</key><true/></dict></plist>');
  writeFileSync(join(bundle,'Contents/Resources/fixture.txt'),'synthetic-original');
 }
 await compile(['-DCUSTODY_FIXTURE','-o',binary]);await compile(['-typecheck']);
 if(bundleMode){
  await tool(['/usr/bin/plutil','-lint',join(bundle,'Contents/Info.plist')]);bundleChecks++;
  await tool(['/usr/bin/codesign','--force','--sign','-',bundle]);
  await tool(['/usr/bin/codesign','--verify','--strict',bundle]);bundleChecks++;
  const metadata=await tool(['/usr/bin/codesign','--display','--verbose=4',bundle]);
  if(!metadata.includes('Identifier=org.decompozr.icloud-plugin.custody.fixture')||!metadata.includes('Signature=adhoc'))throw Error('fixture_identity_mismatch');bundleChecks++;
  writeFileSync(join(bundle,'Contents/Resources/fixture.txt'),'synthetic-changed');await tool(['/usr/bin/codesign','--verify','--strict',bundle],false);bundleChecks++;
  writeFileSync(join(bundle,'Contents/Resources/fixture.txt'),'synthetic-original');await tool(['/usr/bin/codesign','--verify','--strict',bundle]);bundleChecks++;
 }
 const success=helper('success'),master=await success.master.read(installationId,{interaction:'prohibited'}),password=await success.passwords.read(identity,{interaction:'prohibited'});
 if(!Buffer.from(master).equals(Buffer.alloc(32,7))||Buffer.from(password).toString()!=='synthetic-password')throw Error('native_wire_bytes');master.fill(0);password.fill(0);checks+=2;
 const borrowed=Buffer.alloc(32,7),pending=success.addMaster(installationId,borrowed,{interaction:'setup'});borrowed.fill(0);await pending;checks++;
 const appPassword=Buffer.from('synthetic-password');try{await success.addPassword(identity,appPassword,{interaction:'prohibited'});checks++;}finally{appPassword.fill(0);}
 await success.deleteMaster(installationId,{interaction:'prohibited'});await success.deletePassword(identity,{interaction:'prohibited'});checks+=2;
 for(const [mode,code]of [['missing','missing'],['locked','locked'],['denied','denied'],['duplicate','conflict'],['wrong-size','recovery_required']])await fails(()=>helper(mode!).master.read(installationId,{interaction:'prohibited'}),code!);
 await fails(()=>helper('internal').master.read(installationId,{interaction:'prohibited'}),'recovery_required');
 await fails(()=>helper('internal').deleteMaster(installationId,{interaction:'prohibited'}),'outcome_unknown');
 await invalid({service:'unowned'});await invalid({revision:true});await invalid({generation:1.5});await invalid({ownerId:[]});await invalid({installationId:randomUUID()},undefined,'conflict');await invalid({interaction:'setup'});
 await invalid({action:'add'},Buffer.from([0xff]));await invalid({kind:'master',ownerId:undefined,accountId:undefined,revision:undefined,generation:undefined,action:'add'},Buffer.alloc(31));
 process.stdout.write(JSON.stringify({experiment:bundleMode?'native-helper-app-bundle-fixture':'native-helper-memory-dispatch',checks,...(bundleMode?{bundleChecks,signature:'adhoc',profileEmbedded:false,restrictedEntitlements:false,productionIdentity:false}:{}),fixtureCompileWarningsAsErrors:true,productionTypecheck:true,bunAdapterInterop:true,nativeKeychainCalls:0,backend:'compile_time_memory',k0Passed:false})+'\n');
}finally{rmSync(directory,{recursive:true,force:true});}
