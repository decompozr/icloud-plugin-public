import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from 'bun:sqlite';
import {createMailModule} from '../module.js';
import {withInvocationContext} from '../../modules/context.js';
import {OperationMonitor} from '../../observability/operations.js';
import type {AppSettings} from '../../server/settings.js';
import type {MailSession} from '../domain/mail.js';
import {outboundResultSchema} from '../domain/outbound.js';

const request={operationId:'12345678-1234-4234-8234-123456789abc',to:['author@example.invalid'],subject:'Fixture',text:'Fixture'};
const identity={ownerId:'fixture-owner',accountId:'fixture-account'};
const target={accountId:identity.accountId,mailbox:'INBOX',uid:41,uidValidity:'900'};
const settings:AppSettings={allow_writes:true,allow_send:true,host:'127.0.0.1',public_port:4100,private_port:4101,
 public_origin:'https://fixture.invalid',private_origin:'https://fixture.invalid:8443',runtime_mode:'native',
 state_directory:'unused-fixture-state',master_key_file:'unused-fixture-key',installation_marker:'unused-fixture-marker',tailscale_binary:'unused'};

function gate(){
 let entered=()=>{},release=()=>{};
 const waiting=new Promise<void>(resolve=>{entered=resolve;}),pending=new Promise<void>(resolve=>{release=resolve;});
 return{waiting,release,async pause(){entered();await pending;}};
}

// Keep the production policy getters, admin update and durable ledger. Only owner
// credentials and provider IO are synthetic; no provider or filesystem is accessed.
function fixture(kind:'reply'|'draft',pauseAt:'preparation'|'submission'){
 const database=new Database(':memory:'),blocked=gate();const calls:string[]=[];
 const unexpected=()=>{throw Error('Unexpected fixture operation');};
 const prepare=async()=>{calls.push('prepare');if(pauseAt==='preparation')await blocked.pause();};
 const submit=async()=>{calls.push('submit');if(pauseAt==='submission')await blocked.pause();};
 const session:MailSession={supportsMove:false,
  list:async()=>{await prepare();return[{path:'Drafts',name:'Drafts',selectable:true,specialUse:'\\Drafts'}];},
  select:async()=>({uidValidity:'900',uidNext:42,supportsKeywords:false,release(){}}),
  headers:async()=>{await prepare();return Buffer.from('From: author@example.invalid\r\nMessage-ID: <original@example.invalid>\r\n\r\n');},
  search:unexpected,summaries:unexpected,metadata:unexpected,download:unexpected,mark:unexpected,flag:unexpected,tag:unexpected,move:unexpected};
 const build=()=>createMailModule(settings,{
  authDatabase:database,masterKey:new Uint8Array(32).fill(7),monitor:new OperationMonitor(()=>{}),
  store:{setAccountService:()=>{},recordAccountProbe:()=>{},serviceDefaults:()=>({}),setServiceDefault:()=>{},ownerId:()=>identity.ownerId,legacyAccountId:()=>null,
   account:(owner,id)=>{assert.equal(owner,identity.ownerId);assert.equal(id,identity.accountId);return{id,user:'owner@example.invalid',label:'Fixture',credentialStored:true};},
   readAccountSecret:(owner,id)=>{assert.equal(owner,identity.ownerId);assert.equal(id,identity.accountId);return Buffer.from(JSON.stringify({user:'owner@example.invalid',appPassword:'not-a-real-password'}));},
   listAccounts:unexpected,addAccount:unexpected,rotateAccountSecret:unexpected,revokeAccountSecret:unexpected,readSecret:unexpected,
   checkBootstrapProof:unexpected,enroll:unexpected,rotateSecret:unexpected,revokeSecret:unexpected,close(){}},
  provider:()=>({withSession:run=>run(session),parse:unexpected,send:unexpected}),
  outboundProvider:()=>({
   send:async input=>{await submit();return{messageId:input.messageId,accepted:input.to,rejected:[]};},
   draft:async(input,mailbox)=>{await submit();return{mailbox,uid:81,uidValidity:'901',messageId:input.messageId};}
  })
 });
 let module=build();
 const entry=()=>{const found=module.registration.tools.find(tool=>tool.tool.name===(kind==='reply'?'mail_reply':'mail_draft_create'));assert.ok(found);return found;};
 return{
  blocked,calls,enabled:()=>entry().enabled(),policy:()=>module.admin.capabilities(),
  update:(policy:Record<string,boolean>,confirm=false)=>module.admin.updateCapabilities(policy,confirm),
  async run(){const result=await withInvocationContext(identity,()=>entry().run({...request,...(kind==='reply'?{target}:{})}));const content=result.content[0];assert.ok(content?.type==='text');return outboundResultSchema.parse(JSON.parse(content.text));},
  async reopen(){await module.registration.dispose();module=build();},
  async close(){blocked.release();await module.registration.dispose();database.close();}
 };
}

for(const kind of ['reply','draft'] as const){
 for(const capability of [kind==='reply'?'send':'write','read'] as const){
  test(`${kind}: revoking ${capability} during preparation prevents submission and persists rejection`,async()=>{
   const f=fixture(kind,'preparation');let pending:ReturnType<typeof f.run>|undefined;
   try{
    assert.equal(f.enabled(),true);pending=f.run();await f.blocked.waiting;
    await f.update({...f.policy(),[capability]:false});assert.equal(f.enabled(),false);assert.deepEqual(f.calls,['prepare']);
    f.blocked.release();const rejected=await pending;
    assert.equal(rejected.status,'rejected');assert.equal(rejected.errorCode,'forbidden');assert.equal(rejected.replayed,false);
    if(kind==='reply')assert.deepEqual(rejected.replyTarget,target);
    assert.deepEqual(f.calls,['prepare']);
    await f.update({...f.policy(),[capability]:true},true);await f.reopen();
    assert.deepEqual(await f.run(),{...rejected,replayed:true});assert.deepEqual(f.calls,['prepare']);
   }finally{f.blocked.release();await pending;await f.close();}
  });
 }
 test(`${kind}: disabling policy after provider invocation allows the accepted operation to finish`,async()=>{
  const f=fixture(kind,'submission');let pending:ReturnType<typeof f.run>|undefined;
  try{
   pending=f.run();await f.blocked.waiting;assert.deepEqual(f.calls,['prepare','submit']);
   await f.update({...f.policy(),[kind==='reply'?'send':'write']:false});assert.equal(f.enabled(),false);
   f.blocked.release();const result=await pending;
   assert.equal(result.status,kind==='reply'?'submitted':'draft_saved');assert.equal(result.replayed,false);
   assert.deepEqual(f.calls,['prepare','submit']);
  }finally{f.blocked.release();await pending;await f.close();}
 });
}
