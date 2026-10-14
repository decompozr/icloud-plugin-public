import {restorePreviousRelease} from './service-update.js';
import {installedServiceApp,rememberLegacyExecutor} from './service-app.js';
import{acquireRuntimeLock}from'./runtime-lock.js';
import {backgroundService,readServiceSettings,superviseRuntime} from './background-service.js';
import{writeFile,rm,mkdir,link,readFile,readlink,symlink,rename,realpath}from'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {installArtifact,uninstallArtifact,inspectArtifact,assertOwnedPrefix} from './install.js';

export async function releaseCli(args:string[],artifactDirectory:string){
 if(args[0]==='service'){const command=args[1];const at=args.indexOf('--prefix');const prefix=at>=0?resolve(args[at+1]!):join(homedir(),'.decompozr/plugins/icloud');let settings;const flag=(name:string)=>{const i=args.indexOf(name);const v=args[i+1];if(i<0||!['true','false'].includes(v??''))throw Error('Explicit boolean required');return v==='true'};if(command==='configure')settings={startAtLogin:flag('--start-at-login'),restartOnFailure:flag('--restart-on-failure')};const op=args.indexOf('--operation');console.log(JSON.stringify(await backgroundService(prefix,command!,settings,{},op>=0?args[op+1]:undefined)));return;}
 const [action,...rest]=args;
 let prefix=join(homedir(),'.decompozr/plugins/icloud');
 let config:string|undefined;
 let initialize=false,prepareLocalOwner=false,noOpen=false;
 for(let i=0;i<rest.length;i++){
  const option=rest[i];
  if(option==='--prefix'||option==='--config'){
   const value=rest[++i];
   if(!value||value.startsWith('--'))throw Error(`Missing value for ${option}`);
   if(option==='--prefix')prefix=resolve(value);else config=resolve(value);
  }else if(option==='--initialize')initialize=true;
  else if(option==='--prepare-local-owner')prepareLocalOwner=true;
  else if(option==='--no-open')noOpen=true;
  else throw Error(`Unknown option: ${option}`);
 }
 if(action==='install'||action==='update'){
  if(config||initialize||prepareLocalOwner||noOpen)throw Error('Installation does not configure or initialize runtime');
  const metadata=await inspectArtifact(artifactDirectory);
  const managed=!!metadata.serviceApp;
  let unlock=()=>{},previous:string|undefined,switched=false,stopped=false;
  if(action==='update'&&managed){await assertOwnedPrefix(prefix);unlock=acquireRuntimeLock(prefix,'service-update');previous=await readlink(join(prefix,'current'));}
  const controller=(command:string)=>backgroundService(prefix,command,undefined,{updateOwner:true});
  try{
   if(action==='update'&&managed){if(!await installedServiceApp(prefix))await rememberLegacyExecutor(prefix,join(artifactDirectory,'DecompozR Studio.app'));await controller('stop');stopped=true;}
   console.log(await installArtifact(artifactDirectory,prefix,action==='update'));switched=true;
   console.log(`Installed at ${prefix}`);
   if(managed){
    await mkdir(join(prefix,'runtime/logs'),{recursive:true,mode:0o700});
    if(action==='install')unlock=acquireRuntimeLock(prefix,'service-update');
    const serviceFile=join(prefix,'runtime/service.json');if(!await Bun.file(serviceFile).exists())await writeFile(serviceFile,JSON.stringify({startAtLogin:true,restartOnFailure:true})+'\n',{mode:0o600});
    console.log(JSON.stringify(await controller('start')));await rm(join(prefix,'runtime/legacy-service-executor.json'),{force:true});
   }
  }catch(error){
   if(previous&&stopped){
    await restorePreviousRelease(prefix,previous,switched,controller);
   }
   throw error;
  }finally{unlock()}
 }else if(action==='run'){
  if(!process.env.ICLOUD_SERVICE_APP&&!config&&!initialize&&!prepareLocalOwner){const app=await installedServiceApp(prefix);if(app){const child=Bun.spawn([app,'run','--prefix',prefix,'--no-open'],{stdin:'inherit',stdout:'inherit',stderr:'inherit'});for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>child.kill(signal));process.exitCode=await child.exited;return;}}
  const entry=await Bun.file(join(artifactDirectory,'apps/studio/dist/server/index.js')).exists()?join(artifactDirectory,'apps/studio/dist/server/index.js'):join(artifactDirectory,'apps/icloud/dist/index.js');
  if(process.env.ICLOUD_SERVICE_APP&&await realpath(artifactDirectory)!==await realpath(join(process.env.ICLOUD_SERVICE_APP,'Contents/Resources/payload')))throw Error('SERVICE_APP_PAYLOAD_MISMATCH');
  const record=join(prefix,'runtime/service-process.json');let ownedRecord=false,release=()=>{};
  if(!initialize&&!prepareLocalOwner){await mkdir(join(prefix,'runtime'),{recursive:true});release=acquireRuntimeLock(prefix,'service-run');try{const ps=(pid:number)=>{const p=Bun.spawnSync(['/bin/ps','-p',String(pid),'-o','lstart=']);return p.exitCode===0?Buffer.from(p.stdout).toString().trim():undefined};let existing:{pid:number;startedAt?:string}|undefined;try{existing=await Bun.file(record).json()}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('SERVICE_RECORD_REQUIRES_REVIEW')}if(existing&&existing.pid!==process.pid){if(!Number.isSafeInteger(existing.pid))throw Error('SERVICE_RECORD_REQUIRES_REVIEW');const started=ps(existing.pid);if(started&&(!existing.startedAt||started===existing.startedAt))throw Error('SERVICE_ALREADY_RUNNING')}const launcherPid=process.env.ICLOUD_SERVICE_LAUNCHER_PID?Number(process.env.ICLOUD_SERVICE_LAUNCHER_PID):undefined;if(launcherPid!==undefined&&(!Number.isSafeInteger(launcherPid)||launcherPid!==process.ppid||!process.env.ICLOUD_SERVICE_APP))throw Error('INVALID_SERVICE_LAUNCHER');await writeFile(record,JSON.stringify({pid:process.pid,startedAt:ps(process.pid),command:process.argv.join(' '),...(launcherPid?{launcherPid,launcherStartedAt:ps(launcherPid),appPath:process.env.ICLOUD_SERVICE_APP}:{})}),{mode:0o600});ownedRecord=true;}catch(error){release();throw error}}
  let child:ReturnType<typeof Bun.spawn>|undefined,intentionalStop=false;
  const launcher=process.env.ICLOUD_SERVICE_LAUNCHER_PID?Number(process.env.ICLOUD_SERVICE_LAUNCHER_PID):undefined;
  const started=(pid:number)=>{const p=Bun.spawnSync(['/bin/ps','-p',String(pid),'-o','lstart=']);return p.exitCode===0?Buffer.from(p.stdout).toString().trim():undefined};
  const launcherStart=launcher?started(launcher):undefined;
  const parentWatch=launcher?setInterval(()=>{if(!launcherStart||started(launcher)!==launcherStart){intentionalStop=true;child?.kill('SIGTERM');}},500):undefined;
  for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{intentionalStop=true;child?.kill(signal)});
  process.exitCode=await superviseRuntime(async()=>{child=Bun.spawn([process.execPath,...(process.env.ICLOUD_SERVICE_APP?['--no-env-file','--config=/dev/null']:[]),entry,'--config',config??join(prefix,'runtime/config.toml'),...(initialize?['--initialize']:[]),...(prepareLocalOwner?['--prepare-local-owner']:[]),...(noOpen?['--no-open']:[])],{cwd:artifactDirectory,env:{...process.env,ICLOUD_INSTALL_PREFIX:prefix},stdin:'inherit',stdout:'inherit',stderr:'inherit'});return child.exited},async()=>!initialize&&!prepareLocalOwner&&(await readServiceSettings(prefix)).restartOnFailure,()=>intentionalStop);
  if(parentWatch)clearInterval(parentWatch);release();if(ownedRecord)try{const value=await Bun.file(record).json();if(value.pid===process.pid)await rm(record)}catch{}
 }else if(action==='uninstall'){
  if(config||initialize||prepareLocalOwner||noOpen)throw Error('Uninstall does not configure runtime');
  await assertOwnedPrefix(prefix);
  const managed=!!await installedServiceApp(prefix);
  const unlock=managed?acquireRuntimeLock(prefix,'service-update'):()=>{};
  try{if(managed)await backgroundService(prefix,'unregister',undefined,{updateOwner:true});await uninstallArtifact(prefix)}finally{unlock()}
 }else if(action==='--help'||action==='help'){
  console.log('icloud-plugin install|update|uninstall [--prefix PATH]\nicloud-plugin run [--prefix PATH] [--config PATH] [--initialize|--prepare-local-owner [--no-open]]\nDefault installation: ~/.decompozr/plugins/icloud');
 }else throw Error('Usage: icloud-plugin install|update|run|uninstall|--help');
}
if(import.meta.main){const action=process.argv[2];const sealedPayload=import.meta.dir.endsWith('/DecompozR Studio.app/Contents/Resources/payload');await releaseCli(process.argv.slice(2),sealedPayload&&['install','update','uninstall'].includes(action??'')?resolve(import.meta.dir,'../../../..'):import.meta.dir);}
