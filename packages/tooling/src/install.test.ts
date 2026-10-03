import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installArtifact,uninstallArtifact} from './install.js';
test('scoped version switch preserves state; mismatched update leaves current intact',async()=>{
 await expect(installArtifact('/unused','/')).rejects.toThrow('dedicated application directory');
 await expect(uninstallArtifact('/')).rejects.toThrow('dedicated application directory');
 const dir=await mkdtemp(join(tmpdir(),'icloud-install-test-'));
 const source=join(dir,'artifact'),prefix=join(dir,'install');
 try{
  await mkdir(join(source,'apps/icloud/dist'),{recursive:true});
  await Bun.write(join(source,'runtime.sh'),'#!/bin/sh\nexit 0\n');
  await Bun.write(join(source,'apps/icloud/dist/index.js'),'// fixture artifact only');
  const metadata={format:1,name:'icloud-plugin',version:'0.1.0',platform:process.platform,arch:process.arch,bun:Bun.version};
  await Bun.write(join(source,'artifact.json'),JSON.stringify(metadata));
  await installArtifact(source,prefix);
  const original=await readlink(join(prefix,'current'));
  await Bun.write(join(prefix,'state.sqlite'),'retained private state');
  await Bun.write(join(prefix,'custody.key'),'retained dummy key');
  await Bun.write(join(source,'artifact.json'),JSON.stringify({...metadata,version:'0.2.0',platform:'invalid'}));
  await expect(installArtifact(source,prefix,true)).rejects.toThrow('platform');
  expect(await readlink(join(prefix,'current'))).toBe(original);
  await Bun.write(join(source,'artifact.json'),JSON.stringify({...metadata,version:'0.2.0'}));
  await installArtifact(source,prefix,true);
  expect(await readlink(join(prefix,'current'))).toContain('0.2.0');
  expect(await Bun.file(join(prefix,'releases',original.split('/')[1]!,'artifact.json')).exists()).toBe(true);
  await uninstallArtifact(prefix);
  expect(await Bun.file(join(prefix,'state.sqlite')).text()).toBe('retained private state');
  expect(await Bun.file(join(prefix,'custody.key')).text()).toBe('retained dummy key');
  expect(await Bun.file(join(prefix,'.icloud-install')).exists()).toBe(false);
  await expect(uninstallArtifact(dir)).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Tailscale diagnostics exports only allowlisted fields, no raw secret',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'icloud-diagnostics-test-'));
 try{
  const binary=join(dir,'tailscale-fixture');
  await Bun.write(binary,'#!/bin/sh\nprintf \'%s\' \'{"BackendState":"Running","Self":{"Online":true},"Secret":"never-export"}\'\n');
  await import('node:fs/promises').then(fs=>fs.chmod(binary,0o700));
  const output=join(dir,'diagnostics.json');
  const child=Bun.spawn([process.execPath,join(import.meta.dir,'./tailscale-status.ts'),output,`--binary=${binary}`],{stdout:'pipe',stderr:'pipe'});
  expect(await child.exited).toBe(0);
  const value=await Bun.file(output).json();
  expect(value).toEqual({installed:true,authenticated:true,online:true,checkedAt:expect.any(String)});
  expect(await Bun.file(output).text()).not.toContain('Secret');
 }finally{await rm(dir,{recursive:true,force:true});}
});
