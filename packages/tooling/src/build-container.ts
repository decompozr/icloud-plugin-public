import {packageVersionSchema} from './artifact.js';
import {cp,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dir,'../../..');
const version=packageVersionSchema.parse(await Bun.file(join(root,'apps/studio/package.json')).json() as unknown).version;
const tag=process.argv[2]??`icloud-plugin:${version}`;
const context=await mkdtemp(join(tmpdir(),'icloud-build-context-'));
try{
 for(const file of ['package.json','bun.lock','LICENSE','THIRD_PARTY_NOTICES.md','plugin.json'])await cp(join(root,file),join(context,file));
 const filter=(path:string)=>!path.split('/').some(part=>['node_modules','dist','.decompozr','.git','.svelte-kit','paraglide'].includes(part));
 for(const owner of ['apps/studio','apps/e2e','packages/tooling','packages/ui','modules','bin','skills'])await cp(join(root,owner),join(context,owner),{recursive:true,filter});
 await cp(join(root,'deployment/Containerfile'),join(context,'Containerfile'));
 const child=Bun.spawn(['container','build','--progress','plain','-t',tag,context],{stdout:'inherit',stderr:'inherit'});
 if(await child.exited!==0)throw Error('Container build failed');
}finally{await rm(context,{recursive:true,force:true});}
