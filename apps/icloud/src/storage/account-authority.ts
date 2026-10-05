import {Database} from 'bun:sqlite';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {CustodyError,accountCustodyIdentitySchema,installationIdentitySchema,type AccountCustodyIdentity} from './custody-contract.js';
import type {OwnerSecretStore} from './owner-store.js';

const number=z.number().int().positive().safe(),uuid=z.string().uuid();
const stateSchema=z.object({format:z.literal(1),installationId:installationIdentitySchema,
 ownerId:z.string().min(1).max(2048),accountId:uuid,user:z.string().min(1),revision:number,epoch:number,
 authority:z.enum(['sqlite','keychain','none']),phase:z.enum(['sqlite_authoritative','copy_intent','keychain_verified','keychain_authoritative','revoked','recovery_required']),
 operationId:uuid.nullable(),activeGeneration:number.nullable(),stagedGeneration:number.nullable(),nextGeneration:number,mac:z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((v,c)=>{
 const pending=v.phase==='copy_intent'||v.phase==='keychain_verified';
 const valid=v.phase==='recovery_required'
  ?v.authority==='keychain'&&v.activeGeneration!==null&&v.stagedGeneration===null
  :pending?v.authority==='sqlite'&&v.activeGeneration===null&&v.stagedGeneration!==null&&v.operationId!==null
  :v.phase==='sqlite_authoritative'?v.authority==='sqlite'&&v.activeGeneration===null&&v.stagedGeneration===null
  :v.phase==='keychain_authoritative'?v.authority==='keychain'&&v.activeGeneration!==null&&v.stagedGeneration===null&&v.operationId!==null
  :v.phase==='revoked'&&v.authority==='none'&&v.activeGeneration===null&&v.stagedGeneration===null;
 if(!valid||v.activeGeneration!==null&&v.activeGeneration>=v.nextGeneration||v.stagedGeneration!==null&&v.stagedGeneration>=v.nextGeneration)c.addIssue({code:'custom',message:'Invalid custody state'});
});
export type AccountAuthorityState=Readonly<z.infer<typeof stateSchema>>;
const cleanupSchema=accountCustodyIdentitySchema.extend({operationId:uuid,mac:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type AccountCleanupItem=Readonly<z.infer<typeof cleanupSchema>>;
const registrySchema=z.object({id:uuid,user:z.string().min(1),secret:z.string().nullable(),version:number}).strict();
function fail(code:'invalid_input'|'denied'|'missing'|'conflict'|'recovery_required'|'revoked'):never {throw new CustodyError(code);}
const sign=(key:Uint8Array,context:string,payload:unknown)=>createHmac('sha256',key).update(context+'\0').update(JSON.stringify(payload)).digest('hex');
const payload=(s:AccountAuthorityState)=>({format:s.format,installationId:s.installationId,ownerId:s.ownerId,accountId:s.accountId,user:s.user,
 revision:s.revision,epoch:s.epoch,authority:s.authority,phase:s.phase,operationId:s.operationId,activeGeneration:s.activeGeneration,stagedGeneration:s.stagedGeneration,nextGeneration:s.nextGeneration});
const cleanupPayload=(s:AccountCleanupItem)=>({installationId:s.installationId,ownerId:s.ownerId,accountId:s.accountId,revision:s.revision,generation:s.generation,operationId:s.operationId});
const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));

/**
 * Inactive K1 metadata port. Its caller owns authentication, service/mutation
 * leases, provider validation and external item validation/deletion. The supplied
 * owner store must already be original-key/marker authenticated. This component
 * never calls Keychain or selects runtime custody; all native activation is gated.
 */
export class AccountAuthorityJournal {
 private key:Buffer;
 private closed=false;
 private constructor(private db:Database,readonly installationId:string,key:Uint8Array,private owner:Pick<OwnerSecretStore,'ownerId'>){
  if(key.byteLength!==32||!installationIdentitySchema.safeParse(installationId).success)fail('invalid_input');
  this.key=Buffer.from(key);
 }
 private guard<T>(action:()=>T):T {
  if(this.closed)fail('recovery_required');
  try{
   const sync=this.db.query('PRAGMA synchronous').get() as {synchronous:number};
   if(sync.synchronous!==2&&sync.synchronous!==3)fail('recovery_required');
   const mode=this.db.query('PRAGMA journal_mode').get() as {journal_mode:string};
   if(!['delete','truncate','persist','wal'].includes(mode.journal_mode))fail('recovery_required');
   return action();
  }catch(error){if(error instanceof CustodyError)throw error;return fail('recovery_required');}
 }
 private binding(ownerId?:string):void {
  const authenticated=this.owner.ownerId();
  const row=this.db.query('SELECT install,owner FROM owner_state WHERE singleton=1').get() as {install:string;owner:string|null}|null;
  if(!row||row.install!==this.installationId||row.owner!==authenticated)fail('recovery_required');
  if(ownerId!==undefined&&(authenticated===null||authenticated!==ownerId))fail('denied');
 }
 /** Explicit stopped baseline preparation, never a missing-state open/reset. */
 static provision(db:Database,installationId:string,key:Uint8Array,owner:Pick<OwnerSecretStore,'ownerId'>):AccountAuthorityJournal {
  const store=new AccountAuthorityJournal(db,installationId,key,owner);
  try{return store.guard(()=>{
   db.transaction(()=>{
    store.binding();
    if(db.query("SELECT name FROM sqlite_master WHERE name IN ('account_custody_meta','account_custody_state','account_custody_cleanup')").get())fail('conflict');
    db.exec('CREATE TABLE account_custody_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),format INTEGER NOT NULL,installation TEXT NOT NULL); CREATE TABLE account_custody_state(owner TEXT NOT NULL,account TEXT NOT NULL,record TEXT NOT NULL,PRIMARY KEY(owner,account)); CREATE TABLE account_custody_cleanup(owner TEXT NOT NULL,account TEXT NOT NULL,revision INTEGER NOT NULL,generation INTEGER NOT NULL,record TEXT NOT NULL,PRIMARY KEY(owner,account,revision,generation))');
    db.query('INSERT INTO account_custody_meta VALUES(1,1,?)').run(installationId);
    const ownerId=owner.ownerId();
    if(ownerId!==null){
     const accounts=db.query('SELECT id FROM mail_accounts WHERE owner=? ORDER BY rowid').all(ownerId) as {id:string}[];
     for(const {id} of accounts)store.initialAccount(ownerId,id);
    }
   }).immediate();return store;
  });}catch(error){store.close();throw error;}
 }
 static open(db:Database,installationId:string,key:Uint8Array,owner:Pick<OwnerSecretStore,'ownerId'>):AccountAuthorityJournal {
  const store=new AccountAuthorityJournal(db,installationId,key,owner);
  try{return store.guard(()=>{
   store.binding();
   const meta=db.query('SELECT format,installation FROM account_custody_meta WHERE singleton=1').get() as {format:number;installation:string}|null;
   if(!meta||meta.format!==1||meta.installation!==installationId)fail('recovery_required');
   db.query('SELECT record FROM account_custody_state LIMIT 1').get();db.query('SELECT record FROM account_custody_cleanup LIMIT 1').get();
   return store;
  });}catch(error){store.close();throw error;}
 }
 private registry(ownerId:string,accountId:string){
  this.binding(ownerId);
  if(!uuid.safeParse(accountId).success)fail('invalid_input');
  const raw=this.db.query('SELECT id,user,secret,version FROM mail_accounts WHERE owner=? AND id=?').get(ownerId,accountId);
  if(!raw)fail('missing');return registrySchema.parse(raw);
 }
 private raw(ownerId:string,accountId:string):AccountAuthorityState {
  this.binding(ownerId);
  const row=this.db.query('SELECT record FROM account_custody_state WHERE owner=? AND account=?').get(ownerId,accountId) as {record:string}|null;
  if(!row)fail('missing');
  const state=stateSchema.parse(JSON.parse(row.record));
  if(state.installationId!==this.installationId||state.ownerId!==ownerId||state.accountId!==accountId||!equal(state.mac,sign(this.key,'icloud-account-custody-state-v1',payload(state))))fail('recovery_required');
  return Object.freeze(state);
 }
 private current(ownerId:string,accountId:string):AccountAuthorityState {
  const state=this.raw(ownerId,accountId),account=this.registry(ownerId,accountId);
  if(account.version!==state.revision)fail('conflict');
  if(account.user!==state.user||(state.authority==='sqlite')!==(account.secret!==null))fail('recovery_required');
  return state;
 }
 read(ownerId:string,accountId:string):AccountAuthorityState{return this.guard(()=>this.db.transaction(()=>this.current(ownerId,accountId))());}
 private write(next:Omit<AccountAuthorityState,'mac'>):AccountAuthorityState {
  const signed=stateSchema.parse({...next,mac:sign(this.key,'icloud-account-custody-state-v1',next)});
  const changed=this.db.query('INSERT INTO account_custody_state(owner,account,record) VALUES(?,?,?) ON CONFLICT(owner,account) DO UPDATE SET record=excluded.record').run(signed.ownerId,signed.accountId,JSON.stringify(signed));
  if(changed.changes!==1)fail('conflict');
  return Object.freeze(signed);
 }
 private next(state:AccountAuthorityState,changes:Partial<Omit<AccountAuthorityState,'mac'>>):AccountAuthorityState {
  if(!Number.isSafeInteger(state.epoch+1))fail('recovery_required');
  return this.write({...payload(state),...changes,epoch:state.epoch+1});
 }
 private initialAccount(ownerId:string,accountId:string):AccountAuthorityState {
   const account=this.registry(ownerId,accountId);
   return this.write({format:1,installationId:this.installationId,ownerId,accountId,user:account.user,revision:account.version,epoch:1,
    authority:account.secret===null?'none':'sqlite',phase:account.secret===null?'revoked':'sqlite_authoritative',operationId:null,activeGeneration:null,stagedGeneration:null,nextGeneration:1});
 }
 private expect(state:AccountAuthorityState,epoch:number,operationId?:string):void {
  if(state.epoch!==epoch||operationId!==undefined&&state.operationId!==operationId)fail('conflict');
 }
 beginCopy(ownerId:string,accountId:string,epoch:number,operationId:string):AccountAuthorityState {
  return this.guard(()=>this.db.transaction(()=>{
   if(!uuid.safeParse(operationId).success)fail('invalid_input');
   const state=this.current(ownerId,accountId);this.expect(state,epoch);
   if(state.phase!=='sqlite_authoritative'||!Number.isSafeInteger(state.nextGeneration+1))fail('conflict');
   return this.next(state,{phase:'copy_intent',operationId,stagedGeneration:state.nextGeneration,nextGeneration:state.nextGeneration+1});
  }).immediate());
 }
 markVerified(ownerId:string,accountId:string,epoch:number,operationId:string):AccountAuthorityState {
  return this.guard(()=>this.db.transaction(()=>{
   const state=this.current(ownerId,accountId);this.expect(state,epoch,operationId);
   if(state.phase!=='copy_intent')fail('conflict');return this.next(state,{phase:'keychain_verified'});
  }).immediate());
 }
 /** Caller must freshly validate the exact staged item before this transaction. */
 activate(ownerId:string,accountId:string,epoch:number,operationId:string):AccountAuthorityState {
  return this.guard(()=>this.db.transaction(()=>{
   const state=this.current(ownerId,accountId);this.expect(state,epoch,operationId);
   if(state.phase!=='keychain_verified')fail('conflict');
   const changed=this.db.query('UPDATE mail_accounts SET secret=NULL WHERE owner=? AND id=? AND version=? AND secret IS NOT NULL').run(ownerId,accountId,state.revision);
   if(changed.changes!==1)fail('conflict');
   // Custody-only cutover does not change revision, registry metadata, grants or
   // provider sessions. Pointer and ciphertext removal commit as one transaction.
   return this.next(state,{authority:'keychain',phase:'keychain_authoritative',activeGeneration:state.stagedGeneration,stagedGeneration:null});
  }).immediate());
 }
 readTarget(ownerId:string,accountId:string,expectedEpoch:number):AccountCustodyIdentity {
  return this.guard(()=>this.db.transaction(()=>{
   const state=this.current(ownerId,accountId);this.expect(state,expectedEpoch);
   if(state.phase==='revoked')fail('revoked');
   if(state.phase!=='keychain_authoritative'||state.activeGeneration===null)fail('recovery_required');
   return Object.freeze({installationId:this.installationId,ownerId,accountId,revision:state.revision,generation:state.activeGeneration});
  })());
 }
 private queue(state:AccountAuthorityState,generation:number,operationId:string):void {
  const item={installationId:this.installationId,ownerId:state.ownerId,accountId:state.accountId,revision:state.revision,generation,operationId};
  const signed={...item,mac:sign(this.key,'icloud-account-custody-cleanup-v1',item)};
  const changed=this.db.query('INSERT INTO account_custody_cleanup VALUES(?,?,?,?,?)').run(state.ownerId,state.accountId,state.revision,generation,JSON.stringify(signed));
  if(changed.changes!==1)fail('conflict');
 }
 /** Explicit reconciliation of a competing legacy SQLite rotation/revocation. */
 reconcileSqliteMutation(ownerId:string,accountId:string,expectedEpoch:number):AccountAuthorityState {
  return this.guard(()=>this.db.transaction(()=>{
   const state=this.raw(ownerId,accountId);this.expect(state,expectedEpoch);
   const account=this.registry(ownerId,accountId);
   if(state.authority!=='sqlite'||account.version<=state.revision||account.user!==state.user)fail('conflict');
   if(state.stagedGeneration!==null)this.queue(state,state.stagedGeneration,state.operationId!);
   return this.next(state,{revision:account.version,authority:account.secret===null?'none':'sqlite',phase:account.secret===null?'revoked':'sqlite_authoritative',operationId:null,activeGeneration:null,stagedGeneration:null});
  }).immediate());
 }
 revoke(ownerId:string,accountId:string,expectedEpoch:number,operationId:string):AccountAuthorityState {
  return this.guard(()=>this.db.transaction(()=>{
   if(!uuid.safeParse(operationId).success)fail('invalid_input');
   const state=this.current(ownerId,accountId);this.expect(state,expectedEpoch);
   if(state.phase==='revoked')fail('conflict');
   if(!Number.isSafeInteger(state.revision+1))fail('recovery_required');
   if(state.activeGeneration!==null)this.queue(state,state.activeGeneration,operationId);
   if(state.stagedGeneration!==null)this.queue(state,state.stagedGeneration,operationId);
   const changed=this.db.query('UPDATE mail_accounts SET secret=NULL,version=? WHERE owner=? AND id=? AND version=?').run(state.revision+1,ownerId,accountId,state.revision);
   if(changed.changes!==1)fail('conflict');
   const sessions=this.db.query('SELECT generation FROM provider_sessions WHERE owner=? AND account=?').all(ownerId,accountId) as {generation:number}[];
   if(sessions.some(row=>!Number.isSafeInteger(row.generation)||row.generation<1||!Number.isSafeInteger(row.generation+1)))fail('recovery_required');
   const invalidated=this.db.query('UPDATE provider_sessions SET secret=NULL,generation=generation+1 WHERE owner=? AND account=?').run(ownerId,accountId);
   if(invalidated.changes!==sessions.length)fail('conflict');
   return this.next(state,{revision:state.revision+1,authority:'none',phase:'revoked',operationId,activeGeneration:null,stagedGeneration:null});
  }).immediate());
 }
 markUnavailable(ownerId:string,accountId:string,expectedEpoch:number):AccountAuthorityState {
  return this.guard(()=>this.db.transaction(()=>{
   const state=this.current(ownerId,accountId);this.expect(state,expectedEpoch);
   if(state.phase!=='keychain_authoritative')fail('conflict');
   // Retain pointer/revision; locked/denied/missing is not revocation or fallback.
   return this.next(state,{phase:'recovery_required'});
  }).immediate());
 }
 private cleanup(ownerId:string,accountId:string):AccountCleanupItem[] {
  const current=this.current(ownerId,accountId);
  const rows=this.db.query('SELECT revision,generation,record FROM account_custody_cleanup WHERE owner=? AND account=? ORDER BY revision,generation LIMIT 2049').all(ownerId,accountId) as {revision:number;generation:number;record:string}[];
  if(rows.length>2048)fail('recovery_required');
  return rows.map(row=>{
   const item=cleanupSchema.parse(JSON.parse(row.record));
   if(item.installationId!==this.installationId||item.ownerId!==ownerId||item.accountId!==accountId||item.revision!==row.revision||item.generation!==row.generation||!equal(item.mac,sign(this.key,'icloud-account-custody-cleanup-v1',cleanupPayload(item))))fail('recovery_required');
   if(current.revision===item.revision&&(current.activeGeneration===item.generation||current.stagedGeneration===item.generation))fail('recovery_required');
   return Object.freeze(item);
  });
 }
 listCleanup(ownerId:string,accountId:string):readonly AccountCleanupItem[]{return this.guard(()=>this.db.transaction(()=>this.cleanup(ownerId,accountId))());}
 /** Only acknowledge after exact-item absence is freshly confirmed externally. */
 acknowledgeCleanup(ownerId:string,accountId:string,item:AccountCleanupItem):void {
  this.guard(()=>this.db.transaction(()=>{
   const state=this.current(ownerId,accountId);
   const found=this.cleanup(ownerId,accountId).find(row=>row.revision===item.revision&&row.generation===item.generation&&row.operationId===item.operationId&&row.mac===item.mac);
   if(!found)fail('conflict');
   if(state.revision===item.revision&&(state.activeGeneration===item.generation||state.stagedGeneration===item.generation))fail('recovery_required');
   const changed=this.db.query('DELETE FROM account_custody_cleanup WHERE owner=? AND account=? AND revision=? AND generation=?').run(ownerId,accountId,item.revision,item.generation);
   if(changed.changes!==1)fail('conflict');
  }).immediate());
 }
 close():void {this.key.fill(0);this.closed=true;}
}
