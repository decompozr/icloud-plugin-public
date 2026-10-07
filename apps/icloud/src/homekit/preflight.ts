import {stat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {z} from 'zod';
export const HOMEKIT_PROTOCOL_VERSION='1.0.0';
export const HOMEKIT_SUPPORTED_PROTOCOLS=['0.14.0','0.15.0',HOMEKIT_PROTOCOL_VERSION] as const;
export type PreflightCommand=(argv:string[],input?:string)=>Promise<string>;
const info=z.object({CFBundleIdentifier:z.enum(['com.decompozr.homekit-helper','com.decompozr.homekit-probe']),HomeKitSourceSHA256:z.string().regex(/^[a-f0-9]{64}$/),HomeKitProtocolVersion:z.enum(HOMEKIT_SUPPORTED_PROTOCOLS)}).passthrough().refine(bundle=>bundle.CFBundleIdentifier!=='com.decompozr.homekit-helper'||bundle.HomeKitProtocolVersion===HOMEKIT_PROTOCOL_VERSION);
const entitlements=z.object({'com.apple.developer.homekit':z.literal(true),'com.apple.developer.team-identifier':z.string().regex(/^[A-Z0-9]{10}$/)}).passthrough();
/** Fixed local inspection commands only. Does not launch HomeKit or touch owner state. */
export async function preflightCommand(argv:string[],input?:string):Promise<string>{
 const child=Bun.spawn(argv,{stdin:input===undefined?'ignore':Buffer.from(input),stdout:'pipe',stderr:'ignore'});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},4000);
 try{const reader=child.stdout.getReader();const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){child.kill('SIGTERM');throw Error('inspection_output_limit');}chunks.push(part.value);}}finally{reader.releaseLock();}if(await child.exited!==0||timedOut)throw Error('inspection_failed');return Buffer.concat(chunks).toString();}finally{clearTimeout(timer);}
}
export async function inspectHomeKitHelper(settings:{native_app:string;source_sha256:string;signing_team:string;python:string},command:PreflightCommand=preflightCommand){
 let stage='configuration';
 try{
  if(!isAbsolute(settings.native_app)||!settings.native_app.endsWith('.app')||!isAbsolute(settings.python)||! /^[a-f0-9]{64}$/.test(settings.source_sha256)||! /^[A-Z0-9]{10}$/.test(settings.signing_team))throw Error();
  if(command===preflightCommand){if(process.platform!=='darwin')return{status:'fail' as const,stage:'platform'};stage='paths';if(!(await stat(settings.native_app)).isDirectory()||!((await stat(settings.python)).isFile()&&((await stat(settings.python)).mode&0o111)))throw Error();}
  stage='signature';await command(['/usr/bin/codesign','--verify','--strict','-R',`=anchor apple generic and certificate leaf[subject.OU] = "${settings.signing_team}"`,settings.native_app]);
  stage='metadata';const bundle=info.parse(JSON.parse(await command(['/usr/bin/plutil','-convert','json','-o','-',join(settings.native_app,'Contents/Info.plist')])));
  if(bundle.HomeKitSourceSHA256!==settings.source_sha256)return{status:'fail' as const,stage:'source_pin'};
  stage='entitlements';const xml=await command(['/usr/bin/codesign','--display','--entitlements',':-',settings.native_app]);const signed=entitlements.parse(JSON.parse(await command(['/usr/bin/plutil','-convert','json','-o','-','-'],xml)));if(signed['com.apple.developer.team-identifier']!==settings.signing_team)throw Error();
  return{status:'pass' as const,stage:'verified',protocolVersion:bundle.HomeKitProtocolVersion,sourceSHA256:bundle.HomeKitSourceSHA256,homeAuthorizationVerified:false,oauthClientVerified:false};
 }catch{return{status:'fail' as const,stage};}
}
