import{tmpdir}from'node:os';
import{packModulePackages}from'./module-packages.js';
import {stageHomeKitPayload} from './homekit-payload.js';
import {prepareServiceApp} from './service-app.js';
import {artifactSchema,packageVersionSchema} from './artifact.js';
import {cp,mkdir,rm,chmod,mkdtemp} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
const root=resolve(import.meta.dir,'../../..');
const target=`${process.platform}-${process.arch}`;
const output=resolve(process.argv[2]&&!process.argv[2]!.startsWith('--')?process.argv[2]!:join(root,'apps/studio/build',target));
const receiptFlag=process.argv.indexOf('--homekit-build-receipt'),teamFlag=process.argv.indexOf('--homekit-signing-team');
if((receiptFlag>=0||teamFlag>=0)&&(process.platform!=='darwin'||receiptFlag<0||teamFlag<0||!process.argv[receiptFlag+1]||!process.argv[teamFlag+1]))throw Error('HomeKit staging requires macOS, signed build receipt and explicit signing team');
if(await Bun.file(join(output,'artifact.json')).exists())throw Error('Build target already exists; use a fresh output directory.');
if(!await Bun.file(join(root,'apps/studio/dist/server/index.js')).exists())throw Error('Run the application build first.');
await mkdir(dirname(output),{recursive:true});
await mkdir(output,{recursive:false});
try{
 await mkdir(join(output,'apps/studio'),{recursive:true});
 for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,file),join(output,file));
 const moduleDirectory=join(output,'apps/studio/modules');
 const moduleArtifacts=await packModulePackages(moduleDirectory);
 const packageMetadata=JSON.parse(await Bun.file(join(root,'apps/studio/package.json')).text());
 for(const item of moduleArtifacts)packageMetadata.dependencies[item.name]='file:modules/'+item.file;
 // Source manifests pin external dependencies; reject accidental floating ranges.
 for(const [name,version]of Object.entries(packageMetadata.dependencies))if(!name.startsWith('@decompozr/')&&(typeof version!=='string'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)))throw Error('Artifact requires exact external dependency: '+name);
 delete packageMetadata.devDependencies;
 await Bun.write(join(output,'apps/studio/package.json'),JSON.stringify(packageMetadata,null,2)+'\n');
 for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','apps/studio/package.json'])await chmod(join(output,file),0o644);
 await cp(join(root,'apps/studio/dist/server'),join(output,'apps/studio/dist/server'),{recursive:true});
 // The standalone consumer records its own lock from exact package artifacts.
 const overrides:Record<string,string>={};for(const item of moduleArtifacts)overrides[item.name]='file:modules/'+item.file;
 packageMetadata.overrides=overrides;await Bun.write(join(output,'apps/studio/package.json'),JSON.stringify(packageMetadata,null,2)+'\n');
 const consumer=await mkdtemp(join(tmpdir(),'icloud-module-install-'));
 try{
  await cp(moduleDirectory,join(consumer,'modules'),{recursive:true});
  await Bun.write(join(consumer,'package.json'),JSON.stringify(packageMetadata,null,2)+'\n');
  const lock=Bun.spawn([process.execPath,'install','--lockfile-only','--save-text-lockfile'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
  if(await lock.exited!==0||!await Bun.file(join(consumer,'bun.lock')).exists())throw Error('Standalone consumer lock generation failed');
  const install=Bun.spawn([process.execPath,'install','--production','--frozen-lockfile'],{cwd:consumer,stdout:'inherit',stderr:'inherit'});
  if(await install.exited!==0)throw Error('Frozen artifact dependency preparation failed');
  await cp(join(consumer,'bun.lock'),join(output,'apps/studio/bun.lock'));
  await chmod(join(output,'apps/studio/bun.lock'),0o644);
  await cp(join(consumer,'node_modules'),join(output,'apps/studio/node_modules'),{recursive:true,verbatimSymlinks:true});
 }finally{await rm(consumer,{recursive:true,force:true});}
 const cli=await Bun.build({entrypoints:[join(root,'packages/tooling/src/release-cli.ts')],target:'bun',outdir:output,naming:'icloud-plugin.js'});
 if(!cli.success)throw new AggregateError(cli.logs,'Release CLI build failed');
 await cp(join(root,'packages/tooling/src/icloud-plugin.sh'),join(output,'icloud-plugin'));
 await chmod(join(output,'icloud-plugin'),0o755);
 await cp(join(root,'packages/tooling/src/runtime.sh'),join(output,'runtime.sh'));
 await chmod(join(output,'runtime.sh'),0o755);
 let homekit;if(receiptFlag>=0)homekit=await stageHomeKitPayload(output,resolve(process.argv[receiptFlag+1]!),process.argv[teamFlag+1]!);
 const metadata=packageVersionSchema.parse(await Bun.file(join(root,'apps/studio/package.json')).json() as unknown);
 await Bun.write(join(output,'artifact.json'),JSON.stringify(artifactSchema.parse({format:1,name:'icloud-plugin',version:metadata.version,platform:process.platform,arch:process.arch,bun:Bun.version,...homekit?{homekit}:{}}),null,2)+'\n');
 if(process.platform==='darwin')await prepareServiceApp(output,join(root,'packages/tooling/src/native/ServiceLauncher.swift'),metadata.version);
 console.log(output);
}catch(error){await rm(output,{recursive:true,force:true});throw error;}
