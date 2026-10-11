/** Local operator entry point. No automatic dependency install or photo mutation. */
import {Database} from 'bun:sqlite';
import {readFileSync,mkdirSync,lstatSync,openSync,closeSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {LocalPhotosProvider,runNative} from './provider.js';
import {PhotosService} from './service.js';
import {photosRegistration} from './module.js';
export async function cli(args:string[]){
 if(args.length!==2)throw Error('Usage: bun photos/cli.ts CONFIG.json REQUEST.json');
 const config=z.object({python:z.string(),library:z.string(),nativeHelper:z.string(),readerHelper:z.string().optional(),stateDirectory:z.string(),allowWrites:z.boolean().default(false),allowDelete:z.boolean().default(false)}).strict().parse(JSON.parse(readFileSync(args[0]!,'utf8')));
 for(const key of ['python','library','nativeHelper','stateDirectory'] as const)config[key]=resolve(config[key]);
 if(config.readerHelper)config.readerHelper=resolve(config.readerHelper);
 const request=z.object({tool:z.string(),input:z.unknown().default({})}).strict().parse(JSON.parse(readFileSync(args[1]!,'utf8')));
 if(request.tool==='authorize'){console.log(JSON.stringify(await runNative(config.nativeHelper,{command:'authorize'},60000)));return;}
 mkdirSync(config.stateDirectory,{recursive:true,mode:0o700});const stat=lstatSync(config.stateDirectory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid?.())throw Error('Private 0700 state directory required');
 const path=join(config.stateDirectory,'photos-operations.sqlite');
 const fd=openSync(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);closeSync(fd);
 const file=lstatSync(path);if(file.nlink!==1||(file.mode&0o777)!==0o600||file.uid!==process.getuid?.())throw Error('Private state file required');
 const db=new Database(path);try{const policy=()=>({read:true,write:config.allowWrites,delete:config.allowDelete});const service=new PhotosService(db,new LocalPhotosProvider(config),policy,()=> 'local-operator');const entry=photosRegistration(service,policy).tools.find(t=>t.tool.name===request.tool&&t.enabled());if(!entry)throw Error('Tool unavailable');console.log(JSON.stringify(await entry.run(request.input)));}finally{db.close();}
}
if(import.meta.main)cli(process.argv.slice(2)).catch(()=>{console.error(JSON.stringify({status:'failed',error:'photos_cli_failed'}));process.exitCode=1;});
