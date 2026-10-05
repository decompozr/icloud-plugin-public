import {invocationContext} from '../modules/context.js';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import type {AccountCredentialReader,AccountCredentialState} from '../storage/account-credential-reader.js';
import type {OwnerSecretStore} from '../storage/owner-store.js';
import type {AppSettings} from '../server/settings.js';
import type {OperationMonitor} from '../observability/operations.js';
import {CalendarError,isCalendarMutation,type CalendarGateway,type CalendarPolicy} from './domain/calendar.js';
import {createICloudCalendarGateway} from './icloud/gateway.js';
import {CalendarService} from './services/calendar.js';
import {SqliteCalendarLedger} from './storage/ledger.js';
import {calendarRegistration} from './mcp/tools.js';
import {calendarAdminCapabilities} from './admin.js';
export interface CalendarCredential {user:string;appPassword:string}
export interface CalendarModuleDependencies {store:OwnerSecretStore;authDatabase:Database;masterKey:Uint8Array;monitor:OperationMonitor;credentialReader?:Pick<AccountCredentialReader,'account'|'listAccounts'|'read'|'assertCurrent'>;provider?:(credential:CalendarCredential)=>CalendarGateway}
const credentialSchema=z.object({user:z.string().email(),appPassword:z.string().min(1)}).strict();
const policySchema=z.object({read:z.boolean(),write:z.boolean(),schedule:z.boolean(),share:z.boolean()}).strict().refine(p=>(!p.write||p.read)&&(!(p.schedule||p.share)||(p.read&&p.write)));
const disabled=():CalendarPolicy=>({read:false,write:false,schedule:false,share:false});
export function createCalendarModule(_settings:AppSettings,deps:CalendarModuleDependencies){
 const ledger=new SqliteCalendarLedger({database:deps.authDatabase,masterKey:deps.masterKey});
 const provider=deps.provider??(credential=>createICloudCalendarGateway({credential}));
 const legacyCredential=(accountId?:string)=>{const owner=deps.store.ownerId();if(!owner||!accountId)throw new CalendarError('forbidden','Account-bound owner required');const metadata=deps.store.account(owner,accountId);if(!metadata?.credentialStored)throw new CalendarError('forbidden','Account unavailable');const bytes=deps.store.readAccountSecret(owner,accountId);if(!bytes)throw new CalendarError('forbidden','Credential revoked');try{return {owner,accountId,credential:credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))),fingerprint:createHash('sha256').update(bytes).digest('hex')};}finally{bytes.fill(0);}};
 type LoadedCredential=ReturnType<typeof legacyCredential>&{snapshot?:AccountCredentialState};
 const accounts=(owner:string)=>deps.credentialReader?deps.credentialReader.listAccounts(owner).map(row=>row.account):deps.store.listAccounts(owner);
 const credential=async(accountId?:string):Promise<LoadedCredential>=>{
  if(!deps.credentialReader)return legacyCredential(accountId);
  const owner=deps.store.ownerId();if(!owner||!accountId)throw new CalendarError('forbidden','Account-bound owner required');
  let bytes:Uint8Array|undefined;
  try{
   const read=await deps.credentialReader.read(owner,accountId);bytes=read.bytes;
   if(deps.store.ownerId()!==owner||read.state.ownerId!==owner||read.state.account.id!==accountId)throw new CalendarError('forbidden','Account changed');
   deps.credentialReader.assertCurrent(read.state);
   return {owner,accountId,credential:credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))),fingerprint:createHash('sha256').update(bytes).digest('hex'),snapshot:read.state};
  }catch(error){if(error instanceof CalendarError)throw error;throw new CalendarError('provider_error','Account credential unavailable');}
  finally{bytes?.fill(0);}
 };
 const assertCredentialCurrent=(loaded:LoadedCredential)=>{
  if(deps.store.ownerId()!==loaded.owner)throw new CalendarError('forbidden','Owner changed');
  if(loaded.snapshot){try{deps.credentialReader!.assertCurrent(loaded.snapshot);}catch{throw new CalendarError('provider_error','Account credential changed');}}
  else if(legacyCredential(loaded.accountId).fingerprint!==loaded.fingerprint)throw new CalendarError('forbidden','Credential changed');
 };
 const capabilities=():CalendarPolicy=>{const owner=deps.store.ownerId();return owner?ledger.getPolicy(owner):disabled();};
 const service=async(scopes:ReadonlySet<string>=new Set())=>{
  const context=invocationContext();if(!context||context.ownerId!==deps.store.ownerId()||!context.accountId)throw new CalendarError('forbidden','Verified account context required');
  const start=await credential(context.accountId);assertCredentialCurrent(start);
  return new CalendarService({ownerId:start.owner,accountId:start.accountId,gateway:{execute:async(command,beforeDispatch)=>{
   assertCredentialCurrent(start);const now=await credential(start.accountId);assertCredentialCurrent(start);
   if(now.owner!==start.owner||now.fingerprint!==start.fingerprint)throw new CalendarError('provider_error','Credential changed');
   const result=await provider(now.credential).execute(command,dispatch=>{assertCredentialCurrent(start);assertCredentialCurrent(now);beforeDispatch?.(dispatch);});
   // Keep observed writes after dispatch; stale reads must not commit sync or
   // publish readiness after credential/authority changes.
   if(!isCalendarMutation(command)){assertCredentialCurrent(start);assertCredentialCurrent(now);}
   return result;
  }},ledger,access:()=>{
   assertCredentialCurrent(start);const policy=capabilities();
   return {read:policy.read&&scopes.has('calendar.read'),write:policy.write&&scopes.has('calendar.write'),schedule:policy.schedule&&scopes.has('calendar.schedule'),share:policy.share&&scopes.has('calendar.share')};
  }});
 };
 const updateCapabilities=async(next:Record<string,boolean>,confirm:boolean)=>{
  const policy=policySchema.parse(next),owner=deps.store.ownerId();if(!owner)throw new CalendarError('forbidden','Owner required');
  const current=capabilities(),selected=accounts(owner).filter(account=>account.credentialStored),enabling=Object.entries(policy).some(([key,value])=>value&&!current[key as keyof CalendarPolicy]);
  if(enabling&&!confirm)throw new CalendarError('forbidden','Explicit activation required');if(enabling&&!selected.length)throw new CalendarError('forbidden','Stored account required');
  const starts:LoadedCredential[]=[];
  if(enabling)for(const account of selected){const start=await credential(account.id);starts.push(start);assertCredentialCurrent(start);await provider(start.credential).execute({operation:'list_calendars'},()=>{for(const prior of starts)assertCredentialCurrent(prior);});assertCredentialCurrent(start);}
  if(deps.store.ownerId()!==owner||JSON.stringify(capabilities())!==JSON.stringify(current)||JSON.stringify(accounts(owner).filter(account=>account.credentialStored))!==JSON.stringify(selected))throw new CalendarError('conflict','Owner, accounts or policy changed');
  for(const start of starts){assertCredentialCurrent(start);const now=await credential(start.accountId);assertCredentialCurrent(start);if(now.fingerprint!==start.fingerprint)throw new CalendarError('conflict','Credential changed');}
  // Recheck all snapshots and shared state after every awaited validation.
  if(deps.store.ownerId()!==owner||JSON.stringify(capabilities())!==JSON.stringify(current)||JSON.stringify(accounts(owner).filter(account=>account.credentialStored))!==JSON.stringify(selected))throw new CalendarError('conflict','Owner, accounts or policy changed');
  for(const start of starts)assertCredentialCurrent(start);ledger.setPolicy(owner,policy);return policy;
 };
 return {registration:{...calendarRegistration(capabilities,service,deps.monitor,_settings.public_origin),dispose:async()=>ledger.close()},service,admin:{id:'calendar',title:'Calendar',fields:calendarAdminCapabilities,capabilities,updateCapabilities}};
}
