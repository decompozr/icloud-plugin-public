import {join,resolve,basename} from 'node:path';
import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {repository} from './command.js';
export const modulePackageOwners=['packages/contracts','packages/ui','modules/account','modules/mail','modules/calendar','modules/photos','modules/homekit'] as const;
export async function packModulePackages(output:string){
 output=resolve(output);await mkdir(output,{recursive:true});
 const manifests=await Promise.all(modulePackageOwners.map(async owner=>({owner,value:JSON.parse(await readFile(join(repository,owner,'package.json'),'utf8'))})));
 const versions=new Map(manifests.map(({value})=>[value.name,value.version]));const artifacts=[];
 for(const {owner,value} of manifests){
  if(!/^@decompozr\/[a-z-]+$/.test(value.name)||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value.version))throw Error('Invalid module identity/version');
  const file=`${value.name.slice(1).replace('/','-')}-${value.version}.tgz`,target=join(output,file);
  if(await Bun.file(target).exists())throw Error('Versioned package exists; refusing overwrite');
  const stage=join(output,`.stage-${basename(owner)}`);await mkdir(stage,{recursive:false});
  try{
   const manifest=structuredClone(value);
   for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])for(const [name,range]of Object.entries(manifest[section]??{}))if(typeof range==='string'&&range.startsWith('workspace:')){const version=versions.get(name);if(!version)throw Error('Unknown workspace dependency');manifest[section][name]=version;}
   delete manifest.devDependencies;delete manifest.scripts;
   for(const path of value.files as string[]){
    const source=join(repository,owner,path);if(!await Bun.file(source).exists()&&!['dist','ui','src'].includes(path))continue;
    await cp(source,join(stage,path),{recursive:true,filter:path=>!path.split('/').some(part=>part==='node_modules'||part==='test-fixtures'||part==='.decompozr')&&!/\.(test|worker)\.ts$/.test(path)&&!path.endsWith('/tsconfig.json')});
   }
   await cp(join(repository,'LICENSE'),join(stage,'LICENSE'));
   const notices=await readFile(join(repository,'THIRD_PARTY_NOTICES.md'),'utf8')+'\n'+await readFile(join(repository,'apps/studio/THIRD_PARTY_NOTICES.md'),'utf8');await writeFile(join(stage,'THIRD_PARTY_NOTICES.md'),notices);
   if(!manifest.files.includes('THIRD_PARTY_NOTICES.md'))manifest.files.push('THIRD_PARTY_NOTICES.md');
   await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
   const child=Bun.spawn([process.execPath,'pm','pack','--filename',target,'--ignore-scripts','--quiet'],{cwd:stage,stdout:'pipe',stderr:'pipe'});if(await child.exited!==0)throw Error('Module packing failed: '+await new Response(child.stderr).text());
   const bytes=await readFile(target);artifacts.push({name:value.name,version:value.version,file,sha256:createHash('sha256').update(bytes).digest('hex')});
  }finally{await rm(stage,{recursive:true,force:true});}
 }
 await writeFile(join(output,'modules.json'),JSON.stringify({format:1,packages:artifacts},null,2)+'\n');return artifacts;
}
if(import.meta.main){if(!process.argv[2])throw Error('Explicit fresh output directory required');console.log(JSON.stringify(await packModulePackages(process.argv[2])));}
