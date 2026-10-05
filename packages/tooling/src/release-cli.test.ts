import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm,cp,chmod,readlink,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('released CLI installs itself at standard prefix and runs preserved configuration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'icloud-release-cli-'));
 try{
  const artifact=join(dir,'release with spaces'),home=join(dir,'home');
  await mkdir(join(artifact,'apps/icloud/dist'),{recursive:true});
  const build=await Bun.build({entrypoints:[join(import.meta.dir,'release-cli.ts')],target:'bun',outdir:artifact,naming:'icloud-plugin.js'});
  expect(build.success).toBe(true);
  await cp(join(import.meta.dir,'icloud-plugin.sh'),join(artifact,'icloud-plugin'));await chmod(join(artifact,'icloud-plugin'),0o755);
  await Bun.write(join(artifact,'runtime.sh'),'#!/bin/sh\n');
  await Bun.write(join(artifact,'apps/icloud/dist/index.js'),'console.log(await Bun.file(process.argv[process.argv.indexOf("--config")+1]).text());if(process.argv.includes("--prepare-local-owner"))console.log(process.argv.includes("--no-open")?"fixture-local-proof-no-open":"fixture-local-proof-open");');
  await Bun.write(join(artifact,'artifact.json'),JSON.stringify({format:1,name:'icloud-plugin',version:'0.1.20',platform:process.platform,arch:process.arch,bun:Bun.version}));
  const execute=async(executable:string,...args:string[])=>{
   const child=Bun.spawn([executable,...args],{cwd:dir,env:{...process.env,HOME:home},stdout:'pipe',stderr:'pipe'});
   const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);return{code,out,err};
  };
  const cli=join(artifact,'icloud-plugin'),prefix=join(home,'.decompozr/plugins/icloud');
  expect((await execute(cli,'install')).code).toBe(0);
  expect(await readlink(join(prefix,'current'))).toBe('releases/0.1.20-'+process.platform+'-'+process.arch);
  await mkdir(join(prefix,'runtime'),{mode:0o700});await Bun.write(join(prefix,'runtime/config.toml'),'preserved-config');
  const preserved=['config.toml','state.sqlite','custody.key','unknown.txt'];
  for(const file of preserved){
   if(file!=='config.toml')await Bun.write(join(prefix,'runtime',file),`preserved-${file}`);
   await chmod(join(prefix,'runtime',file),0o600);
  }
  const before=await Promise.all(preserved.map(async file=>({file,bytes:await Bun.file(join(prefix,'runtime',file)).text(),mode:(await stat(join(prefix,'runtime',file))).mode&0o777})));
  expect((await execute(join(prefix,'current/icloud-plugin'),'run')).out.trim()).toBe('preserved-config');
  expect((await execute(join(prefix,'current/icloud-plugin'),'run','--prepare-local-owner','--no-open')).out.trim()).toBe('preserved-config\nfixture-local-proof-no-open');expect((await execute(cli,'install','--prepare-local-owner')).code).not.toBe(0);expect((await execute(cli,'install')).code).not.toBe(0);
  expect((await execute(cli,'update')).code).not.toBe(0);
  expect((await execute(cli,'install','--initialize')).code).not.toBe(0);
  expect(await Bun.file(join(prefix,'runtime/config.toml')).text()).toBe('preserved-config');
  expect((await execute(cli,'uninstall')).code).toBe(0);
  expect(await Bun.file(join(prefix,'runtime/config.toml')).text()).toBe('preserved-config');
  expect(await Bun.file(join(prefix,'.icloud-install')).exists()).toBe(true);
  expect((await execute(cli,'install')).code).toBe(0);
  expect((await execute(join(prefix,'current/icloud-plugin'),'run')).out.trim()).toBe('preserved-config');
  for(const value of before){
   expect(await Bun.file(join(prefix,'runtime',value.file)).text()).toBe(value.bytes);
   expect((await stat(join(prefix,'runtime',value.file))).mode&0o777).toBe(value.mode);
  }
  expect((await stat(join(prefix,'runtime'))).mode&0o777).toBe(0o700);
  const unknown=join(dir,'unknown-install');await mkdir(unknown);
  await Bun.write(join(unknown,'config.toml'),'unowned-config');
  expect((await execute(cli,'install','--prefix',unknown)).code).not.toBe(0);
  expect(await Bun.file(join(unknown,'config.toml')).text()).toBe('unowned-config');
  expect(await Bun.file(join(unknown,'.icloud-install')).exists()).toBe(false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
