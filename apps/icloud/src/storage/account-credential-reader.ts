import {z} from 'zod';
import {AccountAuthorityJournal,type AccountAuthorityState} from './account-authority.js';
import {CustodyError,type AccountPasswordCustody} from './custody-contract.js';
import type {OwnerSecretStore,MailAccount} from './owner-store.js';

export interface AccountCredentialState {
 readonly account:Readonly<MailAccount>;readonly ownerId:string;
 readonly revision:number;readonly custodyEpoch:number;
 readonly authority:AccountAuthorityState['authority'];
 readonly status:'active'|'migration_pending'|'revoked'|'recovery_required';
}
export interface AccountCredentialAccess {assertHeld():void}
const envelope=z.object({user:z.string().email(),appPassword:z.string().min(1)}).strict();
/** Inactive async read adapter. Caller owns owner/invocation authentication and
 * a cooperating runtime/maintenance lease, supplies an authenticated owner store
 * and enforces K0 before providing native custody. Metadata describes authority,
 * not Keychain reachability; missing/locked/denied reads never change accounts or
 * consult SQLite after native cutover. No production factory imports this yet.
 */
export class AccountCredentialReader {
 constructor(private journal:AccountAuthorityJournal,
  private source:Pick<OwnerSecretStore,'account'|'listAccounts'|'readAccountSecret'>,
  private native:AccountPasswordCustody,private access:AccountCredentialAccess){}
 private current(ownerId:string,accountId:string):AccountAuthorityState {
  this.access.assertHeld();return this.journal.read(ownerId,accountId);
 }
 private inspect(ownerId:string,accountId:string):AccountCredentialState {
  const state=this.current(ownerId,accountId),metadata=this.source.account(ownerId,accountId);
  if(metadata.id!==accountId||metadata.user!==state.user)throw new CustodyError('recovery_required');
  const pending=['copy_intent','keychain_verified','rotation_intent','rotation_verified','addition_intent','addition_verified'].includes(state.phase);
  return Object.freeze({account:Object.freeze({...metadata,credentialStored:state.authority!=='none'}),ownerId,
   revision:state.revision,custodyEpoch:state.epoch,authority:state.authority,
   status:state.phase==='revoked'?'revoked':state.phase==='recovery_required'?'recovery_required':pending?'migration_pending':'active'});
 }
 account(ownerId:string,accountId:string):AccountCredentialState {
  try{return this.inspect(ownerId,accountId);}catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
 listAccounts(ownerId:string):readonly AccountCredentialState[] {
  try{this.access.assertHeld();return Object.freeze(this.source.listAccounts(ownerId).map(account=>this.inspect(ownerId,account.id)));}
  catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
 /** A consistency fence, not owner/caller authentication. Use immediately
  * before provider dispatch or accepting readiness evidence/session results.
  */
 assertCurrent(snapshot:AccountCredentialState):void {
  try{
   const now=this.current(snapshot.ownerId,snapshot.account.id);
   if(now.epoch!==snapshot.custodyEpoch||now.revision!==snapshot.revision||now.authority!==snapshot.authority||now.user!==snapshot.account.user)throw new CustodyError('conflict');
   if(now.authority==='none')throw new CustodyError(now.phase==='revoked'?'revoked':'migration_pending');
   if(now.phase==='recovery_required')throw new CustodyError('recovery_required');
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
 /** Caller owns returned envelope buffer and must wipe it after use. SQLite
  * envelopes remain byte-identical; native raw passwords use the same provider
  * envelope fields without storing another password copy in SQLite. Parsed JS
  * strings cannot be securely erased. No silent provisioning/recovery occurs.
  */
 async read(ownerId:string,accountId:string):Promise<Readonly<{state:AccountCredentialState;bytes:Uint8Array}>> {
  let raw:Uint8Array|undefined,result:Buffer|undefined;
  try{
   const snapshot=this.account(ownerId,accountId);this.assertCurrent(snapshot);
   if(snapshot.authority==='sqlite'){
    raw=this.source.readAccountSecret(ownerId,accountId)??undefined;
    if(!raw||!raw.byteLength||raw.byteLength>65536)throw new CustodyError('recovery_required');
    const parsed=envelope.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw)));
    if(parsed.user!==snapshot.account.user)throw new CustodyError('recovery_required');
    result=Buffer.from(raw);
   }else{
    const identity=this.journal.readTarget(ownerId,accountId,snapshot.custodyEpoch);
    try{raw=await this.native.read(identity,{interaction:'prohibited'});}catch(error){this.assertCurrent(snapshot);throw error;}
    this.assertCurrent(snapshot);
    if(!raw.byteLength||raw.byteLength>65536)throw new CustodyError('recovery_required');
    const appPassword=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
    result=Buffer.from(JSON.stringify(envelope.parse({user:snapshot.account.user,appPassword})),'utf8');
   }
   this.assertCurrent(snapshot);
   const bytes=result;result=undefined;return Object.freeze({state:snapshot,bytes});
  }catch(error){
   if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');
  }finally{raw?.fill(0);result?.fill(0);}
 }
}
