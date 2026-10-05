import {timingSafeEqual} from 'node:crypto';
import {AccountAuthorityJournal,type AccountAuthorityState} from './account-authority.js';
import {CustodyError,type AccountPasswordCustody,type CustodyProvisioning} from './custody-contract.js';
import type {AccountMigrationMaintenance} from './account-password-migration.js';

/** Inactive rotation coordinator. Caller authenticates owner, validates the
 * replacement through the provider, enforces K0/K2 and holds stopped maintenance.
 * Input is the raw UTF-8 app password, borrowed only for this call. A caller must
 * resupply it after interruption; the journal HMAC rejects different bytes.
 * No setup/runtime route selects this port or stores plaintext recovery input.
 */
export class AccountPasswordRotation {
 constructor(private journal:AccountAuthorityJournal,
  private native:AccountPasswordCustody&Pick<CustodyProvisioning,'addPassword'>,
  private maintenance:AccountMigrationMaintenance){}
 private state(ownerId:string,accountId:string,epoch:number,operationId?:string):AccountAuthorityState {
  this.maintenance.assertHeld();const state=this.journal.read(ownerId,accountId);
  if(state.epoch!==epoch||operationId!==undefined&&state.operationId!==operationId)throw new CustodyError('conflict');
  return state;
 }
 private copy(bytes:Uint8Array):Buffer {
  if(!bytes.byteLength||bytes.byteLength>65536)throw new CustodyError('invalid_input');
  const copy=Buffer.from(bytes);
  try{new TextDecoder('utf-8',{fatal:true}).decode(copy);return copy;}
  catch{copy.fill(0);throw new CustodyError('invalid_input');}
 }
 begin(ownerId:string,accountId:string,epoch:number,operationId:string,password:Uint8Array):AccountAuthorityState {
  let bytes:Buffer|undefined;
  try{
   this.state(ownerId,accountId,epoch);bytes=this.copy(password);
   return this.journal.beginRotation(ownerId,accountId,epoch,operationId,bytes);
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{bytes?.fill(0);}
 }
 /** One step: add, fresh verify, then fresh verify-and-commit. All reads prohibit
  * interaction; only creation may use the accepted setup ceremony. Lost creates
  * reconcile by exact read, never overwrite. Verified absence never recreates.
  */
 async advance(ownerId:string,accountId:string,epoch:number,operationId:string,password:Uint8Array,
  options:{interaction:'setup'|'prohibited'}):Promise<AccountAuthorityState> {
  let bytes:Buffer|undefined,observed:Uint8Array|undefined;
  try{
   const state=this.state(ownerId,accountId,epoch,operationId);bytes=this.copy(password);
   const identity=this.journal.rotationTarget(ownerId,accountId,epoch,operationId,bytes);
   try{observed=await this.native.read(identity,{interaction:'prohibited'});}
   catch(error){
    this.state(ownerId,accountId,epoch,operationId);
    if(!(error instanceof CustodyError)||error.code!=='missing'||state.phase!=='rotation_intent')throw error;
    await this.native.addPassword(identity,bytes,options);
    return this.state(ownerId,accountId,epoch,operationId);
   }
   this.state(ownerId,accountId,epoch,operationId);
   if(observed.byteLength!==bytes.byteLength||!timingSafeEqual(observed,bytes))throw new CustodyError('conflict');
   return state.phase==='rotation_intent'
    ?this.journal.markRotationVerified(ownerId,accountId,epoch,operationId,bytes)
    :this.journal.commitRotation(ownerId,accountId,epoch,operationId,bytes);
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{bytes?.fill(0);observed?.fill(0);}
 }
}
