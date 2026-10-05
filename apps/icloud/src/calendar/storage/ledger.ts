import { Database } from 'bun:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { closeSync, chmodSync, existsSync, openSync } from 'node:fs';
import {z} from 'zod';
import {CustodyError} from '../../storage/custody-contract.js';

export interface CalendarLedgerIdentity { ownerId:string; accountId:string }
export interface CalendarPolicy { read:boolean; write:boolean; schedule:boolean; share:boolean }
export const disabledCalendarPolicy = ():CalendarPolicy => ({read:false,write:false,schedule:false,share:false});
export type OperationState = 'intent'|'dispatched'|'succeeded'|'failed'|'outcome_unknown';
export interface CalendarOperation { operationId:string; fingerprint:string; command:unknown; state:OperationState; result?:unknown; error?:string; updatedAt:string }
export interface CalendarSyncState { token:string; snapshot:unknown; changes:unknown[] }
export interface CalendarLedger {
 getPolicy(owner:string):CalendarPolicy; setPolicy(owner:string,policy:CalendarPolicy):void;
 operation(identity:CalendarLedgerIdentity,id:string):CalendarOperation|undefined;
 begin(identity:CalendarLedgerIdentity,operation:CalendarOperation):boolean;
 save(identity:CalendarLedgerIdentity,operation:CalendarOperation):void;
 sync(identity:CalendarLedgerIdentity,calendar:string):CalendarSyncState|undefined;
 commitSync(identity:CalendarLedgerIdentity,calendar:string,previousToken:string|undefined,state:CalendarSyncState):void;
}
function ownerHash(owner:string):string {if(!owner||owner.length>2048)throw new Error('calendar_owner_invalid');return createHash('sha256').update(owner).digest('hex');}
function openPayload(key:Uint8Array,owner:string,kind:string,id:string,payload:string):unknown {
 let partial:Buffer|undefined,final:Buffer|undefined,plain:Buffer|undefined;
 try{const envelope=JSON.parse(payload),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(Buffer.from(JSON.stringify([owner,kind,id])));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  partial=decipher.update(Buffer.from(envelope.data,'base64'));final=decipher.final();plain=Buffer.concat([partial,final]);return JSON.parse(plain.toString('utf8'));
 }finally{partial?.fill(0);final?.fill(0);plain?.fill(0);}
}
const policySchema=z.object({read:z.boolean(),write:z.boolean(),schedule:z.boolean(),share:z.boolean()}).strict();
const operationSchema=z.object({operationId:z.string().min(1),fingerprint:z.string().min(1),command:z.unknown().refine(value=>value!==undefined),state:z.enum(['intent','dispatched','succeeded','failed','outcome_unknown']),result:z.unknown().optional(),error:z.string().optional(),updatedAt:z.string().min(1)}).strict();
const syncSchema=z.object({token:z.string(),snapshot:z.unknown().refine(value=>value!==undefined),changes:z.array(z.unknown())}).strict();
/** Sensitive URLs, tokens, payloads and policy are authenticated and encrypted at rest. */
export class SqliteCalendarLedger implements CalendarLedger {
 /** Administrative snapshot, no constructors/DDL/repair or dispatch-state
  * conversion. Baseline namespaces include raw policy owner and every retained
  * JSON owner/account namespace. Presence/registry completeness is caller-owned. */
 static validateExistingPayloads(options:{database:Database;masterKey:Uint8Array;policyOwners:readonly string[];accountIdentities:readonly CalendarLedgerIdentity[]}):Readonly<{format:1;policies:number;operations:number;sync:number}> {
  let key:Buffer|undefined;
  try{
   if(options.masterKey.byteLength!==32)throw new CustodyError('invalid_input');
   const policies=new Set(options.policyOwners.map(ownerHash));
   const accounts=new Set(options.accountIdentities.map(identity=>{
    if(!identity.ownerId||!identity.accountId||identity.ownerId.length>256||identity.accountId.length>256)throw new CustodyError('invalid_input');
    return ownerHash(JSON.stringify([identity.ownerId,identity.accountId]));
   }));
   key=createHash('sha256').update(options.masterKey).update('calendar-ledger-v1').digest();
   return options.database.transaction(()=>{
    let policyCount=0,operations=0,sync=0;
    for(const raw of options.database.query('SELECT owner,kind,id,payload FROM calendar_ledger').all()){
     const row=z.object({owner:z.string(),kind:z.enum(['policy','operation','sync']),id:z.string().min(1),payload:z.string()}).strict().parse(raw);
     if(!(row.kind==='policy'?policies:accounts).has(row.owner))throw new CustodyError('recovery_required');
     const value=openPayload(key!,row.owner,row.kind,row.id,row.payload);
     if(row.kind==='policy'){if(row.id!=='current')throw new CustodyError('recovery_required');policySchema.parse(value);policyCount++;}
     else if(row.kind==='operation'){if(operationSchema.parse(value).operationId!==row.id)throw new CustodyError('recovery_required');operations++;}
     else{if(!/^[a-f0-9]{64}$/.test(row.id))throw new CustodyError('recovery_required');syncSchema.parse(value);sync++;}
    }
    return Object.freeze({format:1 as const,policies:policyCount,operations,sync});
   })();
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{key?.fill(0);}
 }
 private db:Database; private key:Buffer; private ownsDatabase:boolean;
 constructor(options:{databasePath?:string;database?:Database;masterKey:Uint8Array}) {
  if(options.masterKey.byteLength!==32)throw new Error('calendar_storage_unavailable');
  this.key=createHash('sha256').update(options.masterKey).update('calendar-ledger-v1').digest();
  this.ownsDatabase=!options.database;
  if(options.database)this.db=options.database;
  else {if(!options.databasePath)throw new Error('calendar_storage_unavailable');
   if(!existsSync(options.databasePath)){const fd=openSync(options.databasePath,'wx',0o600);closeSync(fd);}
   chmodSync(options.databasePath,0o600);this.db=new Database(options.databasePath,{readwrite:true});}
  this.db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS calendar_ledger(owner TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,kind,id))');
 }
 private owner(owner:string){return ownerHash(owner);}
 private seal(owner:string,kind:string,id:string,value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(JSON.stringify([owner,kind,id])));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});}
 private get<T>(owner:string,kind:string,id:string):T|undefined {const ownerKey=this.owner(owner);const row=this.db.query('SELECT payload FROM calendar_ledger WHERE owner=? AND kind=? AND id=?').get(ownerKey,kind,id) as {payload:string}|null;if(!row)return undefined;try{return openPayload(this.key,ownerKey,kind,id,row.payload) as T;}catch{throw new Error('calendar_storage_unavailable');}}
 private put(owner:string,kind:string,id:string,value:unknown){const key=this.owner(owner);this.db.query('INSERT INTO calendar_ledger VALUES(?,?,?,?) ON CONFLICT(owner,kind,id) DO UPDATE SET payload=excluded.payload').run(key,kind,id,this.seal(key,kind,id,value));}
 getPolicy(owner:string):CalendarPolicy {return this.get<CalendarPolicy>(owner,'policy','current')??disabledCalendarPolicy();}
 setPolicy(owner:string,policy:CalendarPolicy):void {if(['read','write','schedule','share'].some(key=>typeof policy[key as keyof CalendarPolicy]!=='boolean'))throw new Error('calendar_policy_invalid');this.put(owner,'policy','current',{read:policy.read,write:policy.write,schedule:policy.schedule,share:policy.share});}
 private namespace(identity:CalendarLedgerIdentity):string {if(!identity.ownerId||!identity.accountId||identity.ownerId.length>256||identity.accountId.length>256)throw new Error('calendar_owner_invalid');return JSON.stringify([identity.ownerId,identity.accountId]);}
 operation(identity:CalendarLedgerIdentity,id:string){const owner=this.namespace(identity);const row=this.get<CalendarOperation>(owner,'operation',id);if(row?.state==='dispatched')return {...row,state:'outcome_unknown' as const};return row;}
 begin(identity:CalendarLedgerIdentity,operation:CalendarOperation):boolean {const owner=this.namespace(identity);return this.db.transaction(()=>{if(this.get(owner,'operation',operation.operationId))return false;this.put(owner,'operation',operation.operationId,operation);return true;}).immediate();}
 save(identity:CalendarLedgerIdentity,operation:CalendarOperation):void {const owner=this.namespace(identity);this.put(owner,'operation',operation.operationId,operation);}
 sync(identity:CalendarLedgerIdentity,calendar:string){const owner=this.namespace(identity);return this.get<CalendarSyncState>(owner,'sync',createHash('sha256').update(calendar).digest('hex'));}
 commitSync(identity:CalendarLedgerIdentity,calendar:string,previousToken:string|undefined,state:CalendarSyncState):void {const owner=this.namespace(identity);this.db.transaction(()=>{const current=this.sync(identity,calendar);if(current?.token!==previousToken)throw new Error('calendar_sync_conflict');this.put(owner,'sync',createHash('sha256').update(calendar).digest('hex'),state);}).immediate();}
 close(){if(this.ownsDatabase)this.db.close();this.key.fill(0);}
}
