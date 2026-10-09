import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm,readlink,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installArtifact,uninstallArtifact} from './install.js';
test('scoped version switch preserves state; mismatched update leaves current intact',async()=>{
 await expect(installArtifact('/unused','/')).rejects.toThrow('dedicated application directory');
 await expect(uninstallArtifact('/')).rejects.toThrow('dedicated application directory');
 const dir=await mkdtemp(join(tmpdir(),'icloud-install-test-'));
 const source=join(dir,'artifact'),prefix=join(dir,'install');
 try{
  await mkdir(join(source,'apps/studio/dist'),{recursive:true});
  await Bun.write(join(source,'runtime.sh'),'#!/bin/sh\nexit 0\n');
  await Bun.write(join(source,'apps/studio/dist/server/index.js'),'// fixture artifact only');
  const metadata={format:1,name:'icloud-plugin',version:'0.1.0',platform:process.platform,arch:process.arch,bun:Bun.version};
  await Bun.write(join(source,'artifact.json'),JSON.stringify(metadata));
  await installArtifact(source,prefix);
  const original=await readlink(join(prefix,'current'));
  await Bun.write(join(prefix,'state.sqlite'),'retained private state');
  await Bun.write(join(prefix,'custody.key'),'retained dummy key');
  const policy='[mail]\nread=true\nwrite=true\n[calendar]\nread=false\nwrite=false\nschedule=false\nshare=false\n';
  await Bun.write(join(prefix,'config.toml'),policy);
  await Bun.write(join(prefix,'calendar-operations.sqlite'),'retained unknown calendar operation');
  await Bun.write(join(source,'artifact.json'),JSON.stringify({...metadata,version:'0.2.0',platform:'invalid'}));
  await expect(installArtifact(source,prefix,true)).rejects.toThrow('platform');
  expect(await readlink(join(prefix,'current'))).toBe(original);
  await Bun.write(join(source,'artifact.json'),JSON.stringify({...metadata,version:'0.2.0'}));
  await installArtifact(source,prefix,true);
  expect(await readlink(join(prefix,'current'))).toContain('0.2.0');
  expect(await Bun.file(join(prefix,'releases',original.split('/')[1]!,'artifact.json')).exists()).toBe(true);
  expect(await Bun.file(join(prefix,'config.toml')).text()).toBe(policy);
  expect(await Bun.file(join(prefix,'state.sqlite')).text()).toBe('retained private state');
  expect(await Bun.file(join(prefix,'calendar-operations.sqlite')).text()).toBe('retained unknown calendar operation');
  await uninstallArtifact(prefix);
  expect(await Bun.file(join(prefix,'state.sqlite')).text()).toBe('retained private state');
  expect(await Bun.file(join(prefix,'custody.key')).text()).toBe('retained dummy key');
  expect(await Bun.file(join(prefix,'config.toml')).text()).toBe(policy);
  expect(await Bun.file(join(prefix,'calendar-operations.sqlite')).text()).toBe('retained unknown calendar operation');
  expect(await Bun.file(join(prefix,'.icloud-install')).exists()).toBe(true);
  await installArtifact(source,prefix);
  expect(await readlink(join(prefix,'current'))).toContain('0.2.0');
  expect(await Bun.file(join(prefix,'state.sqlite')).text()).toBe('retained private state');
  expect(await Bun.file(join(prefix,'custody.key')).text()).toBe('retained dummy key');
  expect(await Bun.file(join(prefix,'config.toml')).text()).toBe(policy);
  expect(await Bun.file(join(prefix,'calendar-operations.sqlite')).text()).toBe('retained unknown calendar operation');
  await expect(uninstallArtifact(dir)).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('installation refuses unknown directories and symlinked ownership boundaries',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'icloud-install-boundary-'));
 try{
  const source=join(dir,'artifact'),prefix=join(dir,'install');
  await mkdir(join(source,'apps/studio/dist'),{recursive:true});
  await Bun.write(join(source,'runtime.sh'),'#!/bin/sh\n');
  await Bun.write(join(source,'apps/studio/dist/server/index.js'),'// fixture');
  await Bun.write(join(source,'artifact.json'),JSON.stringify({format:1,name:'icloud-plugin',version:'0.1.0',platform:process.platform,arch:process.arch,bun:Bun.version}));
  await mkdir(prefix);
  await Bun.write(join(prefix,'unknown.txt'),'preserve me');
  await expect(installArtifact(source,prefix)).rejects.toThrow();
  expect(await Bun.file(join(prefix,'unknown.txt')).text()).toBe('preserve me');
  expect(await Bun.file(join(prefix,'.icloud-install')).exists()).toBe(false);
  const owned=join(dir,'owned'),alias=join(dir,'alias');
  await installArtifact(source,owned);
  await uninstallArtifact(owned);
  await symlink(owned,alias);
  await expect(installArtifact(source,alias)).rejects.toThrow('owned installation directory');
  await expect(installArtifact(source,alias,true)).rejects.toThrow('owned installation directory');
  await expect(uninstallArtifact(alias)).rejects.toThrow('owned installation directory');
  await symlink(join(owned,'.icloud-install'),join(prefix,'.icloud-install'));
  await expect(installArtifact(source,prefix)).rejects.toThrow('Not an owned installation');
  await expect(installArtifact(source,prefix,true)).rejects.toThrow('Not an owned installation');
  await expect(uninstallArtifact(prefix)).rejects.toThrow('Not an owned installation');
  await symlink(join(dir,'missing'),join(owned,'current'));
  await expect(installArtifact(source,owned)).rejects.toThrow('deployment files');
  expect(await Bun.file(join(prefix,'unknown.txt')).text()).toBe('preserve me');
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
