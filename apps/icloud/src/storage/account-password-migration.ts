import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {AccountAuthorityJournal,type AccountAuthorityState} from './account-authority.js';
import {CustodyError,type AccountCustodyIdentity,type AccountPasswordCustody,type CustodyProvisioning} from './custody-contract.js';
import type {OwnerSecretStore} from './owner-store.js';

const credentialSchema=z.object({user:z.string().email(),appPassword:z.string().min(1)}).strict();
/** Inactive coordinator: caller authenticates owner, enforces K0/K2 gates and
 * holds exclusive stopped maintenance for the entire operation. This callback
 * must fail if that real lease is lost; it is not itself an operational lease.
 */
export interface AccountMigrationMaintenance {assertHeld():void}

/** One resumable step per call, never auto-overwrite or blind mutation retry.
 * No runtime/setup entry point imports this coordinator yet. Native ports are
 * injected; tests use synthetic memory only. Returned state contains no secret.
 */
export class AccountPasswordMigration {
 constructor(private journal:AccountAuthorityJournal,
  private source:Pick<OwnerSecretStore,'readAccountSecret'>,
  private native:AccountPasswordCustody&Pick<CustodyProvisioning,'addPassword'>,
  private maintenance:AccountMigrationMaintenance){}

 private state(ownerId:string,accountId:string,epoch:number,operationId?:string):AccountAuthorityState {
  try{
   this.maintenance.assertHeld();
   const state=this.journal.read(ownerId,accountId);
   if(state.epoch!==epoch||operationId!==undefined&&state.operationId!==operationId)throw new CustodyError('conflict');
   return state;
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 }
 private password(state:AccountAuthorityState):Uint8Array {
  let raw:Uint8Array|null=null,bytes:Buffer|undefined;
  try{
   raw=this.source.readAccountSecret(state.ownerId,state.accountId);
   if(!raw||!raw.byteLength||raw.byteLength>65536)throw new CustodyError('recovery_required');
   const decoded=credentialSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
   // Do not normalize/massage opaque credentials into a different identity.
   if(decoded.user!==state.user)throw new CustodyError('recovery_required');
   bytes=Buffer.from(decoded.appPassword,'utf8');
   // Refuse replacement of malformed Unicode with U+FFFD during encoding.
   if(bytes.toString('utf8')!==decoded.appPassword){bytes.fill(0);throw new CustodyError('recovery_required');}
   this.state(state.ownerId,state.accountId,state.epoch,state.operationId??undefined);
   return bytes;
  }catch(error){bytes?.fill(0);if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{raw?.fill(0);}
 }
 private identity(state:AccountAuthorityState):AccountCustodyIdentity {
  if(state.stagedGeneration===null)throw new CustodyError('conflict');
  return Object.freeze({installationId:state.installationId,ownerId:state.ownerId,accountId:state.accountId,
   revision:state.revision,generation:state.stagedGeneration});
 }
 /** Validate representability before allocating intent. Existing opaque/foreign
  * values need explicit remediation; no inferred password or account substitution.
  */
 begin(ownerId:string,accountId:string,epoch:number,operationId:string):AccountAuthorityState {
  const state=this.state(ownerId,accountId,epoch);
  if(state.phase!=='sqlite_authoritative')throw new CustodyError('conflict');
  const bytes=this.password(state);bytes.fill(0);
  return this.journal.beginCopy(ownerId,accountId,epoch,operationId);
 }
 /** Reads always prohibit interaction. Only initial creation may allow setup UI.
  * A successful add leaves copy_intent until another call freshly reads the item.
  * Lost add replies are reconciled by exact read on the next call, not repeat add.
  * Verified-item absence never causes recreation; cutover requires another fresh
  * exact comparison. Pointer/ciphertext removal remains the journal transaction.
  */
 async advance(ownerId:string,accountId:string,epoch:number,operationId:string,
  options:{interaction:'setup'|'prohibited'}):Promise<AccountAuthorityState> {
  let original:Uint8Array|undefined,observed:Uint8Array|undefined;
  try{
   const state=this.state(ownerId,accountId,epoch,operationId);
   if(state.phase!=='copy_intent'&&state.phase!=='keychain_verified')throw new CustodyError('conflict');
   const identity=this.identity(state);original=this.password(state);
   try{observed=await this.native.read(identity,{interaction:'prohibited'});}
   catch(error){
    this.state(ownerId,accountId,epoch,operationId);
    if(!(error instanceof CustodyError)||error.code!=='missing'||state.phase!=='copy_intent')throw error;
    await this.native.addPassword(identity,original,options);
    return this.state(ownerId,accountId,epoch,operationId);
   }
   this.state(ownerId,accountId,epoch,operationId);
   if(observed.byteLength!==original.byteLength||!timingSafeEqual(observed,original))throw new CustodyError('conflict');
   return state.phase==='copy_intent'?this.journal.markVerified(ownerId,accountId,epoch,operationId):this.journal.activate(ownerId,accountId,epoch,operationId);
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{original?.fill(0);observed?.fill(0);}
 }
}
