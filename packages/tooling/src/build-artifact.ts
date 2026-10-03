import {artifactSchema,packageVersionSchema} from './artifact.js';
import {cp,mkdir,rm,chmod} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
const root=resolve(import.meta.dir,'../../..');
const target=`${process.platform}-${process.arch}`;
const output=resolve(process.argv[2]??join(root,'.flow-runtime','build',target));
if(await Bun.file(join(output,'artifact.json')).exists())throw Error('Build target already exists; use a fresh output directory.');
if(!await Bun.file(join(root,'apps/icloud/dist/index.js')).exists())throw Error('Run the application build first.');
await mkdir(dirname(output),{recursive:true});
await mkdir(output,{recursive:false});
try{
 await mkdir(join(output,'apps/icloud'),{recursive:true});
 for(const file of ['package.json','bun.lock','LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,file),join(output,file));
 await cp(join(root,'apps/icloud/package.json'),join(output,'apps/icloud/package.json'));
 for(const file of ['package.json','bun.lock','LICENSE','THIRD_PARTY_NOTICES.md','apps/icloud/package.json'])await chmod(join(output,file),0o644);
 await cp(join(root,'apps/icloud/dist'),join(output,'apps/icloud/dist'),{recursive:true});
 const install=Bun.spawn(['bun','install','--production','--frozen-lockfile'],{cwd:output,stdout:'inherit',stderr:'inherit'});
 if(await install.exited!==0)throw Error('Artifact dependency preparation failed');
 await cp(join(root,'packages/tooling/src/runtime.sh'),join(output,'runtime.sh'));
 await chmod(join(output,'runtime.sh'),0o755);
 const metadata=packageVersionSchema.parse(await Bun.file(join(root,'apps/icloud/package.json')).json() as unknown);
 await Bun.write(join(output,'artifact.json'),JSON.stringify(artifactSchema.parse({format:1,name:'icloud-plugin',version:metadata.version,platform:process.platform,arch:process.arch,bun:Bun.version}),null,2)+'\n');
 console.log(output);
}catch(error){await rm(output,{recursive:true,force:true});throw error;}
