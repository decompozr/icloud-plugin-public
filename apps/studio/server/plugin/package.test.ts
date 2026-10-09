import {test,expect} from 'bun:test';
import {configuredPluginArchive} from './package.js';
import {mkdtemp,rm,cp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
test('configured archive uses only installed template allowlist and trusted HTTPS URL',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'icloud-zip-'));try{
 const repo=resolve(import.meta.dir,'../../../..');
 await cp(join(repo,'apps/studio/dist/server/plugin-template'),join(dir,'template'),{recursive:true});
 await writeFile(join(dir,'template','SECRET'),'not-packaged');
 const bytes=await configuredPluginArchive(join(dir,'template'),'https://service.example.invalid');
 const path=join(dir,'plugin.zip');await writeFile(path,bytes);
 const check=Bun.spawn(['unzip','-t',path],{stdout:'pipe'});expect(await check.exited).toBe(0);
 const list=Bun.spawn(['unzip','-Z1',path],{stdout:'pipe'});const names=(await new Response(list.stdout).text()).trim().split('\n');expect(names).toHaveLength(8);expect(names).toContain('icloud-plugin/skills/icloud-calendar/SKILL.md');expect(names).toContain('icloud-plugin/skills/icloud-photos/SKILL.md');expect(names.some(n=>n.includes('SECRET'))).toBe(false);
 const read=Bun.spawn(['unzip','-p',path,'icloud-plugin/mcp.json'],{stdout:'pipe'});const config=await new Response(read.stdout).text();expect(config).toContain('https://service.example.invalid/icloud/mcp');expect(config).not.toContain('not-packaged');
 expect(Buffer.from(await configuredPluginArchive(join(dir,'template'),'https://service.example.invalid')).equals(Buffer.from(bytes))).toBe(true);
 await expect(configuredPluginArchive(join(dir,'template'),'http://localhost')).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
