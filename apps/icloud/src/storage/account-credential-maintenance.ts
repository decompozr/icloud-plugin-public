import {z} from 'zod';
import {AccountAuthorityJournal,type AccountAuthorityState} from './account-authority.js';
import {AccountPasswordAddition} from './account-password-addition.js';
import {AccountPasswordRotation} from './account-password-rotation.js';
import type {AccountMigrationMaintenance} from './account-password-migration.js';
import type {OwnerSecretStore} from './owner-store.js';
import {CustodyError,type AccountPasswordCustody,type CustodyProvisioning} from './custody-contract.js';

export class CredentialValidationError extends Error {
 constructor(){super('provider_validation_failed');this.name='CredentialValidationError';}
}

/** Inactive administrative adapter. Caller authenticates the owner, enforces
 * K0/K2, and holds stopped maintenance throughout validation and native steps.
 * No HTTP route selects this adapter. Intents require transient password
 * resupply after interruption; neither validation results nor secrets persist.
 */
export class AccountCredentialMaintenance {
 constructor(private journal:AccountAuthorityJournal,
  private owner:Pick<OwnerSecretStore,'ownerId'|'listAccounts'>,
  private native:AccountPasswordCustody&Pick<CustodyProvisioning,'addPassword'>,
  private maintenance:AccountMigrationMaintenance,
  private validateCredential:(credential:Readonly<{user:string;appPassword:string}>)=>Promise<void>){}
 private addition(ownerId:string):AccountPasswordAddition {
  return new AccountPasswordAddition(this.journal,this.native,{assertHeld:()=>this.held(ownerId)});
 }
 private rotation(ownerId:string):AccountPasswordRotation {
  return new AccountPasswordRotation(this.journal,this.native,{assertHeld:()=>this.held(ownerId)});
 }
 private held(ownerId:string):void {
  this.maintenance.assertHeld();if(this.owner.ownerId()!==ownerId)throw new CustodyError('denied');
 }
 private state(ownerId:string,accountId:string,epoch:number):AccountAuthorityState {
  this.held(ownerId);const state=this.journal.read(ownerId,accountId);
  if(state.epoch!==epoch)throw new CustodyError('conflict');return state;
 }
 private copy(password:Uint8Array):Buffer {
  if(!password.byteLength||password.byteLength>65536)throw new CustodyError('invalid_input');
  const bytes=Buffer.from(password);
  try{new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);return bytes;}
  catch{bytes.fill(0);throw new CustodyError('invalid_input');}
 }
 private async validate(ownerId:string,user:string,password:Uint8Array):Promise<void> {
  this.held(ownerId);
  // JS strings are transient but cannot be securely erased.
  const credential=Object.freeze({user,appPassword:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(password)});
  try{await this.validateCredential(credential);}catch{throw new CredentialValidationError();}
  this.held(ownerId);
 }
 private error(error:unknown):never {
  if(error instanceof CustodyError||error instanceof CredentialValidationError)throw error;
  throw new CustodyError('recovery_required');
 }
 async beginRotation(ownerId:string,accountId:string,epoch:number,operationId:string,password:Uint8Array):Promise<AccountAuthorityState> {
  let bytes:Buffer|undefined;
  try{
   const state=this.state(ownerId,accountId,epoch);
   if(state.phase!=='keychain_authoritative')throw new CustodyError('conflict');
   if(!z.string().uuid().safeParse(operationId).success)throw new CustodyError('invalid_input');
   bytes=this.copy(password);await this.validate(ownerId,state.user,bytes);
   this.state(ownerId,accountId,epoch);
   return this.rotation(ownerId).begin(ownerId,accountId,epoch,operationId,bytes);
  }catch(error){return this.error(error);}finally{bytes?.fill(0);}
 }
 async beginAddition(ownerId:string,input:{user:string;label?:string;operationId:string;password:Uint8Array;reconnect?:{accountId:string;epoch:number}}):Promise<AccountAuthorityState> {
  let bytes:Buffer|undefined;
  try{
   this.held(ownerId);
   const parsed=z.object({user:z.string().trim().toLowerCase().email().max(320),label:z.string().trim().max(320).optional(),operationId:z.string().uuid(),reconnect:z.object({accountId:z.string().uuid(),epoch:z.number().int().nonnegative().safe()}).optional()}).safeParse(input);
   if(!parsed.success)throw new CustodyError('invalid_input');
   // Copy all borrowed operation metadata as well as bytes before awaiting.
   const metadata=parsed.data;
   const existing=this.owner.listAccounts(ownerId).find(account=>account.user.trim().toLowerCase()===metadata.user);
   if(existing){
    if(metadata.reconnect?.accountId!==existing.id)throw new CustodyError('conflict');
    if(this.state(ownerId,existing.id,metadata.reconnect.epoch).phase!=='revoked')throw new CustodyError('conflict');
   }else if(metadata.reconnect)throw new CustodyError('conflict');
   bytes=this.copy(input.password);await this.validate(ownerId,metadata.user,bytes);
   return this.addition(ownerId).begin(ownerId,{...metadata,password:bytes});
  }catch(error){return this.error(error);}finally{bytes?.fill(0);}
 }
 /** One native step only; recovery resupplies exact HMAC-bound bytes without
  * rerunning provider validation or creating another intent/account identity.
  */
 async advance(kind:'addition'|'rotation',ownerId:string,accountId:string,epoch:number,operationId:string,password:Uint8Array,options:{interaction:'setup'|'prohibited'}):Promise<AccountAuthorityState> {
  try{
   this.held(ownerId);if(kind!=='addition'&&kind!=='rotation')throw new CustodyError('invalid_input');
   const interaction=z.enum(['setup','prohibited']).safeParse(options.interaction);
   if(!interaction.success)throw new CustodyError('invalid_input');
   const result=await this[kind](ownerId).advance(ownerId,accountId,epoch,operationId,password,{interaction:interaction.data});
   this.held(ownerId);return result;
  }catch(error){return this.error(error);}
 }
 /** Local tombstone/session invalidation plus exact pending cleanup. Item
  * deletion is a separate reconciled cleanup step, never Apple revocation.
  */
 revoke(ownerId:string,accountId:string,epoch:number,operationId:string):AccountAuthorityState {
  try{this.state(ownerId,accountId,epoch);return this.journal.revoke(ownerId,accountId,epoch,operationId);}
  catch(error){return this.error(error);}
 }
}
