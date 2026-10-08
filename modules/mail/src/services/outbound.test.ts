import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from 'bun:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OutboundService} from './outbound.js';
import {SqliteOutboundLedger} from '../storage/outbound-ledger.js';
import {MailOperationError,type MailGateway,type MailSession,type Mailbox} from '../domain/mail.js';
import type {OutboundMessage,OutboundGateway} from '../domain/outbound.js';
const request={operationId:'12345678-1234-4234-8234-123456789abc',to:['author@example.invalid'],subject:'Reply',text:'Private body'};
const target={mailbox:'INBOX',uid:41,uidValidity:'900'};
function fixture(options:{database?:Database;headers?:string;validity?:string;boxes?:Mailbox[];allowSend?:boolean;send?:OutboundGateway['send']}={}){
 const database=options.database??new Database(':memory:'); const calls:OutboundMessage[]=[];const reads:unknown[]=[];
 const session:MailSession={supportsMove:false,list:async()=>options.boxes??[{path:'Drafts',name:'Drafts',selectable:true,specialUse:'\\Drafts'}],
  select:async(mailbox,selection)=>{reads.push({mailbox,selection});return{uidValidity:options.validity??'900',uidNext:42,supportsKeywords:false,release(){}};},
  headers:async(uid,maxBytes)=>{reads.push({uid,maxBytes});return new TextEncoder().encode(options.headers??'From: author@example.invalid\r\nMessage-ID: <original@example.invalid>\r\nReferences: <older@example.invalid>\r\n\r\n');},
  search:async()=>[],summaries:async()=>[],metadata:async()=>undefined,download:async()=>{throw Error('Unexpected body download');},mark:async()=>false,flag:async()=>false,tag:async()=>false,move:async()=>false};
 const mail:MailGateway={withSession:run=>run(session),parse:async()=>({to:[],text:''})};
 const provider:OutboundGateway={send:async input=>{calls.push(input);return options.send?options.send(input):{messageId:input.messageId,accepted:input.to,rejected:[]};},draft:async(input,mailbox)=>{calls.push(input);return{mailbox,uid:81,uidValidity:'901',messageId:input.messageId};}};
 const service=new OutboundService({allowSend:options.allowSend??true,allowWrites:true},mail,provider,new SqliteOutboundLedger(database,new Uint8Array(32).fill(7),()=> 'owner'));
 return{service,calls,reads,close:()=>database.close()};
}
test('send returns exact acceptance receipt and repeated ID makes one provider call',async()=>{
 const f=fixture();try{
  const result=await f.service.send(request);
  assert.deepEqual(result,{operationId:request.operationId,messageId:`<${request.operationId}@icloud-plugin.invalid>`,status:'submitted',replayed:false,accepted:request.to,rejected:[]});
  assert.deepEqual(await f.service.send(request),{...result,replayed:true});assert.equal(f.calls.length,1);
  await assert.rejects(f.service.send({...request,text:'Changed'}),{code:'invalid_input'});assert.equal(f.calls.length,1);
 }finally{f.close();}
});
test('concurrent same-ID request returns unknown tombstone rather than submit twice',async()=>{
 let complete:()=>void=()=>{};const gate=new Promise<void>(resolve=>{complete=resolve;});
 const f=fixture({send:async input=>{await gate;return{messageId:input.messageId,accepted:input.to,rejected:[]};}});
 try{const first=f.service.send(request);const second=await f.service.send(request);assert.equal(second.status,'unknown');assert.equal(second.replayed,true);assert.equal(f.calls.length,1);complete();assert.equal((await first).status,'submitted');}finally{complete();f.close();}
});
test('reply uses bounded read-only headers and explicit selected recipient with threading',async()=>{
 const f=fixture();try{
  const result=await f.service.reply({...request,target});assert.equal(result.status,'submitted');assert.deepEqual(result.replyTarget,target);
  assert.deepEqual(f.reads,[{mailbox:'INBOX',selection:{readOnly:true}},{uid:41,maxBytes:65537}]);
  assert.equal(f.calls[0]?.inReplyTo,'<original@example.invalid>');assert.deepEqual(f.calls[0]?.references,['<older@example.invalid>','<original@example.invalid>']);assert.deepEqual(f.calls[0]?.to,request.to);
 }finally{f.close();}
});
for(const [name,options,recipient,code] of [
 ['stale',{validity:'901'},request.to,'stale_identity'],
 ['recipient',{},['other@example.invalid'],'invalid_input'],
 ['oversized',{headers:'X-Fill: '+'a'.repeat(65537)},request.to,'unsupported_capability'],
 ['incomplete',{headers:'From: author@example.invalid\r\nMessage-ID: <original@example.invalid>\r\n'},request.to,'unsupported_capability'],
 ['missing identity',{headers:'From: author@example.invalid\r\n\r\n'},request.to,'unsupported_capability'],
] as const)test(`reply ${name} is rejected before SMTP`,async()=>{const f=fixture(options);try{const result=await f.service.reply({...request,to:[...recipient],target});assert.equal(result.status,'rejected');assert.equal(result.errorCode,code);assert.equal(f.calls.length,0);}finally{f.close();}});
test('Drafts must resolve uniquely and draft receipt reports exact identity',async()=>{
 for(const boxes of [[],[{path:'a',name:'a',selectable:true,specialUse:'\\Drafts'},{path:'b',name:'b',selectable:true,specialUse:'\\Drafts'}]]){const f=fixture({boxes});try{assert.equal((await f.service.draft(request)).status,'rejected');assert.equal(f.calls.length,0);}finally{f.close();}}
 const f=fixture();try{const result=await f.service.draft(request);assert.equal(result.status,'draft_saved');assert.deepEqual(result.draftTarget,{mailbox:'Drafts',uid:81,uidValidity:'901'});}finally{f.close();}
});
test('disabled sending makes no provider/header calls',async()=>{const f=fixture({allowSend:false});try{await assert.rejects(f.service.send(request),{code:'forbidden'});await assert.rejects(f.service.reply({...request,target}),{code:'forbidden'});assert.deepEqual(f.calls,[]);assert.deepEqual(f.reads,[]);}finally{f.close();}});
test('provider uncertainty is durable replay rather than automatic retry',async()=>{const f=fixture({send:async()=>{throw new MailOperationError('outcome_unknown','Lost receipt');}});try{assert.equal((await f.service.send(request)).status,'unknown');assert.equal((await f.service.send(request)).replayed,true);assert.equal(f.calls.length,1);}finally{f.close();}});

test('unknown provider submission stays non-retriable after closing and reopening SQLite',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'outbound-service-')),path=join(directory,'ledger.sqlite');
 const first=fixture({database:new Database(path),send:async()=>{throw new MailOperationError('outcome_unknown','Lost after DATA');}});
 try{assert.equal((await first.service.send(request)).status,'unknown');assert.equal(first.calls.length,1);}finally{first.close();}
 const reopened=fixture({database:new Database(path)});
 try{const result=await reopened.service.send(request);assert.equal(result.status,'unknown');assert.equal(result.replayed,true);assert.equal(reopened.calls.length,0);}finally{reopened.close();rmSync(directory,{recursive:true,force:true});}
});
test('receipt persistence failure after SMTP remains unknown and cannot resubmit',async()=>{
 const database=new Database(':memory:'),f=fixture({database});
 database.exec("CREATE TRIGGER block_receipt BEFORE UPDATE ON icloudOutbound BEGIN SELECT RAISE(FAIL,'fixture disk failure'); END");
 try{const first=await f.service.send(request);assert.equal(first.status,'unknown');assert.equal(first.errorCode,'outcome_unknown');assert.equal((await f.service.send(request)).status,'unknown');assert.equal(f.calls.length,1);}finally{f.close();}
});

test('pending reply replay preserves validated original identity without another submission',async()=>{
 let complete:()=>void=()=>{};const gate=new Promise<void>(resolve=>{complete=resolve;});
 const f=fixture({send:async input=>{await gate;return{messageId:input.messageId,accepted:input.to,rejected:[]};}});
 try{const first=f.service.reply({...request,target});const second=await f.service.reply({...request,target});assert.equal(second.status,'unknown');assert.deepEqual(second.replyTarget,target);complete();assert.equal((await first).status,'submitted');assert.equal(f.calls.length,1);}finally{complete();f.close();}
});
test('reply receipt persistence failure preserves original identity on result and replay',async()=>{
 const database=new Database(':memory:'),f=fixture({database});
 database.exec("CREATE TRIGGER block_receipt BEFORE UPDATE ON icloudOutbound BEGIN SELECT RAISE(FAIL,'fixture disk failure'); END");
 try{const first=await f.service.reply({...request,target});assert.equal(first.status,'unknown');assert.deepEqual(first.replyTarget,target);const repeated=await f.service.reply({...request,target});assert.equal(repeated.status,'unknown');assert.deepEqual(repeated.replyTarget,target);assert.equal(f.calls.length,1);}finally{f.close();}
});
