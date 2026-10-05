import{resolve,join}from'node:path';
import{mkdir,rm,cp}from'node:fs/promises';
import{command,repository}from'./command.js';
const app=join(repository,'apps/icloud'),source=join(app,'src'),output=join(app,'dist');
const sourceMetadata=JSON.parse(await Bun.file(join(app,'package.json')).text()) as {version:string};
const pluginMetadata=JSON.parse(await Bun.file(join(repository,'plugin.json')).text()) as {version:string};
if(pluginMetadata.version!==sourceMetadata.version)throw Error('Application and downloadable plugin versions must match before building.');
await command([process.execPath,'run','--cwd',app,'typecheck']);
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await command([process.execPath,'run','--cwd',app,'build:types']);
const entries:string[]=[];
for await(const path of new Bun.Glob('**/*.ts').scan(source))if(!path.includes('test-fixtures/')&&!path.endsWith('.test.ts')&&!path.endsWith('.worker.ts'))entries.push(resolve(source,path));
const server=await Bun.build({entrypoints:entries,root:source,outdir:output,target:'bun',packages:'external',splitting:true});
if(!server.success)throw new AggregateError(server.logs,'Application build failed');
const browser=await Bun.build({entrypoints:[join(source,'auth/browser.ts'),join(source,'admin/browser.ts')],root:source,outdir:join(output,'browser'),target:'browser'});
if(!browser.success)throw new AggregateError(browser.logs,'Browser build failed');
await mkdir(join(output,'assets'),{recursive:true});
await Bun.write(join(output,'assets/runtime-version.json'),JSON.stringify({version:sourceMetadata.version})+'\n');
await Bun.write(join(output,'assets/auth-browser.js'),Bun.file(join(output,'browser/auth/browser.js')));
await Bun.write(join(output,'assets/admin-browser.js'),Bun.file(join(output,'browser/admin/browser.js')));
await Bun.write(join(output,'assets/plugin-icon.png'),Bun.file(join(app,'assets/plugin-icon.png')));
await rm(join(output,'browser'),{recursive:true,force:true});
console.log('Built private application modules and browser assets; test files excluded.');

const template=join(output,'plugin-template');await mkdir(join(template,'skills/icloud-mail'),{recursive:true});await mkdir(join(template,'skills/icloud-calendar'),{recursive:true});await mkdir(join(template,'skills/icloud-photos'),{recursive:true});await mkdir(join(template,'assets'),{recursive:true});
for(const name of ['plugin.json','LICENSE','THIRD_PARTY_NOTICES.md','skills/icloud-mail/SKILL.md','skills/icloud-calendar/SKILL.md','skills/icloud-photos/SKILL.md'])await cp(join(repository,name),join(template,name));
await cp(join(app,'assets/plugin-icon.png'),join(template,'assets/plugin-icon.png'));

// Photos sidecars are application assets, not executable TypeScript entries.
await mkdir(join(output,'photos'),{recursive:true});
for(const name of ['reader.py','metadata-write.py','cloud-session.py','cloud-session-requirements.txt','shared-stream-request.py','shared-stream-upload.py'])await cp(join(source,'photos',name),join(output,'photos',name));
await cp(join(source,'photos/native'),join(output,'photos/native'),{recursive:true});

for(const name of ['inter.ttf','inter-OFL.txt'])await Bun.write(join(output,'assets',name),Bun.file(join(app,'assets',name)));
