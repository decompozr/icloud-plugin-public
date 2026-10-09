import{acquireRuntimeLock}from'./runtime-lock.js';
import {backgroundService,readServiceSettings,superviseRuntime} from './background-service.js';
import{writeFile,rm,mkdir,link,readFile}from'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {installArtifact,uninstallArtifact} from './install.js';

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
  console.log(await installArtifact(artifactDirectory,prefix,action==='update'));
  console.log(`Installed at ${prefix}`);
 }else if(action==='run'){
  const entry=await Bun.file(join(artifactDirectory,'apps/studio/dist/server/index.js')).exists()?join(artifactDirectory,'apps/studio/dist/server/index.js'):join(artifactDirectory,'apps/icloud/dist/index.js');
  const record=join(prefix,'runtime/service-process.json');let ownedRecord=false,release=()=>{};
  if(!initialize&&!prepareLocalOwner){await mkdir(join(prefix,'runtime'),{recursive:true});release=acquireRuntimeLock(prefix,'service-run');try{const ps=(pid:number)=>{const p=Bun.spawnSync(['/bin/ps','-p',String(pid),'-o','lstart=']);return p.exitCode===0?Buffer.from(p.stdout).toString().trim():undefined};let existing:{pid:number;startedAt?:string}|undefined;try{existing=await Bun.file(record).json()}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('SERVICE_RECORD_REQUIRES_REVIEW')}if(existing&&existing.pid!==process.pid){if(!Number.isSafeInteger(existing.pid))throw Error('SERVICE_RECORD_REQUIRES_REVIEW');const started=ps(existing.pid);if(started&&(!existing.startedAt||started===existing.startedAt))throw Error('SERVICE_ALREADY_RUNNING')}await writeFile(record,JSON.stringify({pid:process.pid,startedAt:ps(process.pid),command:process.argv.join(' ')}),{mode:0o600});ownedRecord=true;}catch(error){release();throw error}}
  let child:ReturnType<typeof Bun.spawn>|undefined,intentionalStop=false;
  for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{intentionalStop=true;child?.kill(signal)});
  process.exitCode=await superviseRuntime(async()=>{child=Bun.spawn([process.execPath,entry,'--config',config??join(prefix,'runtime/config.toml'),...(initialize?['--initialize']:[]),...(prepareLocalOwner?['--prepare-local-owner']:[]),...(noOpen?['--no-open']:[])],{cwd:artifactDirectory,env:{...process.env,ICLOUD_INSTALL_PREFIX:prefix},stdin:'inherit',stdout:'inherit',stderr:'inherit'});return child.exited},async()=>!initialize&&!prepareLocalOwner&&(await readServiceSettings(prefix)).restartOnFailure,()=>intentionalStop);
  release();if(ownedRecord)try{const value=await Bun.file(record).json();if(value.pid===process.pid)await rm(record)}catch{}
 }else if(action==='uninstall'){
  if(config||initialize||prepareLocalOwner||noOpen)throw Error('Uninstall does not configure runtime');
  await uninstallArtifact(prefix);
 }else if(action==='--help'||action==='help'){
  console.log('icloud-plugin install|update|uninstall [--prefix PATH]\nicloud-plugin run [--prefix PATH] [--config PATH] [--initialize|--prepare-local-owner [--no-open]]\nDefault installation: ~/.decompozr/plugins/icloud');
 }else throw Error('Usage: icloud-plugin install|update|run|uninstall|--help');
}
if(import.meta.main)await releaseCli(process.argv.slice(2),import.meta.dir);
