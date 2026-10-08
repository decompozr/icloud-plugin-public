import{resolve,join,dirname,relative,sep}from'node:path';
import{mkdir,rm,cp}from'node:fs/promises';
import{command,repository}from'./command.js';
const app=join(repository,'apps/icloud'),source=join(app,'src'),output=join(app,'dist');
const sourceMetadata=JSON.parse(await Bun.file(join(app,'package.json')).text()) as {version:string};
const pluginMetadata=JSON.parse(await Bun.file(join(repository,'plugin.json')).text()) as {version:string};
const studioMetadata=JSON.parse(await Bun.file(join(repository,'apps/studio/package.json')).text()) as {version:string};
if(studioMetadata.version!==sourceMetadata.version)throw Error('Studio and application versions must match before building.');
if(pluginMetadata.version!==sourceMetadata.version)throw Error('Application and downloadable plugin versions must match before building.');
await command([process.execPath,join(repository,'packages/tooling/src/build-account.ts')]);
await command([process.execPath,'run','--cwd',join(repository,'apps/studio'),'build']);
await command([process.execPath,'run','--cwd',join(repository,'apps/studio'),'typecheck']);
await command([process.execPath,'run','--cwd',app,'typecheck']);
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await command([process.execPath,'run','--cwd',app,'build:types']);
const excludedPhotos = new Set(["archived-sharing-module.ts", "shared-albums.ts", "cloud-setup.ts", "cloud-session.ts", "shared-stream.ts", "upload-source.ts", "cloud-setup-browser.ts", "cloud-setup-ui.ts", "cloud-verification.ts", "shared-management-contract.ts", "shared-stream-protocol.ts", "shared-upload-contract.ts"]);
for(const file of excludedPhotos)await rm(join(output,"photos",file.replace(/\.ts$/,".d.ts")),{force:true});
const entries:string[]=[];
for await(const path of new Bun.Glob('**/*.ts').scan(source))if(!(path.startsWith('photos/')&&excludedPhotos.has(path.slice(7)))&&!path.includes('test-fixtures/')&&!path.endsWith('.test.ts')&&!path.endsWith('.worker.ts'))entries.push(resolve(source,path));
const server=await Bun.build({entrypoints:entries,root:source,outdir:output,target:'bun',packages:'external',splitting:true});
if(!server.success)throw new AggregateError(server.logs,'Application build failed');
await cp(join(repository,'apps/studio/dist/lib/connection-readiness.d.ts'),join(output,'admin/readiness.d.ts'));

// Transitional built-test facade forwards to the same installed package instance.
await mkdir(join(output,'account'),{recursive:true});
await Bun.write(join(output,'account/index.js'),"export * from '@decompozr/account/server';\n");
await Bun.write(join(output,'account/index.d.ts'),"export * from '@decompozr/account/server';\n");
await cp(join(repository,'apps/studio/dist/kit'),join(output,'studio'),{recursive:true});
await mkdir(join(output,'assets'),{recursive:true});
await cp(join(repository,'apps/studio/THIRD_PARTY_NOTICES.md'),join(output,'assets/studio-LICENSES.txt'));
await Bun.write(join(output,'assets/runtime-version.json'),JSON.stringify({version:sourceMetadata.version})+'\n');
await Bun.write(join(output,'assets/plugin-icon.png'),Bun.file(join(app,'assets/plugin-icon.png')));
console.log('Built private application modules and browser assets; test files excluded.');

const template=join(output,'plugin-template');await mkdir(join(template,'skills/icloud-mail'),{recursive:true});await mkdir(join(template,'skills/icloud-calendar'),{recursive:true});await mkdir(join(template,'skills/icloud-photos'),{recursive:true});await mkdir(join(template,'assets'),{recursive:true});
for(const name of ['plugin.json','LICENSE','THIRD_PARTY_NOTICES.md','skills/icloud-mail/SKILL.md','skills/icloud-calendar/SKILL.md','skills/icloud-photos/SKILL.md'])await cp(join(repository,name),join(template,name));
await cp(join(app,'assets/plugin-icon.png'),join(template,'assets/plugin-icon.png'));

// Only local Photos sidecars and Helper source ship; shared publication stays archived.
await mkdir(join(output,'photos/native'),{recursive:true});
for(const name of ['reader.py','metadata-write.py'])await cp(join(source,'photos',name),join(output,'photos',name));
for(const name of ['PhotosHelper.swift','Info.plist'])await cp(join(source,'photos/native',name),join(output,'photos/native',name));

for(const name of ['inter.ttf','inter-OFL.txt','lucide-LICENSE.txt','mcp-sdk-LICENSE.txt'])await Bun.write(join(output,'assets',name),Bun.file(join(app,'assets',name)));

await mkdir(join(output,'homekit'),{recursive:true});
await cp(join(source,'homekit/stdio-adapter.py'),join(output,'homekit/stdio-adapter.py'));
