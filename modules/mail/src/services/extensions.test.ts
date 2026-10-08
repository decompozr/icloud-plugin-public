import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from 'bun:sqlite';
import {simpleParser} from 'mailparser';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const artifact=process.env.CP5_ARTIFACT_DIR;
const {MailExtensions}:typeof import('./extensions.js')=artifact?await import(pathToFileURL(join(artifact,'apps/icloud/node_modules/@decompozr/mail/dist/services/extensions.js')).href):await import('./extensions.js');
const {SqliteOutboundLedger}:typeof import('../storage/outbound-ledger.js')=artifact?await import(pathToFileURL(join(artifact,'apps/icloud/node_modules/@decompozr/mail/dist/storage/outbound-ledger.js')).href):await import('../storage/outbound-ledger.js');
const {ICloudOutboundAdapter}:typeof import('../icloud/outbound.js')=artifact?await import(pathToFileURL(join(artifact,'apps/icloud/node_modules/@decompozr/mail/dist/icloud/outbound.js')).href):await import('../icloud/outbound.js');
import {outboundRequestSchema,type OutboundMessage,type OutboundGateway} from '../domain/outbound.js';
import type {MailSession,MailGateway} from '../domain/mail.js';
const target={mailbox:'Drafts',uid:7,uidValidity:'9'};
const request={operationId:'12345678-1234-4234-8234-123456789abc',to:['chosen@example.invalid'],subject:'Changed',text:'New text'};
const attachment={filename:'sample.bin',contentType:'application/octet-stream',contentBase64:Buffer.from([0,255,1,128]).toString('base64')};
async function fixture(){
 const db=new Database(':memory:'),calls:string[]=[],sent:OutboundMessage[]=[];
 const composer=new ICloudOutboundAdapter({user:'owner@example.invalid',password:'fixture-unused'});
 let source:Buffer=Buffer.from(await composer.compose({to:request.to,subject:request.subject,text:request.text,messageId:'<draft@example.invalid>',inReplyTo:'<original@example.invalid>',references:['<older@example.invalid>'],attachments:[attachment]}));
 const session:MailSession={supportsMove:true,list:async()=>[{path:'Drafts',name:'Drafts',selectable:true,specialUse:'\\Drafts'},{path:'Trash',name:'Trash',selectable:true,specialUse:'\\Trash'}],select:async(_m,o)=>{calls.push(o?.readOnly?'read':'write');return{uidValidity:'9',uidNext:8,supportsKeywords:true,release(){calls.push('release');}};},metadata:async()=>({size:source.length,attachments:[{partId:'2',...attachment,size:4}]}),download:async(_uid,part)=>({contentType:part?attachment.contentType:'message/rfc822',chunks:(async function*(){yield part?Buffer.from(attachment.contentBase64,'base64'):source;})(),cancel(){}}),append:async()=>{calls.push('append');return{uid:8,uidValidity:'9'};},move:async()=>{calls.push('move');return{uid:2,uidValidity:'10'};},search:async()=>[],summaries:async()=>[],mark:async()=>{throw Error('No marking');},flag:async()=>false,tag:async()=>false};
 const mail:MailGateway={withSession:run=>run(session),parse:async()=>({to:[],text:''})};
 const policy={allowRead:true,allowWrites:true,allowSend:true};
 const provider:OutboundGateway={compose:input=>composer.compose(input),send:async input=>{calls.push('send');sent.push(input);return{messageId:input.messageId,accepted:input.to,rejected:[]};},draft:async()=>{throw Error('No draft gateway');}};
 const service=new MailExtensions(policy,mail,provider,new SqliteOutboundLedger(db,new Uint8Array(32).fill(8),()=> 'fixture-owner'));
 return{service,session,provider,policy,calls,sent,composer,setSource:(v:Buffer)=>{source=v;},close:()=>db.close()};
}
test('actual MIME composition round-trips bounded binary attachments; rejects URL/path/base64 injection',async()=>{
 const f=await fixture();try{const parsed=await simpleParser(Buffer.from(await f.composer.compose({to:request.to,subject:request.subject,text:request.text,messageId:'<id@example.invalid>',attachments:[attachment]})));assert.deepEqual(parsed.attachments[0]?.content,Buffer.from([0,255,1,128]));assert.equal(parsed.attachments[0]?.filename,'sample.bin');
 for(const a of [{...attachment,path:'/etc/passwd'},{...attachment,filename:'../secret'},{...attachment,contentBase64:'%%%%'},{...attachment,contentType:'text/plain\r\nInjected: x'}])assert.equal(outboundRequestSchema.safeParse({...request,attachments:[a]}).success,false);
 assert.equal(outboundRequestSchema.safeParse({...request,attachments:[{...attachment,contentBase64:Buffer.alloc(1048577).toString('base64')}]}).success,false);
 }finally{f.close();}
});
test('download exact observed part preserves read state and rejects unobserved parts or stale identity',async()=>{
 const f=await fixture();try{const out=await f.service.attachment({target,partId:'2'});assert.equal(out.contentBase64,attachment.contentBase64);assert.equal(out.size,4);assert.match(out.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(f.calls,['read','release']);
 await assert.rejects(f.service.attachment({target,partId:'3'}),{code:'missing'});await assert.rejects(f.service.attachment({target:{...target,uidValidity:'10'},partId:'2'}),{code:'stale_identity'});
 }finally{f.close();}
});
test('draft send uses exact revision, explicit recipients, preserves attachments/threading, retains source and replays once',async()=>{
 const f=await fixture();try{const read=await f.service.readDraft({target});const input={operationId:request.operationId,to:request.to,target,revision:read.revision};const out=await f.service.sendDraft(input);assert.equal(out.status,'submitted');assert.equal(out.sourceRetained,true);assert.deepEqual(f.sent[0]?.to,request.to);assert.equal(f.sent[0]?.attachments?.[0]?.contentBase64,attachment.contentBase64);assert.equal(f.sent[0]?.inReplyTo,'<original@example.invalid>');assert.equal((await f.service.sendDraft(input)).replayed,true);assert.equal(f.sent.length,1);assert.ok(!f.calls.includes('move'));assert.ok(!f.calls.includes('append'));
 await assert.rejects(f.service.sendDraft({...input,to:['changed@example.invalid']}),{code:'invalid_input'});
 }finally{f.close();}
});
test('stale draft revision and non-Drafts targets reject before SMTP',async()=>{
 const f=await fixture();try{assert.equal((await f.service.sendDraft({operationId:request.operationId,to:request.to,target,revision:'0'.repeat(64)})).status,'rejected');assert.equal(f.sent.length,0);await assert.rejects(f.service.readDraft({target:{...target,mailbox:'INBOX'}}),{code:'invalid_input'});}finally{f.close();}
});
test('draft replacement appends before moving original and returns replacement identity with durable replay',async()=>{
 const f=await fixture();try{const {revision}=await f.service.readDraft({target});f.calls.length=0;const input={...request,target,revision};const result=await f.service.editDraft(input);assert.equal(result.status,'draft_saved');assert.deepEqual(result.draftTarget,{...target,uid:8});assert.deepEqual(f.calls,['write','append','move','release']);assert.equal((await f.service.editDraft(input)).replayed,true);assert.equal(f.calls.filter(x=>x==='append').length,1);}finally{f.close();}
});
test('lost original-move receipt preserves new draft identity as unknown and never appends again',async()=>{
 const f=await fixture();try{const {revision}=await f.service.readDraft({target});f.session.move=async()=>false;const input={...request,target,revision};const result=await f.service.editDraft(input);assert.equal(result.status,'unknown');assert.deepEqual(result.replacementTarget,{...target,uid:8});const replay=await f.service.editDraft(input);assert.equal(replay.replayed,true);assert.deepEqual(replay.replacementTarget,result.replacementTarget);assert.equal(f.calls.filter(x=>x==='append').length,1);}finally{f.close();}
});
test('forward packages original MIME without inheriting thread or recipients',async()=>{
 const f=await fixture();try{const result=await f.service.forward({...request,target});assert.equal(result.status,'submitted');assert.equal(f.sent[0]?.inReplyTo,undefined);assert.equal(f.sent[0]?.references,undefined);assert.deepEqual(f.sent[0]?.to,request.to);assert.equal(f.sent[0]?.attachments?.[0]?.contentType,'message/rfc822');assert.match(Buffer.from(f.sent[0]!.attachments![0]!.contentBase64,'base64').toString(),/Message-ID: <draft@example.invalid>/);}finally{f.close();}
});
test('disabled capabilities prevent session/provider access and oversized streamed parts reject',async()=>{
 const f=await fixture();try{f.policy.allowSend=false;await assert.rejects(f.service.forward({...request,target}),{code:'forbidden'});f.policy.allowWrites=false;await assert.rejects(f.service.editDraft({...request,target,revision:'0'.repeat(64)}),{code:'forbidden'});assert.equal(f.calls.length,0);f.session.download=async()=>({contentType:'application/octet-stream',chunks:(async function*(){yield Buffer.alloc(1048577);})(),cancel(){f.calls.push('cancel');}});await assert.rejects(f.service.attachment({target,partId:'2'}),{code:'unsupported_capability'});assert.ok(f.calls.includes('cancel'));}finally{f.close();}
});

for(const disabled of ['allowSend','allowRead'] as const)test(`queued forward rechecks ${disabled} before opening a session and persists rejection`,async()=>{
 const f=await fixture();let release=()=>{},started=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});
 const original=f.provider.send;f.provider.send=async input=>{started();await gate;return original(input);};
 try{
  const first=f.service.forward({...request,target});await entered;
  const input={...request,target,operationId:'12345678-1234-4234-8234-123456789abd'};
  const second=f.service.forward(input);f.policy[disabled]=false;release();
  assert.equal((await first).status,'submitted');const rejected=await second;
  assert.equal(rejected.status,'rejected');assert.equal(rejected.errorCode,'forbidden');
  assert.equal(f.sent.length,1);assert.equal(f.calls.filter(c=>c==='read').length,1);
  f.policy[disabled]=true;const replay=await f.service.forward(input);assert.equal(replay.status,'rejected');assert.equal(replay.replayed,true);assert.equal(f.sent.length,1);
 }finally{release();f.close();}
});

test('permission revocation during source read prevents SMTP submission',async()=>{
 const f=await fixture(),download=f.session.download;
 try{f.session.download=async(...args)=>{const result=await download(...args);f.policy.allowSend=false;return result;};
  const result=await f.service.forward({...request,target});assert.equal(result.status,'rejected');assert.equal(result.errorCode,'forbidden');assert.equal(f.sent.length,0);
 }finally{f.close();}
});

test('write revocation during composition prevents APPEND',async()=>{
 const f=await fixture(),compose=f.provider.compose!;
 try{const {revision}=await f.service.readDraft({target});f.provider.compose=async input=>{const mime=await compose(input);f.policy.allowWrites=false;return mime;};
  const result=await f.service.editDraft({...request,target,revision});assert.equal(result.status,'rejected');assert.equal(result.errorCode,'forbidden');assert.ok(!f.calls.includes('append'));assert.ok(!f.calls.includes('move'));
 }finally{f.close();}
});

test('write revocation after APPEND prevents source move and preserves unknown replacement receipt',async()=>{
 const f=await fixture(),append=f.session.append!;
 try{const {revision}=await f.service.readDraft({target});f.session.append=async(...args)=>{const saved=await append(...args);f.policy.allowWrites=false;return saved;};
  const input={...request,target,revision};const result=await f.service.editDraft(input);assert.equal(result.status,'unknown');assert.equal(result.errorCode,'forbidden');assert.deepEqual(result.replacementTarget,{...target,uid:8});assert.ok(!f.calls.includes('move'));
  f.policy.allowWrites=true;const replay=await f.service.editDraft(input);assert.equal(replay.status,'unknown');assert.equal(replay.replayed,true);assert.deepEqual(replay.replacementTarget,result.replacementTarget);assert.equal(f.calls.filter(c=>c==='append').length,1);
 }finally{f.close();}
});

for(const size of [900000,1048576,1048577])test(`attachment cap counts ${size} decoded bytes, not base64 BODYSTRUCTURE octets`,async()=>{
 const f=await fixture(),bytes=Buffer.alloc(size,0xa5);let cancelled=false;let requestedLimit=0;
 try{f.session.metadata=async()=>({attachments:[{partId:'2',filename:'binary.bin',contentType:'application/octet-stream',size:bytes.toString('base64').length}]});
  f.session.download=async(_uid,part,maxBytes)=>{assert.equal(part,'2');requestedLimit=maxBytes;return{contentType:'application/octet-stream',chunks:(async function*(){for(let offset=0;offset<bytes.length;offset+=65536)yield bytes.subarray(offset,offset+65536);})(),cancel(){cancelled=true;}};};
  if(size<=1048576){const result=await f.service.attachment({target,partId:'2'});assert.equal(result.size,size);assert.deepEqual(Buffer.from(result.contentBase64,'base64'),bytes);}
  else await assert.rejects(f.service.attachment({target,partId:'2'}),{code:'unsupported_capability'});
  assert.equal(requestedLimit,1048577);assert.equal(cancelled,true);assert.deepEqual(f.calls,['read','release']);
 }finally{f.close();}
});
