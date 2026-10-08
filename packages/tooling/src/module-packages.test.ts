import{test,expect}from'bun:test';
import{mkdtemp,rm,mkdir,writeFile,readFile,realpath}from'node:fs/promises';
import{tmpdir}from'node:os';import{join,resolve}from'node:path';
import{packModulePackages}from'./module-packages.js';
test('versioned packages install and compile outside the repository without source fallbacks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'icloud-package-consumer-'));
 try{
  const packs=await packModulePackages(join(root,'packages'));expect(packs).toHaveLength(6);
  const dependencies=Object.fromEntries(packs.map(p=>[p.name,'file:packages/'+p.file]));
  const overrides={...dependencies};Object.assign(dependencies,{svelte:'5.57.1',vite:'8.3.3','@sveltejs/vite-plugin-svelte':'7.3.1'});
  await writeFile(join(root,'package.json'),JSON.stringify({private:true,type:'module',dependencies,overrides}));
  async function run(args:string[]){const child=Bun.spawn([process.execPath,...args],{cwd:root,stdout:'pipe',stderr:'pipe'});const code=await child.exited;const error=await new Response(child.stderr).text();if(code)throw Error(error);expect(code).toBe(0);return await new Response(child.stdout).text();}
  await run(['install','--lockfile-only','--save-text-lockfile']);expect(await Bun.file(join(root,'bun.lock')).exists()).toBe(true);await run(['install','--frozen-lockfile']);
  const exports=packs.map(p=>p.name==='@decompozr/account'?p.name+'/server':p.name==='@decompozr/ui'?p.name+'/branding.js':p.name+'/ui');
  await writeFile(join(root,'verify.ts'),"import{realpathSync}from'node:fs';import{SqliteOwnerStore,withOAuthMutation}from'@decompozr/account/server';const root=realpathSync(process.cwd());for(const name of "+JSON.stringify(exports)+"){const path=realpathSync(Bun.resolveSync(name,process.cwd()));if(!path.startsWith(root+'/'))throw Error('Source fallback '+name)}if(typeof SqliteOwnerStore.provision!=='function'||typeof withOAuthMutation!=='function')throw Error('Missing server API');console.log('six isolated exports and server API loaded');");expect(await run(['verify.ts'])).toContain('six isolated exports and server API loaded');
  await writeFile(join(root,'index.html'),'<div id="app"></div><script type="module" src="/main.ts"></script>');await writeFile(join(root,'main.ts'),"import{mount}from'svelte';import App from './App.svelte';mount(App,{target:document.getElementById('app')!});");
  await writeFile(join(root,'App.svelte'),`<script lang="ts">import{setContext}from'svelte';import{moduleUi as mail}from'@decompozr/mail/ui';import{moduleUi as calendar}from'@decompozr/calendar/ui';import{moduleUi as photos}from'@decompozr/photos/ui';import{moduleUi as homekit}from'@decompozr/homekit/ui';import AccountCard from '@decompozr/account/ui/AccountCard.svelte';import{DialogCenter}from'@decompozr/account/ui';const modules=[mail,calendar,photos,homekit],dialogs=new DialogCenter();setContext('copy',{t:(key:string)=>key,authT:(key:string)=>key,richText:()=>[]});</script>{#each modules as module}<p>{module.id}</p>{/each}<AccountCard account={{id:'fixture',user:'fixture@example.invalid',label:'Fixture',credentialStored:false}} {dialogs} onrevoke={()=>{}}/>`);
  await writeFile(join(root,'vite.config.ts'),"import{defineConfig}from'vite';import{svelte}from'@sveltejs/vite-plugin-svelte';export default defineConfig({plugins:[svelte({configFile:false})],resolve:{dedupe:['svelte']},ssr:{noExternal:[/^@decompozr\\//,'svelte']}});");await run(['node_modules/vite/bin/vite.js','build']);
  let files=0;for await(const path of new Bun.Glob('**/*.js').scan(join(root,'dist'))){const text=await readFile(join(root,'dist',path),'utf8');expect(/bun:sqlite|SqliteOwnerStore|createOwnerAuth|node:fs|createDecipheriv/.test(text)).toBe(false);files++;}expect(files).toBeGreaterThan(0);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
