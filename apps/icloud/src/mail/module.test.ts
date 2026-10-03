import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMailModule} from './module.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {createServer} from '../mcp/server.js';
import {OperationMonitor} from '../observability/operations.js';
import type {OwnerSecretStore} from '../storage/owner-store.js';
import type {AppSettings} from '../server/settings.js';
import {MailOperationError,type MailSession} from './domain/mail.js';

async function fixture(moveUnknown=false,revokeOnMove=false){
 const database=new Database(':memory:');const users: string[]=[];const sends:string[]=[];const moves:string[]=[];
 const accounts=[{id:'a',user:'a@icloud.com',label:'Personal',credentialStored:true},{id:'b',user:'b@icloud.com',label:'Work',credentialStored:true}];
 const store={ownerId:()=> 'owner',legacyAccountId:()=> 'a',account:(_owner:string,id:string)=>accounts.find(a=>a.id===id)??null,readAccountSecret:(_owner:string,id:string)=>new TextEncoder().encode(JSON.stringify({user:accounts.find(a=>a.id===id)!.user,appPassword:'test-password'}))} as unknown as OwnerSecretStore;
 const settings={allow_writes:true,allow_send:true,host:'127.0.0.1',public_port:4100,public_origin:'https://example.test'} as AppSettings;
 const source=Buffer.from('From: sender@example.com\r\nTo: receiver@example.com\r\nSubject: Draft\r\nMessage-ID: <original@example.com>\r\nContent-Type: text/plain\r\n\r\nsame draft');
 const module=createMailModule(settings,{store,authDatabase:database,masterKey:new Uint8Array(32).fill(3),monitor:new OperationMonitor(),provider:credential=>{
  const session:MailSession={supportsMove:true,list:async()=>[{path:'INBOX',name:credential.user,selectable:true},{path:'Drafts',name:'Drafts',specialUse:'\\Drafts',selectable:true},{path:'Archive',name:'Archive',specialUse:'\\Archive',selectable:true}],select:async()=>({uidValidity:'123',uidNext:3,supportsKeywords:true,release(){}}),search:async()=>[2,1],summaries:async uids=>uids.map(uid=>({uid,subject:credential.user,from:[],flags:[]})),metadata:async()=>({attachments:[],size:source.length}),download:async()=>({contentType:'message/rfc822',chunks:(async function*(){yield source;})(),cancel(){}}),mark:async()=>true,flag:async()=>true,tag:async()=>true,move:async()=>{moves.push(credential.user);if(revokeOnMove)accounts.find(account=>account.user===credential.user)!.credentialStored=false;if(moveUnknown)throw new MailOperationError('outcome_unknown','Source removal unconfirmed',{copiedTarget:{mailbox:'Archive',uid:81,uidValidity:'901'}});return{uid:1,uidValidity:'123'};}};
  return{withSession:async run=>{users.push(credential.user);await new Promise(resolve=>setTimeout(resolve,5));return run(session);},parse:async()=>({to:[],text:credential.user}),send:async()=>({messageId:'fixture',accepted:[],rejected:[]})};
 },outboundProvider:credential=>({send:async input=>{sends.push(credential.user);await new Promise(resolve=>setTimeout(resolve,5));return{messageId:input.messageId,accepted:input.to,rejected:[]};},draft:async()=>({mailbox:'Drafts',uid:2,uidValidity:'123',messageId:'fixture'})})});
 const runtime=new ModuleRuntime().register(module.registration);await runtime.start();
 const connections: Array<{client:Client;server:ReturnType<typeof createServer>}>=[];
 async function connect(accountId?:string){const server=createServer(runtime,settings.public_origin,new Set(['mail.read','mail.write','mail.send']),operation=>operation(),{ownerId:'owner',accountId});const client=new Client({name:'fixture',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);connections.push({client,server});return client;}
 return{connect,users,sends,moves,accounts,close:async()=>{for(const c of connections){await c.client.close();await c.server.close();}await runtime.dispose();database.close();}};
}
function result(response:Awaited<ReturnType<Client['callTool']>>){return JSON.parse((response.content as Array<{text:string}>)[0]!.text);}

test('concurrent authenticated accounts keep providers, profiles, references, and cursors isolated',async()=>{
 const f=await fixture();try{const[a,b,missing]=await Promise.all([f.connect('a'),f.connect('b'),f.connect()]);
  const [ra,rb]=await Promise.all([a.callTool({name:'mail_search',arguments:{mailbox:'INBOX',limit:1}}),b.callTool({name:'mail_search',arguments:{mailbox:'INBOX',limit:1}})]);
  expect(result(ra).messages[0].subject).toBe('a@icloud.com');expect(result(rb).messages[0].subject).toBe('b@icloud.com');expect(result(rb).accountId).toBe('b');
  const target={mailbox:'INBOX',uid:2,uidValidity:'123',accountId:'a'};
  const before=f.users.length;expect((await b.callTool({name:'mail_read',arguments:target})).isError).toBe(true);expect((await b.callTool({name:'mail_search',arguments:{mailbox:'INBOX',cursor:result(ra).nextCursor}})).isError).toBe(true);expect(f.users.length).toBe(before);
  expect((await b.callTool({name:'mail_read',arguments:{mailbox:'INBOX',uid:2,uidValidity:'123'}})).isError).toBe(true);
  expect((await a.callTool({name:'mail_read',arguments:{mailbox:'INBOX',uid:2,uidValidity:'123'}})).isError).not.toBe(true);
  expect((await missing.callTool({name:'mail_list_mailboxes',arguments:{}})).isError).toBe(true);
  const profile=await b.callTool({name:'mail_get_profile',arguments:{}});expect(profile.structuredContent).toEqual({id:'b',name:'Work',email:'b@icloud.com'});expect(result(profile)).toEqual(profile.structuredContent);
  const tool=(await b.listTools()).tools.find(t=>t.name==='mail_get_profile')!;expect(tool._meta?.['openai/profile']).toBe(true);expect(tool.outputSchema?.required).toEqual(['id']);expect((await b.callTool({name:'mail_get_profile',arguments:{accountId:'a'}})).isError).toBe(true);
 }finally{await f.close();}
});

test('operation replay and draft revisions do not cross account boundaries',async()=>{
 const f=await fixture();try{const[a,b]=await Promise.all([f.connect('a'),f.connect('b')]);const input={operationId:'550e8400-e29b-41d4-a716-446655440000',to:['receiver@example.com'],subject:'Hello',text:'Message'};
  const[first,second]=await Promise.all([a.callTool({name:'mail_send',arguments:input}),b.callTool({name:'mail_send',arguments:input})]);expect(result(first).replayed).toBe(false);expect(result(second).replayed).toBe(false);expect(result(first).messageId).not.toBe(result(second).messageId);expect(f.sends.sort()).toEqual(['a@icloud.com','b@icloud.com']);expect(result(await b.callTool({name:'mail_send',arguments:input})).replayed).toBe(true);expect(f.sends.length).toBe(2);
  const target={mailbox:'Drafts',uid:2,uidValidity:'123'};const [da,db]=await Promise.all([a.callTool({name:'mail_draft_read',arguments:{target:{...target,accountId:'a'}}}),b.callTool({name:'mail_draft_read',arguments:{target:{...target,accountId:'b'}}})]);expect(result(da).revision).not.toBe(result(db).revision);
  const cross=await b.callTool({name:'mail_draft_send',arguments:{operationId:'550e8400-e29b-41d4-a716-446655440001',to:input.to,target:result(da).target,revision:result(da).revision}});expect(cross.isError).toBe(true);expect(f.sends.length).toBe(2);
  const revised=await b.callTool({name:'mail_draft_send',arguments:{operationId:'550e8400-e29b-41d4-a716-446655440002',to:input.to,target:{...target,accountId:'b'},revision:result(da).revision}});expect(result(revised).status).toBe('rejected');expect(result(revised).errorCode).toBe('stale_identity');expect(f.sends.length).toBe(2);
  const forwardInput={...input,operationId:'550e8400-e29b-41d4-a716-446655440003'};const [fa,fb]=await Promise.all([a.callTool({name:'mail_forward',arguments:{...forwardInput,target:{...target,accountId:'a'}}}),b.callTool({name:'mail_forward',arguments:{...forwardInput,target:{...target,accountId:'b'}}})]);expect(result(fa).status).toBe('submitted');expect(result(fb).status).toBe('submitted');expect(result(fa).messageId).not.toBe(result(fb).messageId);
  const draft=await b.callTool({name:'mail_draft_create',arguments:{...input,operationId:'550e8400-e29b-41d4-a716-446655440004'}});expect(result(draft).draftTarget.accountId).toBe('b');
  f.accounts[1]!.credentialStored=false;expect((await b.callTool({name:'mail_get_profile',arguments:{}})).isError).toBe(true);
 }finally{await f.close();}
});

for(const revoked of [false,true])for(const name of ['mail_move','mail_organize','mail_batch'] as const)test(`${name} binds uncertain copied targets to the authenticated account${revoked?' after credential revocation':''}`,async()=>{
 const f=await fixture(true,revoked);try{
  const [a,b]=await Promise.all([f.connect('a'),f.connect('b')]);
  const target={accountId:'b',mailbox:'INBOX',uid:2,uidValidity:'123'};
  const args=name==='mail_batch'?{accountId:'b',mailbox:'INBOX',uidValidity:'123',uids:[2,1],action:{type:'move',destination:'Archive'}}
   :name==='mail_organize'?{...target,action:'archive'}:{...target,destination:'Archive'};
  const response=await b.callTool({name,arguments:args}),body=result(response);
  expect(body.status).toBe('unknown');
  const recovery=name==='mail_batch'?body.items[0].recovery:body.recovery;
  expect(recovery).toEqual({copiedTarget:{accountId:'b',mailbox:'Archive',uid:81,uidValidity:'901'}});
  if(name==='mail_batch'){
   expect(body.items.map((item:{status:string})=>item.status)).toEqual(['outcome_unknown','not_attempted']);
   expect(body.items[0].target.accountId).toBe('b');
  }else expect(response.isError).toBe(true);
  expect(f.moves).toEqual(['b@icloud.com']);
  const calls=f.users.length;
  const cross=await a.callTool({name:'mail_read',arguments:recovery.copiedTarget});
  expect(cross.isError).toBe(true);expect(result(cross).error.code).toBe('stale_identity');expect(f.users.length).toBe(calls);
  if(revoked){
   const denied=await b.callTool({name,arguments:args});
   expect(denied.isError).toBe(true);expect(result(denied).error.code).toBe('forbidden');
   expect(f.users.length).toBe(calls);expect(f.moves).toEqual(['b@icloud.com']);
  }
 }finally{await f.close();}
});

for(const name of ['mail_move','mail_batch'] as const)test(`${name} preserves confirmed completion when credentials are revoked during provider work`,async()=>{
 const f=await fixture(false,true);try{
  const b=await f.connect('b');
  const args=name==='mail_batch'?{accountId:'b',mailbox:'INBOX',uidValidity:'123',uids:[2],action:{type:'move',destination:'Archive'}}
   :{accountId:'b',mailbox:'INBOX',uid:2,uidValidity:'123',destination:'Archive'};
  const response=await b.callTool({name,arguments:args}),body=result(response);
  expect(response.isError).not.toBe(true);
  const moved=name==='mail_batch'?body.items[0].result:body;
  if(name==='mail_batch'){expect(body.status).toBe('completed');expect(body.items[0].status).toBe('succeeded');}
  expect(moved.moved).toBe(true);
  expect(moved.destinationTarget).toEqual({accountId:'b',mailbox:'Archive',uid:1,uidValidity:'123'});
  expect(f.moves).toEqual(['b@icloud.com']);const calls=f.users.length;
  const denied=await b.callTool({name,arguments:args});
  expect(denied.isError).toBe(true);expect(result(denied).error.code).toBe('forbidden');
  expect(f.users.length).toBe(calls);expect(f.moves).toEqual(['b@icloud.com']);
 }finally{await f.close();}
});
