import{mkdir,readFile,writeFile,cp,rm}from'node:fs/promises';
import{resolve,join}from'node:path';
import{z}from'zod';
import{pluginZip}from'../../../apps/icloud/src/plugin/archive.js';
const manifest=z.object({$schema:z.literal('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'),name:z.literal('icloud-plugin'),version:z.string().regex(/^\d+\.\d+\.\d+$/),description:z.string().min(1),license:z.string(),keywords:z.array(z.string()),extensions:z.object({'com.openai':z.object({interface:z.object({displayName:z.string().min(1),shortDescription:z.string().min(1).max(30),longDescription:z.string().min(1),category:z.literal('Productivity'),defaultPrompt:z.string().min(1),logo:z.literal('./assets/plugin-icon.png'),composerIcon:z.literal('./assets/plugin-icon.png')}).strict()}).strict()}).strict()}).strict();
const endpoint=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/icloud/mcp';},'A configured HTTPS /icloud/mcp URL without credentials is required');
export async function exportPlugin(options:{repository:string;output:string;url:string}){
 const url=endpoint.parse(options.url),root=resolve(options.output);
 const plugin=manifest.parse(JSON.parse(await readFile(join(options.repository,'plugin.json'),'utf8')) as unknown);
 const skill=await readFile(join(options.repository,'skills/icloud-mail/SKILL.md'),'utf8');
 if(!skill.startsWith('---\nname: icloud-mail\n'))throw Error('Missing workflow skill');
 // Exclusive destination: a configured artifact is immutable and never overwrites another.
 await mkdir(root,{recursive:false});
 try{
  const directory=join(root,'plugins/icloud-plugin');await mkdir(join(directory,'skills/icloud-mail'),{recursive:true});
  await mkdir(join(root,'.agents/plugins'),{recursive:true});
  await writeFile(join(directory,'plugin.json'),JSON.stringify(plugin,null,2)+'\n');
  await writeFile(join(directory,'mcp.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{'icloud-plugin':{type:'streamable-http',url}}},null,2)+'\n');
  await writeFile(join(directory,'skills/icloud-mail/SKILL.md'),skill);
  await writeFile(join(root,'.agents/plugins/marketplace.json'),JSON.stringify({name:'icloud-plugin-local',plugins:[{name:'icloud-plugin',source:{source:'local',path:'./plugins/icloud-plugin'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]},null,2)+'\n');
  await mkdir(join(directory,'assets'));
  await cp(join(options.repository,'apps/icloud/assets/plugin-icon.png'),join(directory,'assets/plugin-icon.png'));
  await cp(join(options.repository,'LICENSE'),join(directory,'LICENSE'));
  await cp(join(options.repository,'THIRD_PARTY_NOTICES.md'),join(directory,'THIRD_PARTY_NOTICES.md'));
  const files=new Map<string,Uint8Array>();
  for(const file of ['plugin.json','mcp.json','skills/icloud-mail/SKILL.md','assets/plugin-icon.png','LICENSE','THIRD_PARTY_NOTICES.md'])files.set('icloud-plugin/'+file,await readFile(join(directory,file)));
  await writeFile(join(root,'icloud-plugin.zip'),pluginZip(files));
  await writeFile(join(root,'README.md'),`# Configured iCloud plugin\n\nEndpoint: ${url}\n\nicloud-plugin.zip is the standalone private plugin package; the surrounding directory is a local Codex marketplace. Neither is an installed connection. Add this directory as a local marketplace using the supported Codex plugin workflow, then install icloud-plugin and complete owner OAuth. The service endpoint must be reachable first. No credentials are included.\n\nFor ChatGPT, import the standalone ZIP through a supported private plugin account workflow, or add the remote MCP URL manually. Complete owner OAuth after installation. This artifact does not create a ChatGPT app ID or publish/upload an app.\n`);
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
 return root;
}
if(import.meta.main){
 const args=process.argv.slice(2),url=args[args.indexOf('--url')+1],output=args[args.indexOf('--out')+1];
 if(!args.includes('--url')||!args.includes('--out')||!url||!output)throw Error('Usage: export-plugin.ts --url https://host/icloud/mcp --out NEW_DIRECTORY');
 console.log(await exportPlugin({repository:resolve(import.meta.dir,'../../..'),output,url}));
}
