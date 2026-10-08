import {invocationContext} from '../modules/context.js';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import type {OwnerSecretStore} from '@decompozr/account/server';
import type {AppSettings} from '../server/settings.js';
import type {OperationMonitor} from '../observability/operations.js';
import {CalendarError,type CalendarGateway,type CalendarPolicy} from './domain/calendar.js';
import {createICloudCalendarGateway} from './icloud/gateway.js';
import {CalendarService} from './services/calendar.js';
import {SqliteCalendarLedger} from './storage/ledger.js';
import {calendarRegistration} from './mcp/tools.js';
import {calendarAdminCapabilities} from './admin.js';
export interface CalendarCredential {user:string;appPassword:string}
export interface CalendarModuleDependencies {store:OwnerSecretStore;authDatabase:Database;masterKey:Uint8Array;monitor:OperationMonitor;provider?:(credential:CalendarCredential)=>CalendarGateway}
const credentialSchema=z.object({user:z.string().email(),appPassword:z.string().min(1)}).strict();
const policySchema=z.object({read:z.boolean(),write:z.boolean(),schedule:z.boolean(),share:z.boolean()}).strict().refine(p=>(!p.write||p.read)&&(!(p.schedule||p.share)||(p.read&&p.write)));
const disabled=():CalendarPolicy=>({read:false,write:false,schedule:false,share:false});
export function createCalendarModule(_settings:AppSettings,deps:CalendarModuleDependencies){
 const ledger=new SqliteCalendarLedger({database:deps.authDatabase,masterKey:deps.masterKey});
 const provider=deps.provider??(credential=>createICloudCalendarGateway({credential}));
 const credential=(accountId?:string)=>{const owner=deps.store.ownerId();if(!owner||!accountId)throw new CalendarError('forbidden','Account-bound owner required');const metadata=deps.store.account(owner,accountId);if(!metadata?.credentialStored)throw new CalendarError('forbidden','Account unavailable');const bytes=deps.store.readAccountSecret(owner,accountId);if(!bytes)throw new CalendarError('forbidden','Credential revoked');try{return {owner,accountId,credential:credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))),fingerprint:createHash('sha256').update(bytes).digest('hex')};}finally{bytes.fill(0);}};
 const capabilities=():CalendarPolicy=>{const owner=deps.store.ownerId();return owner?ledger.getPolicy(owner):disabled();};
 const service=(scopes:ReadonlySet<string>=new Set())=>{const context=invocationContext();if(!context||context.ownerId!==deps.store.ownerId()||!context.accountId)throw new CalendarError('forbidden','Verified account context required');const start=credential(context.accountId);return new CalendarService({ownerId:start.owner,accountId:start.accountId,gateway:{execute:async(command,beforeDispatch)=>{const now=credential(start.accountId);if(now.owner!==start.owner||now.fingerprint!==start.fingerprint)throw new CalendarError('forbidden','Credential changed');return provider(now.credential).execute(command,context=>{const current=credential(start.accountId);if(current.owner!==start.owner||current.fingerprint!==start.fingerprint)throw new CalendarError('forbidden','Credential changed');beforeDispatch?.(context);});}},ledger,access:()=>{if(deps.store.ownerId()!==start.owner)return disabled();const p=capabilities();return {read:p.read&&scopes.has('calendar.read'),write:p.write&&scopes.has('calendar.write'),schedule:p.schedule&&scopes.has('calendar.schedule'),share:p.share&&scopes.has('calendar.share')};}});};
 const updateCapabilities=async(next:Record<string,boolean>,confirm:boolean)=>{const policy=policySchema.parse(next),owner=deps.store.ownerId();if(!owner)throw new CalendarError('forbidden','Owner required');const current=capabilities(),accounts=deps.store.listAccounts(owner).filter(account=>account.credentialStored),enabling=Object.entries(policy).some(([key,value])=>value&&!current[key as keyof CalendarPolicy]);if(enabling&&!confirm)throw new CalendarError('forbidden','Explicit activation required');if(enabling&&!accounts.length)throw new CalendarError('forbidden','Stored account required');const starts=enabling?accounts.map(account=>credential(account.id)):[];for(const start of starts)await provider(start.credential).execute({operation:'list_calendars'});if(deps.store.ownerId()!==owner||JSON.stringify(capabilities())!==JSON.stringify(current)||JSON.stringify(deps.store.listAccounts(owner).filter(account=>account.credentialStored))!==JSON.stringify(accounts))throw new CalendarError('conflict','Owner, accounts or policy changed');for(const start of starts){const now=credential(start.accountId);if(now.fingerprint!==start.fingerprint)throw new CalendarError('conflict','Credential changed');}ledger.setPolicy(owner,policy);return policy;};
 return {registration:{...calendarRegistration(capabilities,service,deps.monitor,_settings.public_origin),dispose:async()=>ledger.close()},service,admin:{id:'calendar',title:'Calendar',fields:calendarAdminCapabilities,capabilities,updateCapabilities}};
}
