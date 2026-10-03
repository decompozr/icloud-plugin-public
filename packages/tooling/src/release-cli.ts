import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {installArtifact,uninstallArtifact} from './install.js';

export async function releaseCli(args:string[],artifactDirectory:string){
 const [action,...rest]=args;
 let prefix=join(homedir(),'.decompozr/plugins/icloud');
 let config:string|undefined;
 let initialize=false;
 for(let i=0;i<rest.length;i++){
  const option=rest[i];
  if(option==='--prefix'||option==='--config'){
   const value=rest[++i];
   if(!value||value.startsWith('--'))throw Error(`Missing value for ${option}`);
   if(option==='--prefix')prefix=resolve(value);else config=resolve(value);
  }else if(option==='--initialize')initialize=true;
  else throw Error(`Unknown option: ${option}`);
 }
 if(action==='install'||action==='update'){
  if(config||initialize)throw Error('Installation does not configure or initialize runtime');
  console.log(await installArtifact(artifactDirectory,prefix,action==='update'));
  console.log(`Installed at ${prefix}`);
 }else if(action==='run'){
  const child=Bun.spawn([process.execPath,join(artifactDirectory,'apps/icloud/dist/index.js'),'--config',config??join(prefix,'runtime/config.toml'),...(initialize?['--initialize']:[])],{cwd:artifactDirectory,stdin:'inherit',stdout:'inherit',stderr:'inherit'});
  for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>child.kill(signal));
  process.exitCode=await child.exited;
 }else if(action==='uninstall'){
  if(config||initialize)throw Error('Uninstall does not configure runtime');
  await uninstallArtifact(prefix);
 }else if(action==='--help'||action==='help'){
  console.log('icloud-plugin install|update|uninstall [--prefix PATH]\nicloud-plugin run [--prefix PATH] [--config PATH] [--initialize]\nDefault installation: ~/.decompozr/plugins/icloud');
 }else throw Error('Usage: icloud-plugin install|update|run|uninstall|--help');
}
if(import.meta.main)await releaseCli(process.argv.slice(2),import.meta.dir);
