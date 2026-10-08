import {test,expect} from 'bun:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {createHttpApp} from '../../icloud/dist/mail/http.js';
import {UnsubscribeService} from '@decompozr/mail/server/services/unsubscribe.js';
import {createUnsubscribeGateway} from '@decompozr/mail/server/icloud/unsubscribe.js';
import {MailService} from '@decompozr/mail/server/services/mail.js';
import type {MailGateway,MailSession,Mailbox,MessageMetadata,MailDownload,MessageSummary,MailMessageInput,ParsedMessage,SendResult} from '@decompozr/mail/server/domain/mail.js';
import {readConfig} from '@decompozr/mail/server/config.js';

/** Stateful fixture at the provider port, not a live IMAP server or auth implementation. */
class FixtureGateway implements MailGateway {
 calls=0;writes:string[]=[];seen=new Set<number>();moved=new Set<number>();flagged=new Set<number>();tags=new Map<number,Set<string>>();
 readonly session:MailSession={
  supportsMove:true,
  list:async():Promise<Mailbox[]>=>[{path:'INBOX',name:'INBOX',selectable:true},{path:'Archive',name:'Archive',selectable:true,specialUse:'\\Archive'},{path:'Trash',name:'Trash',selectable:true,specialUse:'\\Trash'},{path:'Junk',name:'Junk',selectable:true,specialUse:'\\Junk'}],
  select:async()=>({uidValidity:'900',supportsKeywords:true,uidNext:44,release(){}}),
  search:async(_query,options)=>[43,41,42].filter(uid=>(!options?.unreadOnly||!this.seen.has(uid))&&(!options?.beforeUid||uid<options.beforeUid)),
  summaries:async(uids):Promise<MessageSummary[]>=>uids.map(uid=>({uid,subject:`Fixture ${uid}`,from:[],flags:this.seen.has(uid)?['\\Seen']:[]})),
  metadata:async(uid):Promise<MessageMetadata|undefined>=>[41,42,43].includes(uid)?{size:4,attachments:[],flags:[...(this.seen.has(uid)?['\\Seen']:[]),...(this.flagged.has(uid)?['\\Flagged']:[]),...(this.tags.get(uid)??[])]}:undefined,
  download:async():Promise<MailDownload>=>({contentType:'text/plain',chunks:(async function*(){yield new TextEncoder().encode('List-Unsubscribe: <mailto:leave@example.invalid?subject=unsubscribe>\r\nSubject: Fixture\r\n\r\nmail');})(),cancel(){}}),
  mark:async(uid,seen)=>{this.writes.push(`mark:${uid}:${seen}`);seen?this.seen.add(uid):this.seen.delete(uid);return true;},
  move:async(uid,destination)=>{this.writes.push(`move:${uid}:${destination}`);this.moved.add(uid);return {uid:uid+100,uidValidity:'901'};},
  flag:async(uid,flagged)=>{this.writes.push(`flag:${uid}:${flagged}`);flagged?this.flagged.add(uid):this.flagged.delete(uid);return true;},
  tag:async(uid,keyword,enabled)=>{this.writes.push(`tag:${uid}:${keyword}:${enabled}`);const tags=this.tags.get(uid)??new Set<string>();enabled?tags.add(keyword):tags.delete(keyword);this.tags.set(uid,tags);return true;}
 };
 async withSession<T>(run:(session:MailSession)=>Promise<T>):Promise<T>{this.calls++;return run(this.session);}
 async parse():Promise<ParsedMessage>{return {subject:'Fixture',to:[],text:'mail'};}
 async compose(_input:MailMessageInput):Promise<Uint8Array>{throw Error('Out of scope');}
 async send(_input:MailMessageInput):Promise<SendResult>{throw Error('Out of scope');}
}
const body=z.object({content:z.array(z.object({type:z.literal('text'),text:z.string()})),isError:z.boolean().optional()});
function textResult(value:unknown):unknown {const parsed=body.parse(value);return JSON.parse(parsed.content[0]!.text);}

test('built HTTP MCP application traverses auth/protocol/service/provider and rejects unsafe requests',async()=>{
 const gateway=new FixtureGateway();
 const config=readConfig({ICLOUD_USER:'fixture@example.invalid',ICLOUD_APP_PASSWORD:'dummy',MCP_PUBLIC_URL:'https://mail.example.invalid/icloud/mcp',MCP_OAUTH_ISSUER:'https://issuer.example.invalid/',MCP_OAUTH_AUDIENCE:'mail',MCP_OAUTH_JWKS_URL:'https://issuer.example.invalid/keys',MCP_OAUTH_ALLOWED_SUBJECTS:'owner',MAIL_ALLOW_WRITES:'true',MCP_OAUTH_SCOPES:'mail.read mail.write'});
 const service=new MailService(config,gateway);
 const submitted:string[]=[];
 const unsubscribe=new UnsubscribeService(service,createUnsubscribeGateway({sendMail:async input=>{submitted.push(input.to.join(','));return {messageId:'fixture',accepted:input.to,rejected:[]};}}),{enabled:true});
 const app=createHttpApp(config,service,async authorization=>{
  if(authorization!=='Bearer fixture-token')throw Error('Rejected fixture token');
  return {subject:'owner',scopes:new Set(['mail.read','mail.write'])};
 },unsubscribe);
 const listener=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listener.once('listening',resolve));
 const address=listener.address();if(!address||typeof address==='string')throw Error('No listener');config.port=address.port;
 const url=new URL(`http://127.0.0.1:${address.port}/icloud/mcp`);
 const client=new Client({name:'e2e-fixture',version:'1'});
 try {
  for(const token of [undefined,'Bearer wrong']) {
   const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:token}:{})},body:'{}'});
   expect(response.status).toBe(401);
  }
  expect(gateway.calls).toBe(0);
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:'Bearer fixture-token'}}}));
  const tools=await client.listTools();expect(tools.tools.map(tool=>tool.name).sort()).toEqual(['mail_batch','mail_flag','mail_list_mailboxes','mail_mark','mail_move','mail_organize','mail_read','mail_request_persistent_access','mail_search','mail_tag','mail_unsubscribe_discover','mail_unsubscribe_submit']);
  const schemes=z.array(z.object({type:z.literal('oauth2'),scopes:z.array(z.string())}));
  const wireResponse=await fetch(url,{method:'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:900,method:'tools/list'})});
  const wireTools=z.object({result:z.object({tools:z.array(z.object({name:z.string(),securitySchemes:schemes,_meta:z.object({securitySchemes:schemes})}))})}).parse(await wireResponse.json()).result;
  expect(wireTools.tools.every(tool=>JSON.stringify(tool.securitySchemes)===JSON.stringify(tool._meta.securitySchemes))).toBe(true);
  expect(wireTools.tools.find(tool=>tool.name==='mail_read')?.securitySchemes).toEqual([{type:'oauth2',scopes:['mail.read']}]);
  expect(wireTools.tools.find(tool=>tool.name==='mail_mark')?.securitySchemes).toEqual([{type:'oauth2',scopes:['mail.read','mail.write']}]);
  const searched=textResult(await client.callTool({name:'mail_search',arguments:{mailbox:'INBOX',limit:2}}));
  expect(z.object({messages:z.array(z.object({uid:z.number()}))}).parse(searched).messages.map(m=>m.uid)).toEqual([43,42]);
  const cursor=z.object({nextCursor:z.unknown()}).parse(searched).nextCursor;
  const next=textResult(await client.callTool({name:'mail_search',arguments:{mailbox:'INBOX',limit:2,cursor}}));expect(z.object({messages:z.array(z.object({uid:z.number()}))}).parse(next).messages.map(m=>m.uid)).toEqual([41]);
  expect(body.parse(await client.callTool({name:'mail_search',arguments:{mailbox:'INBOX',query:'changed',cursor}})).isError).toBe(true);
  const target={mailbox:'INBOX',uid:41,uidValidity:'900'};
  const read=textResult(await client.callTool({name:'mail_read',arguments:target}));expect(z.object({text:z.string()}).parse(read).text).toBe('mail');expect(gateway.seen.size).toBe(0);
  const summary=textResult(await client.callTool({name:'mail_read',arguments:{...target,mode:'summary'}}));expect(z.object({mode:z.literal('summary')}).parse(summary).mode).toBe('summary');expect(Object.hasOwn(z.record(z.unknown()).parse(summary),'attachments')).toBe(false);
  for(const invalid of [{...target,uid:0},{...target,uidValidity:'901'},{...target,uid:999}]) {
   expect(body.parse(await client.callTool({name:'mail_mark',arguments:{...invalid,seen:true}})).isError).toBe(true);
  }
  expect(gateway.writes).toEqual([]);
  expect(body.parse(await client.callTool({name:'mail_mark',arguments:{...target,seen:true}})).isError).not.toBe(true);
  expect(body.parse(await client.callTool({name:'mail_move',arguments:{...target,destination:'Archive'}})).isError).not.toBe(true);
  expect(gateway.writes).toEqual(['mark:41:true','move:41:Archive']);expect(gateway.seen.has(42)).toBe(false);expect(gateway.moved.has(42)).toBe(false);
  expect(body.parse(await client.callTool({name:'mail_flag',arguments:{...target,flagged:true}})).isError).not.toBe(true);expect(gateway.flagged.has(41)).toBe(true);
  expect(body.parse(await client.callTool({name:'mail_tag',arguments:{...target,keyword:'receipts',enabled:true}})).isError).not.toBe(true);expect(gateway.tags.get(41)?.has('receipts')).toBe(true);
  const before=gateway.writes.length;
  expect(body.parse(await client.callTool({name:'mail_batch',arguments:{mailbox:'INBOX',uidValidity:'900',uids:[42,999],action:{type:'mark',seen:true}}})).isError).toBe(true);expect(gateway.writes.length).toBe(before);
  const batch=textResult(await client.callTool({name:'mail_batch',arguments:{mailbox:'INBOX',uidValidity:'900',uids:[42,43],action:{type:'mark',seen:true}}}));
  expect(z.object({status:z.literal('completed')}).parse(batch).status).toBe('completed');expect(gateway.seen.has(42)).toBe(true);expect(gateway.seen.has(43)).toBe(true);
  expect(body.parse(await client.callTool({name:'mail_organize',arguments:{...target,action:'trash'}})).isError).not.toBe(true);expect(gateway.writes.at(-1)).toBe('move:41:Trash');
  expect(body.parse(await client.callTool({name:'mail_organize',arguments:{...target,action:'restore'}})).isError).toBe(true);
  const discovery=textResult(await client.callTool({name:'mail_unsubscribe_discover',arguments:target}));
  const candidateId=z.object({candidates:z.array(z.object({candidateId:z.string()}))}).parse(discovery).candidates[0]!.candidateId;
  expect(submitted).toEqual([]);
  expect(body.parse(await client.callTool({name:'mail_unsubscribe_submit',arguments:{...target,candidateId}})).isError).not.toBe(true);expect(submitted).toEqual(['leave@example.invalid']);
  const malformed=await fetch(url,{method:'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json'},body:'{"not":"jsonrpc"}'});expect(malformed.status).toBe(400);
 }finally{await client.close();await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));}
 await expect(fetch(url)).rejects.toThrow();
});

test('built MCP drain preserves accepted provider work after HTTP disconnect and emits private-safe outcomes',async()=>{
 const {OperationMonitor}=await import('../../icloud/dist/observability/operations.js');
 const {HttpLifecycle}=await import('../../icloud/dist/server/lifecycle.js');
 const events:unknown[]=[];const monitor=new OperationMonitor(event=>{events.push(event);}),lifecycle=new HttpLifecycle();
 const gateway=new FixtureGateway();let release:()=>void=()=>{},started:()=>void=()=>{};
 const gate=new Promise<void>(r=>{release=r;}),began=new Promise<void>(r=>{started=r;});
 gateway.session.mark=async(uid,seen)=>{started();await gate;gateway.writes.push(`mark:${uid}:${seen}`);return true;};
 const config=readConfig({ICLOUD_USER:'private-address@example.invalid',ICLOUD_APP_PASSWORD:'SECRET-CANARY',MCP_PUBLIC_URL:'https://mail.example.invalid/icloud/mcp',MCP_OAUTH_ISSUER:'https://issuer.example.invalid/',MCP_OAUTH_AUDIENCE:'mail',MCP_OAUTH_JWKS_URL:'https://issuer.example.invalid/keys',MCP_OAUTH_ALLOWED_SUBJECTS:'owner',MAIL_ALLOW_WRITES:'true',MCP_OAUTH_SCOPES:'mail.read mail.write'});
 const app=createHttpApp(config,new MailService(config,gateway),async()=>({subject:'owner',scopes:new Set(['mail.read','mail.write'])}),undefined,undefined,monitor,lifecycle);
 const listener=app.listen(0,'127.0.0.1');lifecycle.attach(listener);await new Promise<void>(r=>listener.once('listening',r));const address=listener.address();if(!address||typeof address==='string')throw Error('No listener');config.port=address.port;
 const client=new Client({name:'drain-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/icloud/mcp`),{requestInit:{headers:{authorization:'Bearer SECRET-TOKEN'}}}));
 const response=client.callTool({name:'mail_mark',arguments:{mailbox:'INBOX',uid:41,uidValidity:'900',seen:true}}).catch(()=>undefined);
 await began;await client.close();let stopped=false;const stopping=lifecycle.shutdown([listener],monitor,{graceMs:10}).then(()=>{stopped=true;});
 await Bun.sleep(30);expect(stopped).toBe(false);expect(gateway.writes).toHaveLength(0);release();await stopping;await response;
 expect(gateway.writes).toEqual(['mark:41:true']);expect(monitor.activeCount).toBe(0);
 const serialized=JSON.stringify(events);expect(serialized).toContain('mail_mark');expect(serialized).toContain('completed');for(const secret of ['SECRET','private-address','INBOX','uidValidity'])expect(serialized).not.toContain(secret);
},10000);
