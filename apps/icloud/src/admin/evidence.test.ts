import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ReadinessEvidence} from './evidence.js';
import {evidenceState} from './evidence-state.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {createServer} from '../mcp/server.js';
import type {OwnerSecretStore} from '../storage/owner-store.js';
import type {Principal} from '../auth/verify.js';
const principal=(now:number):Principal=>({subject:'owner',accountId:'account',clientId:'client',expiresAt:now+60000,scopes:new Set(['calendar.read'])});
const ok={content:[{type:'text' as const,text:'{"events":[]}'}]};
test('observations isolate client/account, expire, invalidate, reject errors and in-flight changes; restart is unknown',()=>{
 let now=100000,stamp='a';const evidence=new ReadinessEvidence(()=>stamp,()=>now),p=principal(now);
 evidence.observe(p);expect(evidence.list('other')).toEqual([]);expect(evidence.list('owner')[0]!.reads).toEqual({});
 evidence.start(p,'calendar_query_events')?.({...ok,isError:true});expect(evidence.list('owner')[0]!.reads).toEqual({});
 evidence.start(p,'calendar_query_events')?.({content:[{type:'text',text:'{"complete":false}'}]});expect(evidence.list('owner')[0]!.reads).toEqual({});
 expect(evidence.start(p,'calendar_create_event')).toBeUndefined();
 const finish=evidence.start(p,'calendar_query_events');stamp='b';finish?.(ok);expect(evidence.list('owner')).toEqual([]);
 evidence.observe(p);evidence.start({...p,accountId:'different'},'calendar_query_events')?.(ok);expect(evidence.list('owner')[0]!.reads).toEqual({});
 evidence.start({...p,clientId:'different'},'calendar_query_events')?.(ok);expect(evidence.list('owner')[0]!.reads).toEqual({});
 evidence.start(p,'calendar_query_events')?.(ok);expect(evidence.list('owner')[0]!.reads.calendar_query_events).toBe(new Date(now).toISOString());
 expect(new ReadinessEvidence(()=>stamp,()=>now).list('owner')).toEqual([]);
 now+=60001;expect(evidence.list('owner')).toEqual([]);
 evidence.observe({...principal(now),clientId:undefined});expect(evidence.list('owner')).toEqual([]);
});
test('nonsecret snapshot invalidates revocation, consent/client changes, policy epoch and credential generation',()=>{
 const db=new Database(':memory:');for(const table of ['oauthClient','oauthConsent','oauthAccessToken','oauthRefreshToken','session']){db.exec(`CREATE TABLE ${table}(id TEXT,clientId TEXT,userId TEXT,referenceId TEXT,scopes TEXT,expiresAt TEXT,revoked INTEGER,disabled INTEGER,token TEXT)`);db.query(`INSERT INTO ${table} VALUES('id','client','owner','account','calendar.read','2099-01-01T00:00:00Z',0,0,'must-not-retain')`).run();}
 let generation:number|undefined=1,epoch=0,enabled=true,serviceEnabled=true;
 const store={ownerId:()=> 'owner',accountGeneration:()=>generation,account:()=>({credentialStored:true,services:{calendar:{availability:'available',enabled:serviceEnabled,reason:'verified',checkedAt:null}}})} as unknown as OwnerSecretStore;
 const state=evidenceState(db,store,()=>enabled?['calendar.read']:[],()=>epoch),p=principal(Date.now());
 let before=state(p,'calendar');expect(before).toBeDefined();
 db.exec("UPDATE oauthAccessToken SET token='different-secret'");expect(state(p,'calendar')).toBe(before);
 for(const change of ["UPDATE oauthAccessToken SET revoked=1","DELETE FROM oauthConsent","UPDATE oauthClient SET disabled=1","DELETE FROM session"]){db.exec(change);expect(state(p,'calendar')).not.toBe(before);before=state(p,'calendar');}
 generation++;expect(state(p,'calendar')).not.toBe(before);before=state(p,'calendar');epoch++;expect(state(p,'calendar')).not.toBe(before);
 serviceEnabled=false;expect(state(p,'calendar')).toBeUndefined();serviceEnabled=true;
 enabled=false;expect(state(p,'calendar')).toBeUndefined();enabled=true;generation=undefined;expect(state(p,'calendar')).toBeUndefined();db.close();
});
test('actual MCP tool execution records only allowed completed reads; discovery and challenge do not',async()=>{
 const p=principal(Date.now()),evidence=new ReadinessEvidence(()=> 'state');let calls=0,fail=false;
 const runtime=new ModuleRuntime().register({id:'calendar',scopes:[{name:'calendar.read',title:'Read',description:'Read',enabled:()=>true}],tools:[{tool:{name:'calendar_query_events',inputSchema:{type:'object'}},requiredScopes:['calendar.read'],enabled:()=>true,run:async()=>{calls++;return fail?{...ok,isError:true}:ok;}}]});await runtime.start();
 for(const authorized of [false,true]){
  const server=createServer(runtime,'https://example.invalid/mcp',new Set(authorized?['calendar.read']:[]),undefined,{ownerId:p.subject,accountId:p.accountId},tool=>evidence.start(p,tool));const client=new Client({name:'fixture',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  if(authorized)evidence.observe(p);await client.listTools();expect(evidence.list('owner')[0]?.reads??{}).toEqual({});
  await client.callTool({name:'calendar_query_events',arguments:{}});
  if(authorized){expect(evidence.list('owner')[0]!.reads.calendar_query_events).toBeDefined();fail=true;const before=JSON.stringify(evidence.list('owner'));await client.callTool({name:'calendar_query_events',arguments:{}});expect(JSON.stringify(evidence.list('owner'))).toBe(before);}else expect(evidence.list('owner')).toEqual([]);
  await client.close();await server.close();
 }expect(calls).toBe(2);await runtime.dispose();
});

test('multi-account authorization evidence records reads only for the routed account',()=>{
 const now=Date.now(),p={...principal(now),accountId:undefined,accountIds:['a','b']},evidence=new ReadinessEvidence(()=> 'state');
 evidence.observe(p);expect(evidence.list('owner').map(row=>row.accountId)).toEqual(['a','b']);
 evidence.start({...p,accountId:'b'},'calendar_query_events')?.(ok);
 expect(evidence.list('owner').find(row=>row.accountId==='a')!.reads).toEqual({});
 expect(evidence.list('owner').find(row=>row.accountId==='b')!.reads.calendar_query_events).toBeDefined();
});

test('service off-on epoch invalidates old reads and in-flight completions even without intermediate observation',()=>{
 let epoch=0,enabled=true;const evidence=new ReadinessEvidence(()=>enabled?String(epoch):undefined),p=principal(Date.now());
 evidence.observe(p);evidence.start(p,'calendar_query_events')?.(ok);const finish=evidence.start(p,'calendar_query_events');
 enabled=false;epoch++;enabled=true;epoch++;finish?.(ok);
 expect(evidence.list('owner')).toEqual([]);evidence.observe(p);expect(evidence.list('owner')[0]!.reads).toEqual({});
});
