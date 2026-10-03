import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {pluginZip} from './archive.js';
const files=['plugin.json','skills/icloud-mail/SKILL.md','assets/plugin-icon.png','LICENSE','THIRD_PARTY_NOTICES.md'] as const;
/** Only immutable release-template files enter the archive; no directory traversal. */
export async function configuredPluginArchive(directory:string,publicOrigin:string):Promise<Uint8Array>{
 const origin=new URL(publicOrigin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('Invalid public origin');
 const entries=new Map<string,Uint8Array>();
 for(const name of files){const path=join(directory,name);if((await stat(path)).size>256*1024)throw Error('Plugin template exceeds limit');entries.set('icloud-plugin/'+name,await readFile(path));}
 const manifest=z.object({name:z.literal('icloud-plugin'),version:z.string().regex(/^\d+\.\d+\.\d+$/)}).passthrough().parse(JSON.parse(Buffer.from(entries.get('icloud-plugin/plugin.json')!).toString('utf8')) as unknown);
 if(!manifest.version)throw Error('Invalid plugin version');
 entries.set('icloud-plugin/mcp.json',Buffer.from(JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{'icloud-plugin':{type:'streamable-http',url:new URL('/icloud/mcp',origin).href}}},null,2)+'\n'));
 return pluginZip(entries);
}
