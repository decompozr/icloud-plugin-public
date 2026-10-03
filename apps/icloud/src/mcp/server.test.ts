import {test,expect} from 'bun:test';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import type {MailOperations} from '../domain/mail.js';
import {createServer} from './server.js';
import {readConfig} from '../config.js';
const config=readConfig({ICLOUD_USER:'fixture@example.invalid',ICLOUD_APP_PASSWORD:'dummy',MCP_PUBLIC_URL:'https://mail.example.invalid/icloud/mcp',MCP_OAUTH_ISSUER:'https://issuer.example.invalid/',MCP_OAUTH_AUDIENCE:'mail',MCP_OAUTH_JWKS_URL:'https://issuer.example.invalid/keys',MCP_OAUTH_ALLOWED_SUBJECTS:'owner'});
const unused=async():Promise<never>=>{throw Error('Unexpected adapter call');};
test('typed MCP adapter discovers read tools and rejects invalid target before service',async()=>{
 let calls=0;
 const mail:MailOperations={listMailboxes:async()=>{calls++;return [];},search:unused,read:unused,mark:unused,move:unused,flag:unused,tag:unused,organize:unused,batch:unused};
 const server=createServer(mail,config,new Set(['mail.read']));const client=new Client({name:'fixture',version:'1'});
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  const tools=await client.listTools();expect(tools.tools.some(t=>t.name==='mail_read')).toBe(true);expect(tools.tools.some(t=>t.name==='mail_send')).toBe(false);
  const invalid=await client.callTool({name:'mail_read',arguments:{mailbox:'INBOX',uid:0,uidValidity:'1'}});expect(invalid.isError).toBe(true);expect(calls).toBe(0);
  await client.callTool({name:'mail_list_mailboxes',arguments:{}});expect(calls).toBe(1);
 }finally{await client.close();await server.close();}
});

test('policy-enabled send descriptors allow scope discovery without granting execution',async()=>{
 let adapterCalls=0;
 const mail:MailOperations={listMailboxes:async()=>[],search:unused,read:unused,mark:unused,move:unused,flag:unused,tag:unused,organize:unused,batch:unused};
 const denyAdapter=async():Promise<never>=>{adapterCalls++;throw Error('must not execute');};
 const policy={...config,allowWrites:true,allowSend:true};const scopes=new Set(['mail.read','mail.write']);
 const server=createServer(mail,policy,scopes,undefined,{send:denyAdapter,reply:denyAdapter,draft:denyAdapter});
 const client=new Client({name:'incremental-scope-fixture',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(b);await client.connect(a);
  const catalog=(await client.listTools()).tools;
  const send=catalog.find(tool=>tool.name==='mail_send');const reply=catalog.find(tool=>tool.name==='mail_reply');expect(send).toBeDefined();expect(reply).toBeDefined();
  expect(send!._meta?.securitySchemes).toEqual([{type:'oauth2',scopes:['mail.read','mail.send']}]);
  // Model the screenshot's selection rule; this is not a real ChatGPT E2E.
  const selectedScopes=(selected:typeof catalog,defaults:string[],base:string[])=>{
   const declarations=selected.map(tool=>z.array(z.object({type:z.literal('oauth2'),scopes:z.array(z.string())})).safeParse(tool._meta?.securitySchemes));
   return [...new Set([...base,...(declarations.every(value=>value.success)?declarations.flatMap(value=>value.success?value.data.flatMap(item=>item.scopes):[]):defaults)])];
  };
  const oldCatalog=catalog.filter(tool=>tool.name!=='mail_send'&&tool.name!=='mail_reply');
  expect(selectedScopes(oldCatalog,['mail.read','mail.write','mail.send'],[])).not.toContain('mail.send');
  expect(selectedScopes([send!],['mail.read','mail.write','mail.send'],[])).toEqual(['mail.read','mail.send']);
  const denied=await client.callTool({name:'mail_send',arguments:{}});expect(denied.isError).toBe(true);expect(denied._meta?.['mcp/www_authenticate']).toContain('error="insufficient_scope"');expect(denied._meta?.['mcp/www_authenticate']).toContain('scope="mail.read mail.send mail.write"');expect(denied._meta?.['mcp/www_authenticate']).toContain('resource_metadata="https://mail.example.invalid/.well-known/oauth-protected-resource/icloud/mcp"');expect(adapterCalls).toBe(0);expect(scopes.has('mail.send')).toBe(false);
  policy.allowWrites=false;
  const narrowed=await client.callTool({name:'mail_send',arguments:{}});expect(narrowed._meta?.['mcp/www_authenticate']).toContain('scope="mail.read mail.send"');expect(narrowed._meta?.['mcp/www_authenticate']).not.toContain('mail.write');expect(adapterCalls).toBe(0);
  policy.allowSend=false;expect((await client.listTools()).tools.some(tool=>tool.name==='mail_send')).toBe(false);
  const unavailable=await client.callTool({name:'mail_send',arguments:{}});expect(unavailable.isError).toBe(true);expect(adapterCalls).toBe(0);
 }finally{await client.close();await server.close();}
});

test('extension descriptors expose required scopes but deny insufficient grants before provider execution',async()=>{
 let calls=0;const run=async()=>{calls++;return {};};
 const mail:MailOperations={listMailboxes:unused,search:unused,read:unused,mark:unused,move:unused,flag:unused,tag:unused,organize:unused,batch:unused};
 const policy={...config,allowWrites:true,allowSend:true};const server=createServer(mail,policy,new Set(['mail.read']),undefined,{send:unused,reply:unused,draft:unused,extensions:{attachment:run,readDraft:run,editDraft:run,sendDraft:run,forward:run}});
 const client=new Client({name:'extension-scopes',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(b);await client.connect(a);const catalog=(await client.listTools()).tools;
 for(const [name,scope] of [['mail_draft_edit','mail.write'],['mail_draft_send','mail.send'],['mail_forward','mail.send']]){
  expect(catalog.find(t=>t.name===name)?._meta?.securitySchemes).toEqual([{type:'oauth2',scopes:['mail.read',scope]}]);const result=await client.callTool({name:name!,arguments:{}});expect(result.isError).toBe(true);expect(result._meta?.['mcp/www_authenticate']).toContain('insufficient_scope');
 }
 expect(calls).toBe(0);const invalid=await client.callTool({name:'mail_attachment_download',arguments:{target:{mailbox:'INBOX',uid:1,uidValidity:'1'},partId:'../../secret'}});expect(invalid.isError).toBe(true);expect(calls).toBe(0);
 await client.callTool({name:'mail_attachment_download',arguments:{target:{mailbox:'INBOX',uid:1,uidValidity:'1'},partId:'2'}});expect(calls).toBe(1);
 policy.allowRead=false;expect((await client.listTools()).tools).toHaveLength(0);
 }finally{await client.close();await server.close();}
});
