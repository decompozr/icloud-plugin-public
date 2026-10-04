import {packageVersionSchema} from './artifact.js';
import {cp,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dir,'../../..');
const version=packageVersionSchema.parse(await Bun.file(join(root,'apps/icloud/package.json')).json() as unknown).version;
const tag=process.argv[2]??`icloud-plugin:${version}`;
const context=await mkdtemp(join(tmpdir(),'icloud-build-context-'));
try{
 await mkdir(join(context,'apps/icloud'),{recursive:true});
 for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','plugin.json'])await cp(join(root,file),join(context,file));
 for(const file of ['package.json','bun.lock','tsconfig.json','tsconfig.build.json','src'])await cp(join(root,'apps/icloud',file),join(context,'apps/icloud',file),{recursive:true});
 await mkdir(join(context,'apps/icloud/assets'),{recursive:true});
 for(const name of ['plugin-icon.png','inter.ttf','inter-OFL.txt'])await cp(join(root,'apps/icloud/assets',name),join(context,'apps/icloud/assets',name));
 for(const skill of ['icloud-mail','icloud-calendar']){
  await mkdir(join(context,'skills',skill),{recursive:true});
  await cp(join(root,'skills',skill,'SKILL.md'),join(context,'skills',skill,'SKILL.md'));
 }
 await cp(join(root,'bin'),join(context,'bin'),{recursive:true});
 await cp(join(root,'packages/tooling'),join(context,'packages/tooling'),{recursive:true,filter:path=>!path.split('/').includes('node_modules')});
 await cp(join(root,'deployment/Containerfile'),join(context,'Containerfile'));
 const child=Bun.spawn(['container','build','--progress','plain','-t',tag,context],{stdout:'inherit',stderr:'inherit'});
 if(await child.exited!==0)throw Error('Container build failed');
}finally{await rm(context,{recursive:true,force:true});}
