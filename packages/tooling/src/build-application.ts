import{resolve,join}from'node:path';
import{mkdir,rm,cp}from'node:fs/promises';
import{command,repository}from'./command.js';
const app=join(repository,'apps/icloud'),source=join(app,'src'),output=join(app,'dist');
const sourceMetadata=JSON.parse(await Bun.file(join(app,'package.json')).text()) as {version:string};
const pluginMetadata=JSON.parse(await Bun.file(join(repository,'plugin.json')).text()) as {version:string};
const studioMetadata=JSON.parse(await Bun.file(join(repository,'apps/studio/package.json')).text()) as {version:string};
if(studioMetadata.version!==sourceMetadata.version)throw Error('Studio and application versions must match before building.');
if(pluginMetadata.version!==sourceMetadata.version)throw Error('Application and downloadable plugin versions must match before building.');
await command([process.execPath,'run','--cwd',join(repository,'apps/studio'),'build']);
await command([process.execPath,'run','--cwd',join(repository,'apps/studio'),'typecheck']);
await command([process.execPath,'run','--cwd',app,'typecheck']);
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await command([process.execPath,'run','--cwd',app,'build:types']);
const entries:string[]=[];
for await(const path of new Bun.Glob('**/*.ts').scan(source))if(!path.includes('test-fixtures/')&&!path.endsWith('.test.ts')&&!path.endsWith('.worker.ts'))entries.push(resolve(source,path));
const server=await Bun.build({entrypoints:entries,root:source,outdir:output,target:'bun',packages:'external',splitting:true});
if(!server.success)throw new AggregateError(server.logs,'Application build failed');
await mkdir(join(output,'assets'),{recursive:true});
await cp(join(repository,'apps/studio/THIRD_PARTY_NOTICES.md'),join(output,'assets/studio-LICENSES.txt'));
await Bun.write(join(output,'assets/runtime-version.json'),JSON.stringify({version:sourceMetadata.version})+'\n');
for(const name of ['auth-browser.js','admin-browser.js'])await cp(join(repository,'apps/studio/dist/assets',name),join(output,'assets',name));
await Bun.write(join(output,'assets/plugin-icon.png'),Bun.file(join(app,'assets/plugin-icon.png')));
console.log('Built private application modules and browser assets; test files excluded.');

const template=join(output,'plugin-template');await mkdir(join(template,'skills/icloud-mail'),{recursive:true});await mkdir(join(template,'skills/icloud-calendar'),{recursive:true});await mkdir(join(template,'skills/icloud-photos'),{recursive:true});await mkdir(join(template,'assets'),{recursive:true});
for(const name of ['plugin.json','LICENSE','THIRD_PARTY_NOTICES.md','skills/icloud-mail/SKILL.md','skills/icloud-calendar/SKILL.md','skills/icloud-photos/SKILL.md'])await cp(join(repository,name),join(template,name));
await cp(join(app,'assets/plugin-icon.png'),join(template,'assets/plugin-icon.png'));

// Photos sidecars are application assets, not executable TypeScript entries.
await mkdir(join(output,'photos'),{recursive:true});
for(const name of ['reader.py','metadata-write.py','cloud-session.py','cloud-session-requirements.txt','shared-stream-request.py','shared-stream-upload.py','shared-test-fixture.py'])await cp(join(source,'photos',name),join(output,'photos',name));
await cp(join(source,'photos/native'),join(output,'photos/native'),{recursive:true});

for(const name of ['inter.ttf','inter-OFL.txt'])await Bun.write(join(output,'assets',name),Bun.file(join(app,'assets',name)));
