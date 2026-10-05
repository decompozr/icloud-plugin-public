import {AccountAuthorityJournal,type AccountCleanupItem} from './account-authority.js';
import {CustodyError,type AccountPasswordCustody,type CustodyProvisioning} from './custody-contract.js';
import type {AccountMigrationMaintenance} from './account-password-migration.js';

/** Inactive exact-item reconciliation for cancellation/revocation cleanup.
 * Caller authenticates maintenance and enforces K0 before supplying a native
 * backend. A delete reply never acknowledges cleanup: a separate fresh read
 * must confirm absence. No prefix sweeps, secret comparison, or automatic retry.
 */
export class AccountPasswordCleanup {
 constructor(private journal:AccountAuthorityJournal,
  private native:AccountPasswordCustody&Pick<CustodyProvisioning,'deletePassword'>,
  private maintenance:AccountMigrationMaintenance){}
 private current(ownerId:string,accountId:string,epoch:number,item:AccountCleanupItem):AccountCleanupItem {
  this.maintenance.assertHeld();
  if(this.journal.read(ownerId,accountId).epoch!==epoch)throw new CustodyError('conflict');
  const found=this.journal.listCleanup(ownerId,accountId).find(row=>row.mac===item.mac&&row.operationId===item.operationId&&row.revision===item.revision&&row.generation===item.generation);
  if(!found)throw new CustodyError('conflict');
  return found;
 }
 /** Returns pending after deletion, complete only after confirmed absence.
  * Locked/denied/unknown results leave the durable cleanup evidence intact.
  */
 async advance(ownerId:string,accountId:string,epoch:number,item:AccountCleanupItem):Promise<'pending'|'complete'> {
  let observed:Uint8Array|undefined;
  try{
   const validated=this.current(ownerId,accountId,epoch,item);
   const identity=Object.freeze({installationId:validated.installationId,ownerId:validated.ownerId,accountId:validated.accountId,revision:validated.revision,generation:validated.generation});
   try{observed=await this.native.read(identity,{interaction:'prohibited'});}
   catch(error){
    this.current(ownerId,accountId,epoch,validated);
    if(!(error instanceof CustodyError)||error.code!=='missing')throw error;
    this.journal.acknowledgeCleanup(ownerId,accountId,validated);
    return 'complete';
   }
   this.current(ownerId,accountId,epoch,validated);
   await this.native.deletePassword(identity,{interaction:'prohibited'});
   this.current(ownerId,accountId,epoch,validated);
   return 'pending';
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{observed?.fill(0);}
 }
}
