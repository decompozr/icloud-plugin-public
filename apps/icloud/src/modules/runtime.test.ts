import {expect,test} from 'bun:test';
import {generateKeyPair,SignJWT} from 'jose';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ModuleRuntime,type RuntimeModule} from './runtime.js';
import {createServer} from '../mcp/server.js';
import {createHttpApp} from '../server/http.js';
import {createVerifier} from '../../../../modules/account/dist/index.js';
import {mailRegistration} from '../mail/mcp/tools.js';
import type {MailOperations} from '../mail/domain/mail.js';
import type {Config} from '../mail/config.js';
const config:Config={user:'',password:'',allowRead:true,allowWrites:false,allowSend:false,transport:'http',host:'127.0.0.1',port:8787,publicUrl:'https://example.test/icloud/mcp',issuer:'https://example.test/auth',audience:'https://example.test/icloud/mcp',jwksUrl:'https://example.test/jwks',scopes:['mail.read','calendar.read'],allowedSubjects:['owner']};
const unused=async()=>{throw Error('unexpected Mail provider access');};
const mail:MailOperations={listMailboxes:async()=>[],search:unused,read:unused,mark:unused,move:unused,flag:unused,tag:unused,organize:unused,batch:unused};
function calendar():RuntimeModule{return{id:'calendar',scopes:[{name:'calendar.read',title:'Read calendar',description:'Test-only calendar',enabled:()=>true}],tools:[{tool:{name:'calendar_list',inputSchema:{type:'object'}},requiredScopes:['calendar.read'],enabled:()=>true,run:async()=>({content:[{type:'text',text:'calendar fixture'}]})}]};}

test('registration rejects duplicate IDs, names, foreign namespaces and undeclared tool scopes atomically',()=>{
 const runtime=new ModuleRuntime().register(calendar());expect(()=>runtime.register(calendar())).toThrow();
 for(const invalid of [
  {...calendar(),id:'other'},
  {...calendar(),scopes:[...calendar().scopes,...calendar().scopes]},
  {...calendar(),tools:[...calendar().tools,...calendar().tools]},
  {...calendar(),tools:[{...calendar().tools[0]!,tool:{name:'calendar_',inputSchema:{type:'object' as const}}}]},
  {...calendar(),tools:[{...calendar().tools[0]!,tool:{name:'calendar_bad\nname',inputSchema:{type:'object' as const}}}]},
  {...calendar(),tools:[{...calendar().tools[0]!,requiredScopes:['mail.read']}]},
 ]){const fresh=new ModuleRuntime();expect(()=>fresh.register(invalid)).toThrow();expect(fresh.listTools()).toEqual([]);expect(fresh.scopeDescriptors).toEqual([]);}
});

test('one MCP host composes Mail and fake Calendar; live Mail policy remains independent',async()=>{
 const policy={...config};const runtime=new ModuleRuntime().register(mailRegistration(mail,policy)).register(calendar());
 const server=createServer(runtime,config.publicUrl,new Set(['mail.read','mail.write','calendar.read']));const client=new Client({name:'mixed',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 try{
  expect((await client.listTools()).tools.map(t=>t.name)).toContain('calendar_list');
  expect((await client.listTools()).tools.map(t=>t.name)).not.toContain('mail_mark');
  policy.allowWrites=true;expect((await client.listTools()).tools.map(t=>t.name)).toContain('mail_mark');
  expect((await client.callTool({name:'mail_list_mailboxes',arguments:{}})).isError).not.toBe(true);
  policy.allowRead=false;expect((await client.listTools()).tools.map(t=>t.name)).toEqual(['calendar_list']);
  expect((await client.callTool({name:'mail_list_mailboxes',arguments:{}})).isError).toBe(true);
  expect((await client.callTool({name:'calendar_list',arguments:{}})).content).toEqual([{type:'text',text:'calendar fixture'}]);
 }finally{await client.close();await server.close();}
});

test('real signed calendar-only bearer reaches Calendar via HTTP and cannot invoke Mail',async()=>{
 const keys=await generateKeyPair('ES256');const runtime=new ModuleRuntime().register(mailRegistration(mail,{...config})).register(calendar());
 const app=createHttpApp(config,runtime,createVerifier(config,async()=>keys.publicKey));const listener=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listener.once('listening',resolve));
 const address=listener.address();if(!address||typeof address==='string')throw Error('missing listener');
 const token=await new SignJWT({scope:'calendar.read'}).setProtectedHeader({alg:'ES256'}).setIssuer(config.issuer).setAudience(config.audience).setSubject('owner').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
 const client=new Client({name:'calendar-only',version:'1'});
 const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/icloud/mcp`),{requestInit:{headers:{authorization:`Bearer ${token}`,host:'example.test'}}});
 try{await client.connect(transport);expect((await client.listTools()).tools.map(t=>t.name)).toContain('calendar_list');expect((await client.callTool({name:'calendar_list',arguments:{}})).isError).not.toBe(true);const denied=await client.callTool({name:'mail_list_mailboxes',arguments:{}});expect(denied.isError).toBe(true);expect(JSON.stringify(denied._meta)).toContain('insufficient_scope');}
 finally{await client.close();await new Promise<void>(resolve=>listener.close(()=>resolve()));}
});

test('startup failure unwinds attempted modules in reverse and disposal is exactly once',async()=>{
 const events:string[]=[];const runtime=new ModuleRuntime().register({...calendar(),start:async()=>{events.push('calendar:start');},dispose:async()=>{events.push('calendar:dispose');}}).register({id:'broken',scopes:[],tools:[],start:async()=>{events.push('broken:start');throw Error('failed');},dispose:async()=>{events.push('broken:dispose');throw Error('cleanup failed');}});
 await expect(runtime.start()).rejects.toThrow('failed');await expect(runtime.dispose()).rejects.toThrow('Module disposal failed');expect(events).toEqual(['calendar:start','broken:start','broken:dispose','calendar:dispose']);
});

test('disposal waits for accepted tool execution and rejects new work before hooks run',async()=>{
 const events:string[]=[];let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});const module=calendar();module.tools[0]!.run=async()=>{events.push('run');await pending;events.push('done');return{content:[]};};module.dispose=async()=>{events.push('dispose');};
 const runtime=new ModuleRuntime().register(module);await runtime.start();const entry=runtime.tool('calendar_list')!;const operation=runtime.invoke(entry,{});const disposal=runtime.dispose();expect(runtime.dispose()).toBe(disposal);await expect(runtime.invoke(entry,{})).rejects.toThrow('draining');expect(events).toEqual(['run']);finish();await operation;await disposal;expect(events).toEqual(['run','done','dispose']);
});
