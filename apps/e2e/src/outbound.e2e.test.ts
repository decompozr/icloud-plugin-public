import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {createHttpApp} from '../../icloud/dist/mail/http.js';
import {MailService} from '../../icloud/dist/mail/services/mail.js';
import {OutboundService} from '../../icloud/dist/mail/services/outbound.js';
import {SqliteOutboundLedger} from '../../icloud/dist/mail/storage/outbound-ledger.js';
import {outboundResultSchema} from '../../icloud/dist/mail/domain/outbound.js';
import {ICloudMailAdapter} from '../../icloud/dist/mail/icloud/adapter.js';
import {startImapFixture} from './helpers/imap-fixture.js';
import {readConfig} from '../../icloud/dist/mail/config.js';
import {smtpFixture,imapFixture} from './helpers/outbound-fixtures.js';
const toolResponse=z.object({content:z.array(z.object({type:z.literal('text'),text:z.string()})),isError:z.boolean().optional()});

test('built MCP outbound gates scope and uses real SMTP/APPEND with durable replay and threading',async()=>{
 const smtp=await smtpFixture(),imap=await imapFixture(),db=new Database(':memory:');
 const lookup=await startImapFixture({headers:'From: original@example.invalid\r\nReply-To: recipient@example.invalid\r\nMessage-ID: <original@example.invalid>\r\nReferences: <older@example.invalid>\r\n\r\n'});
 const commands=lookup.commands;
 const gateway=new ICloudMailAdapter({user:'fixture',password:'dummy'},{createClient:lookup.createClient});
 const config=readConfig({ICLOUD_USER:'dummy',ICLOUD_APP_PASSWORD:'dummy',MAIL_ALLOW_WRITES:'true',MAIL_ALLOW_SEND:'true',MCP_PUBLIC_URL:'https://fixture.invalid/icloud/mcp',MCP_OAUTH_ISSUER:'https://fixture.invalid/icloud/auth',MCP_OAUTH_AUDIENCE:'mail',MCP_OAUTH_JWKS_URL:'https://fixture.invalid/keys',MCP_OAUTH_ALLOWED_SUBJECTS:'owner',MCP_OAUTH_SCOPES:'mail.read mail.write mail.send'});
 const outbound=new OutboundService({allowSend:true,allowWrites:true},gateway,{send:value=>smtp.adapter.send(value),draft:(value,mailbox)=>imap.adapter.draft(value,mailbox)},new SqliteOutboundLedger(db,Buffer.alloc(32,1),()=> 'owner'));
 const app=createHttpApp(config,new MailService({allowWrites:true},gateway),async authorization=>({subject:'owner',scopes:new Set(authorization==='Bearer send'?['mail.read','mail.write','mail.send']:['mail.read','mail.write'])}),undefined,outbound);
 const listener=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listener.once('listening',resolve));
 const address=listener.address();if(!address||typeof address==='string')throw Error('No listener');config.port=address.port;
 const clients:Client[]=[];
 async function client(token:string){const client=new Client({name:'outbound-fixture',version:'1'});clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${config.port}/icloud/mcp`),{requestInit:{headers:{authorization:'Bearer '+token}}}));return client;}
 const input={operationId:randomUUID(),to:['recipient@example.invalid'],subject:'Requested subject',text:'Requested text',attachments:[{filename:'binary.bin',contentType:'application/octet-stream',contentBase64:Buffer.alloc(300000,42).toString('base64')}]};
 try{
  const read=await client('read');expect((await read.listTools()).tools.some(tool=>tool.name==='mail_send')).toBe(true);
  expect(toolResponse.parse(await read.callTool({name:'mail_send',arguments:input})).isError).toBe(true);expect(smtp.messages).toHaveLength(0);
  const sender=await client('send');const tools=(await sender.listTools()).tools;expect(tools.some(tool=>tool.name==='mail_send')).toBe(true);
  for(const name of ['mail_send','mail_reply','mail_draft_create']){const tool=tools.find(tool=>tool.name===name);const id=z.object({format:z.literal('uuid'),description:z.string()}).parse(tool?.inputSchema.properties?.operationId);expect(id.description).toContain('UUID');}
  const invalid=toolResponse.parse(await sender.callTool({name:'mail_send',arguments:{...input,operationId:'my-draft-1'}}));expect(invalid.isError).toBe(true);expect(invalid.content[0]?.text).toContain('operationId must be a UUID');expect(smtp.messages).toHaveLength(0);
  const call=async(name:string,args:Record<string,unknown>)=>outboundResultSchema.parse(JSON.parse(toolResponse.parse(await sender.callTool({name,arguments:args})).content[0]?.text??''));
  expect((await call('mail_send',input)).status).toBe('submitted');expect((await call('mail_send',input)).replayed).toBe(true);expect(smtp.messages).toHaveLength(1);
  const replied=await call('mail_reply',{...input,operationId:randomUUID(),target:{mailbox:'INBOX',uid:41,uidValidity:'900'}});
  expect(replied.status).toBe('submitted');expect(smtp.messages[1]).toContain('In-Reply-To: <original@example.invalid>');expect(smtp.messages[1]).toContain('References: <older@example.invalid> <original@example.invalid>');
  expect(commands.some(command=>command.startsWith('EXAMINE '))).toBe(true);expect(commands.some(command=>command.includes('BODY.PEEK[HEADER]<0.65537>'))).toBe(true);expect(commands.some(command=>command.startsWith('SELECT '))).toBe(false);
  const saved=await call('mail_draft_create',{...input,operationId:randomUUID()});expect(saved.status).toBe('draft_saved');expect(saved.draftTarget).toEqual({mailbox:'Drafts',uid:81,uidValidity:'901'});expect(imap.sources).toHaveLength(1);
  const stale=await call('mail_reply',{...input,operationId:randomUUID(),target:{mailbox:'INBOX',uid:41,uidValidity:'901'}});expect(stale.status).toBe('rejected');expect(stale.errorCode).toBe('stale_identity');expect(smtp.messages).toHaveLength(2);
 }finally{for(const client of clients)await client.close();await new Promise<void>(resolve=>listener.close(()=>resolve()));await smtp.close();await imap.close();await lookup.close();db.close();}
},15000);
