import {artifactSchema,type Artifact} from './artifact.js';
import {cp,mkdir,readFile,rename,rm,symlink,lstat} from 'node:fs/promises';
import {resolve,join,relative,parse} from 'node:path';
export async function inspectArtifact(path:string):Promise<Artifact>{
 const value=artifactSchema.parse(JSON.parse(await readFile(join(path,'artifact.json'),'utf8')) as unknown);
 if(value.bun!==Bun.version)throw Error('Artifact requires its recorded Bun version');
 if(value.platform!==process.platform||value.arch!==process.arch)throw Error('Artifact does not match this runtime platform');
 for(const file of ['runtime.sh','apps/icloud/dist/index.js'])if(!(await lstat(join(path,file))).isFile())throw Error('Incomplete artifact');
 return value;
}
const marker=JSON.stringify({format:1,owner:'icloud-plugin-install'});
export async function installArtifact(source:string,prefix:string,update=false){
 source=resolve(source);prefix=resolve(prefix);
 if(prefix===parse(prefix).root)throw Error('Installation requires a dedicated application directory');
 if(!relative(source,prefix).startsWith('..'))throw Error('Installation must be outside artifact');
 const metadata=await inspectArtifact(source);
 if(update){if(await readFile(join(prefix,'.icloud-install'),'utf8')!==marker)throw Error('Not an owned installation');}
 else{await mkdir(prefix,{recursive:false});await Bun.write(join(prefix,'.icloud-install'),marker);}
 const id=`${metadata.version}-${metadata.platform}-${metadata.arch}`;
 const release=join(prefix,'releases',id),pending=join(prefix,`.current-${process.pid}`);
 await mkdir(join(prefix,'releases'),{recursive:true});
 try{
  await mkdir(release,{recursive:false});
 }catch{throw Error('Release exists; refusing overwrite');}
 try{
  await cp(source,release,{recursive:true,verbatimSymlinks:true,errorOnExist:true});
  await symlink(`releases/${id}`,pending);
  await rename(pending,join(prefix,'current'));
 }catch(error){await rm(pending,{force:true});await rm(release,{recursive:true,force:true});throw error;}
 return id;
}
export async function uninstallArtifact(prefix:string){
 prefix=resolve(prefix);
 if(prefix===parse(prefix).root)throw Error('Uninstall requires a dedicated application directory');
 if(await readFile(join(prefix,'.icloud-install'),'utf8')!==marker)throw Error('Not an owned installation');
 // Remove only deployment-owned entries. State, custody and unknown files survive.
 await rm(join(prefix,'current'),{force:true});
 await rm(join(prefix,'releases'),{recursive:true,force:true});
 await rm(join(prefix,'.icloud-install'));
}
if(import.meta.main){
 const [action,first,second]=process.argv.slice(2);
 if(action==='uninstall'&&first)await uninstallArtifact(first);
 else if((action==='install'||action==='update')&&first&&second)console.log(await installArtifact(first,second,action==='update'));
 else throw Error('Usage: install.ts install|update artifact-directory install-prefix; uninstall install-prefix');
}
