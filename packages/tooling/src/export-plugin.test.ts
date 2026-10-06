import{test,expect}from'bun:test';
import{mkdtemp,readFile,rm,access}from'node:fs/promises';
import{tmpdir}from'node:os';
import{resolve,join}from'node:path';
import{z}from'zod';
import{exportPlugin}from'./export-plugin.js';
test('configured client artifact resolves portable marketplace paths and contains no fake app mapping',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'icloud-client-')),repository=resolve(import.meta.dir,'../../..'),output=join(temp,'client');
 try{
  await exportPlugin({repository,output,url:'https://fixture.example/icloud/mcp'});
  const marketplace=z.object({plugins:z.array(z.object({source:z.object({path:z.string()})}))}).parse(JSON.parse(await readFile(join(output,'.agents/plugins/marketplace.json'),'utf8')) as unknown);
  const pluginRoot=resolve(output,marketplace.plugins[0]!.source.path);expect(pluginRoot.startsWith(output+'/')).toBe(true);
  const config=z.object({$schema:z.literal('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'),mcpServers:z.record(z.object({type:z.literal('streamable-http'),url:z.string()}))}).parse(JSON.parse(await readFile(join(pluginRoot,'mcp.json'),'utf8')) as unknown);
  expect(config.mcpServers['icloud-plugin']?.url).toBe('https://fixture.example/icloud/mcp');
  expect(await readFile(join(pluginRoot,'skills/icloud-mail/SKILL.md'),'utf8')).toContain('untrusted data');
  expect(await readFile(join(pluginRoot,'skills/icloud-calendar/SKILL.md'),'utf8')).toContain('calendar.schedule');
  expect(await readFile(join(pluginRoot,'skills/icloud-photos/SKILL.md'),'utf8')).toContain('Shared Album writes are unsupported');
  await expect(access(join(pluginRoot,'apps/.app.json'))).rejects.toThrow();
  const archive=join(output,'icloud-plugin.zip');
  const check=Bun.spawn(['unzip','-t',archive],{stdout:'pipe',stderr:'pipe'});expect(await check.exited).toBe(0);
  const list=Bun.spawn(['unzip','-Z1',archive],{stdout:'pipe'});const names=(await new Response(list.stdout).text()).trim().split('\n');expect(await list.exited).toBe(0);
  expect(names.sort()).toEqual(['icloud-plugin/LICENSE','icloud-plugin/THIRD_PARTY_NOTICES.md','icloud-plugin/assets/plugin-icon.png','icloud-plugin/mcp.json','icloud-plugin/plugin.json','icloud-plugin/skills/icloud-mail/SKILL.md','icloud-plugin/skills/icloud-calendar/SKILL.md','icloud-plugin/skills/icloud-photos/SKILL.md'].sort());
  const extract=Bun.spawn(['unzip','-p',archive,'icloud-plugin/mcp.json'],{stdout:'pipe'});expect(await new Response(extract.stdout).text()).toBe(await readFile(join(pluginRoot,'mcp.json'),'utf8'));expect(await extract.exited).toBe(0);
  const metadata=JSON.parse(await readFile(join(pluginRoot,'plugin.json'),'utf8')) as {extensions:{'com.openai':{interface:{shortDescription:string;logo:string}}}};
  expect(metadata.extensions['com.openai'].interface.shortDescription.length).toBeLessThanOrEqual(30);
  await access(resolve(pluginRoot,metadata.extensions['com.openai'].interface.logo));
  const repeat=join(temp,'repeat');await exportPlugin({repository,output:repeat,url:'https://fixture.example/icloud/mcp'});
  expect(await readFile(join(repeat,'icloud-plugin.zip'))).toEqual(await readFile(archive));
  await expect(exportPlugin({repository,output,url:'https://fixture.example/icloud/mcp'})).rejects.toThrow();
  await expect(exportPlugin({repository,output:join(temp,'unsafe'),url:'https://user:secret@fixture.example/icloud/mcp'})).rejects.toThrow();
 }finally{await rm(temp,{recursive:true,force:true});}
});
