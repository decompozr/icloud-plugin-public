import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Database} from 'bun:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {SqliteOwnerStore} from '../storage/owner-store.js';
import {createPrivateAdmin} from '../admin/handler.js';
import {createCredentialProbe,CredentialProbeError,ServiceUnavailableError,type ProbeEvidence} from './capabilities.js';
import {AccountAccess} from './access.js';
import {ModuleRuntime,type RuntimeModule} from '../modules/runtime.js';
import {invocationContext,withInvocationContext} from '../modules/context.js';
import {createServer} from '../mcp/server.js';
import {createCalendarModule} from '../calendar/module.js';
import {OperationMonitor} from '../observability/operations.js';
import type {AppSettings} from '../server/settings.js';
const registry=[{id:'mail',title:'Mail'},{id:'calendar',title:'Calendar'}];
const evidence=(mail:boolean,calendar=true):ProbeEvidence=>({mail:{availability:mail?'available':'unknown',reason:mail?'verified':'probe_failed',checkedAt:new Date().toISOString()},calendar:{availability:calendar?'available':'unknown',reason:calendar?'verified':'probe_failed',checkedAt:new Date().toISOString()}});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'icloud-capability-test-'));
 const options={databasePath:join(dir,'state.db'),markerPath:join(dir,'marker'),masterKey:randomBytes(32),bootstrapProof:randomBytes(32).toString('hex')};
 let store=SqliteOwnerStore.provision(options);store.enroll({proof:options.bootstrapProof,ownerId:'owner'});
 return {get store(){return store;},options,add:(user:string,services=evidence(true))=>store.addAccount('owner',{user,label:user,credential:Buffer.from(JSON.stringify({user,appPassword:'fixture-secret'})),services}),reopen(){store.close();store=SqliteOwnerStore.open(options);},close(){store.close();rmSync(dir,{recursive:true});}};
}
function module(id:string):RuntimeModule{return{id,scopes:[{name:id+'.read',title:id,description:id,enabled:()=>true}],tools:[{tool:{name:id+'_read',inputSchema:{type:'object',properties:{},additionalProperties:false}},requiredScopes:[id+'.read'],enabled:()=>true,run:async()=>({content:[{type:'text',text:JSON.stringify({accountId:invocationContext()?.accountId})}]})}]};}
test('independent probes accept Calendar without Mail; failures remain honest and redacted',async()=>{
 const calls:string[]=[];
 const probe=createCredentialProbe([{id:'mail',title:'Mail',probe:async()=>{calls.push('mail');throw Error('AUTH failed with secret');}},{id:'calendar',title:'Calendar',probe:async()=>{calls.push('calendar');}}]);
 const result=await probe({user:'calendar@example.invalid',appPassword:'fixture-secret'});
 expect(calls.sort()).toEqual(['calendar','mail']);expect(result.calendar?.availability).toBe('available');expect(result.mail?.availability).toBe('unknown');expect(JSON.stringify(result)).not.toContain('secret');
 const explicit=createCredentialProbe([{id:'mail',title:'Mail',probe:async()=>{throw new ServiceUnavailableError();}},{id:'calendar',title:'Calendar',probe:async()=>{}}]);
 expect((await explicit({user:'x',appPassword:'y'})).mail?.availability).toBe('unavailable');
 const failing=createCredentialProbe(registry.map(service=>({...service,probe:async()=>{throw Error('network secret');}})));
 try{await failing({user:'x',appPassword:'y'});throw Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(CredentialProbeError);expect(Object.values((error as CredentialProbeError).services).every(item=>item.availability==='unknown')).toBe(true);expect(JSON.stringify(error)).not.toContain('network secret');}
});
test('capability evidence and disabled choices survive refresh; revision guards defeat stale rotation and probes',()=>{
 const f=fixture();try{
  const a=f.add('calendar@example.invalid',evidence(false));expect(a.services?.mail?.enabled).toBe(false);expect(a.services?.calendar?.enabled).toBe(true);
  f.store.setAccountService('owner',a.id,'calendar',false,a.credentialRevision!);f.reopen();expect(f.store.account('owner',a.id).services?.calendar?.enabled).toBe(false);
  f.store.rotateAccountSecret('owner',a.id,Buffer.from('rotated-secret'),{expectedRevision:a.credentialRevision!,services:evidence(true)});
  expect(f.store.account('owner',a.id).services?.calendar?.enabled).toBe(false);
  expect(()=>f.store.rotateAccountSecret('owner',a.id,Buffer.from('stale-secret'),{expectedRevision:a.credentialRevision!,services:evidence(true)})).toThrow('STALE_REVISION');
  expect(()=>f.store.recordAccountProbe('owner',a.id,a.credentialRevision!,evidence(true))).toThrow('STALE_REVISION');
  expect(Buffer.from(f.store.readAccountSecret('owner',a.id)!).toString()).toBe('rotated-secret');
  const revision=f.store.account('owner',a.id).credentialRevision!;f.store.revokeAccountSecret('owner',a.id);
  expect(()=>f.store.recordAccountProbe('owner',a.id,revision,evidence(true))).toThrow('STALE_REVISION');
  expect(()=>f.store.addAccount('owner',{user:a.user,credential:Buffer.from('resurrected'),services:evidence(true),expectedRevision:revision})).toThrow('STALE_REVISION');
  expect(f.store.account('owner',a.id).credentialStored).toBe(false);
  expect(readFileSync(f.options.databasePath).includes(Buffer.from('fixture-secret'))).toBe(false);
 }finally{f.close();}
});
test('real MCP tools union uses only authorized eligible accounts; explicit/default/ambiguous routing and old calls are enforced',async()=>{
 const f=fixture();const a=f.add('a@example.invalid'),b=f.add('b@example.invalid',evidence(false)),unrelated=f.add('unrelated@example.invalid');
 const access=new AccountAccess(f.store,registry),runtime=new ModuleRuntime(access).register(module('mail')).register(module('calendar'));
 const context={ownerId:'owner',accountIds:[a.id,b.id]};
 const server=createServer(runtime,'https://fixture.invalid',new Set(['mail.read','calendar.read']),undefined,context),client=new Client({name:'capabilities',version:'1'}),[left,right]=InMemoryTransport.createLinkedPair();
 await server.connect(left);await client.connect(right);
 const call=async(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});
 try{
  expect((await client.listTools()).tools.map(tool=>tool.name)).toEqual(['icloud_accounts','mail_read','calendar_read']);
  const catalog=JSON.stringify(await call('icloud_accounts'));expect(catalog).toContain(a.id);expect(catalog).toContain(b.id);expect(catalog).not.toContain(unrelated.id);expect(catalog).not.toContain('fixture-secret');expect(catalog).not.toContain('credentialRevision');
  expect(JSON.stringify(await call('mail_read'))).toContain(a.id);
  expect(JSON.stringify(await call('calendar_read'))).toContain('account_selection_required');
  expect(JSON.stringify(await call('calendar_read',{account_id:b.id}))).toContain(b.id);
  expect(JSON.stringify(await call('mail_read',{account_id:b.id}))).toContain('service_unavailable');
  expect(JSON.stringify(await call('mail_read',{account_id:unrelated.id}))).toContain('account_not_authorized');
  f.store.setServiceDefault('owner','calendar',b.id);expect(JSON.stringify(await call('calendar_read'))).toContain(b.id);
  f.store.setServiceDefault('owner','calendar',unrelated.id);expect(JSON.stringify(await call('calendar_read'))).toContain('account_selection_required');
  f.store.setAccountService('owner',a.id,'mail',false,a.credentialRevision!);
  expect((await client.listTools()).tools.some(tool=>tool.name==='mail_read')).toBe(false);expect((await call('mail_read',{account_id:a.id})).isError).toBe(true);
  expect(runtime.listTools({ownerId:'owner',accountId:unrelated.id}).some(tool=>tool.name==='mail_read')).toBe(true);
  expect(access.catalog({ownerId:'attacker',accountIds:[a.id]}).accounts).toEqual([]);
  expect(server.getClientCapabilities()).toBeDefined();
 }finally{await client.close();await server.close();f.close();}
});
test('rotation preserves old state on all-failed checks and rejects a concurrent revoke; service controls and defaults require owner',async()=>{
 const f=fixture(),a=f.add('a@example.invalid');let changes=0;let mode:'fail'|'pause'|'success'='fail';let release!:()=>void,entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),pause=new Promise<void>(resolve=>release=resolve);
 const handle=createPrivateAdmin({onAccountServicesChanged:()=>{changes++;},services:registry,privateOrigin:'https://private.invalid',store:f.store,ownerAuth:{ownerSession:async headers=>({user:{id:headers.get('owner')??'owner'}}),enrollmentSession:async()=>({user:{id:'owner'}})},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async()=>{if(mode==='fail')throw new CredentialProbeError(evidence(false,false));if(mode==='pause'){entered();await pause;}return evidence(false);}});
 const post=(path:string,body:unknown,owner='owner')=>handle(new Request('https://private.invalid/icloud/admin/'+path,{method:'POST',headers:{origin:'https://private.invalid','content-type':'application/json',owner},body:JSON.stringify(body)}));
 try{
  const before=f.store.account('owner',a.id);const failed=await post('credential',{accountId:a.id,appPassword:'replacement'});expect(failed.status).toBe(422);expect(f.store.account('owner',a.id)).toEqual(before);expect(Buffer.from(f.store.readAccountSecret('owner',a.id)!).toString()).toContain('fixture-secret');
  expect((await post('account-service',{accountId:a.id,service:'calendar',enabled:false,credentialRevision:1},'attacker')).status).toBe(403);
  expect((await post('account-service',{accountId:a.id,service:'photos',enabled:true,credentialRevision:1})).status).toBe(400);
  expect((await post('service-default',{accountId:a.id,service:'calendar'})).status).toBe(200);
  expect((await post('account-service',{accountId:a.id,service:'calendar',enabled:false,credentialRevision:1})).status).toBe(200);expect(f.store.account('owner',a.id).services?.calendar?.enabled).toBe(false);
  expect(changes).toBe(1);expect((await post('account-service',{accountId:a.id,service:'calendar',enabled:true,credentialRevision:1})).status).toBe(200);expect(changes).toBe(2);
  mode='pause';const rotating=post('credential',{accountId:a.id,appPassword:'replacement'});await started;f.store.revokeAccountSecret('owner',a.id);release();expect((await rotating).status).toBe(409);expect(f.store.account('owner',a.id).credentialStored).toBe(false);
 }finally{release?.();f.close();}
});
test('Calendar activation ignores Mail-only accounts and rejects cross-account event identity before provider access',async()=>{
 const f=fixture(),a=f.add('calendar@example.invalid',evidence(false)),b=f.add('mail@example.invalid',evidence(true,false)),db=new Database(':memory:');let calls=0;
 const calendar=createCalendarModule({public_origin:'https://example.invalid'} as AppSettings,{store:f.store,authDatabase:db,masterKey:randomBytes(32),monitor:new OperationMonitor(()=>{}),provider:credential=>({execute:async command=>{expect(credential.user).toBe(a.user);calls++;return {operation:command.operation,calendars:[]};}})});
 try{
  await calendar.admin.updateCapabilities({read:true,write:true,schedule:false,share:false},true);expect(calls).toBe(1);
  const tool=calendar.registration.tools.find(tool=>tool.tool.name==='calendar_update_event')!;
  const result=await withInvocationContext({ownerId:'owner',accountId:a.id},()=>tool.run({operationId:crypto.randomUUID(),identity:{accountId:b.id,calendarHref:'https://fixture.invalid/c/',href:'https://fixture.invalid/c/e.ics',uid:'event',etag:'1'},fields:{summary:'changed'}},new Set(['calendar.read','calendar.write'])));
  expect(result.isError).toBe(true);expect(calls).toBe(1);
 }finally{db.close();f.close();}
});

test('private account onboarding persists Calendar-only evidence and never revives an existing account',async()=>{
 const f=fixture();
 const handle=createPrivateAdmin({services:registry,privateOrigin:'https://private.invalid',store:f.store,ownerAuth:{ownerSession:async()=>({user:{id:'owner'}}),enrollmentSession:async()=>({user:{id:'owner'}})},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:createCredentialProbe([{id:'mail',title:'Mail',probe:async()=>{throw Error('Unknown Mail');}},{id:'calendar',title:'Calendar',probe:async()=>{}}])});
 const add=()=>handle(new Request('https://private.invalid/icloud/admin/accounts/add',{method:'POST',headers:{origin:'https://private.invalid','content-type':'application/json'},body:JSON.stringify({user:'new@example.invalid',appPassword:'synthetic-only'})}));
 try{const response=await add();expect(response.status).toBe(201);const account=(await response.json()).account;expect(account.services.mail.availability).toBe('unknown');expect(account.services.mail.enabled).toBe(false);expect(account.services.calendar.enabled).toBe(true);f.store.revokeAccountSecret('owner',account.id);expect((await add()).status).toBe(409);expect(f.store.account('owner',account.id).credentialStored).toBe(false);}finally{f.close();}
});
