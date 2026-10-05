import {timingSafeEqual} from 'node:crypto';
import {MasterAuthorityJournal,type AuthorityLease,type MasterAuthorityRecord} from './master-authority.js';
import {CustodyError,type MasterKeyCustody,type CustodyProvisioning} from './custody-contract.js';
import {MasterConsumerBaselineStore} from './master-consumer-baseline.js';

/** Administrative ports, not runtime reads. Caller supplies authenticated K0
 * policy and an exclusive stopped-maintenance lease in addition to the journal
 * lease. Keys returned by readOriginalFile are caller-owned. Validation borrows
 * the key and must cover every existing installation-bound crypto consumer;
 * a no-op callback is not production acceptance. Neither port is implemented here.
 */
export interface MasterMigrationInstallation {
 assertStoppedMaintenance():void;
 readOriginalFile():Promise<Uint8Array>;
 validateExistingState(key:Uint8Array):Promise<void>;
}

/** Inactive exact-key copy coordinator. It never provisions a baseline,
 * regenerates/rotates keys, releases/adopts interrupted locks, deletes the file,
 * or chooses runtime custody. Authority cutover is the final supported phase;
 * protected restore acceptance and file retirement are separate future steps.
 */
export class MasterKeyMigration {
 constructor(private journal:MasterAuthorityJournal,private installation:MasterMigrationInstallation,
  private native:MasterKeyCustody&Pick<CustodyProvisioning,'addMaster'>){}
 private guard(lease:AuthorityLease):void {
  this.installation.assertStoppedMaintenance();this.journal.assertLease(lease);
 }
 private current(lease:AuthorityLease,key:Uint8Array,generation:number):MasterAuthorityRecord {
  this.guard(lease);
  const inspection=this.journal.inspectRecovery(key,lease.operationId,{requiredAuthority:'file'}),state=inspection.committed;
  if(inspection.staged)throw new CustodyError('recovery_required');
  if(state.generation!==generation)throw new CustodyError('conflict');
  if(state.format===2){
   if(state.baseline?.phase!=='established')throw new CustodyError('conflict');
   new MasterConsumerBaselineStore(this.journal).read(key,{operationId:lease.operationId,minimumMasterGeneration:state.baseline.masterGeneration});
  }
  return state;
 }
 private preflight(lease:AuthorityLease):void {
  this.guard(lease);
  // Reject post-cutover calls before even requesting the retained file. This is
  // routing only; original-key authentication follows before any mutation.
  const discovered=this.journal.discover({requiredAuthority:'file'});
  if(!['file_authoritative','copy_intent','keychain_verified'].includes(discovered.phase))throw new CustodyError('conflict');
  if(discovered.format===2&&discovered.baseline?.phase!=='established')throw new CustodyError('conflict');
 }
 private exact(key:Uint8Array):void {if(key.byteLength!==32)throw new CustodyError('recovery_required');}
 async begin(lease:AuthorityLease,generation:number):Promise<MasterAuthorityRecord> {
  let original:Uint8Array|undefined;
  try{
   this.preflight(lease);original=await this.installation.readOriginalFile();this.exact(original);
   const state=this.current(lease,original,generation);
   if(state.phase!=='file_authoritative')throw new CustodyError('conflict');
   await this.installation.validateExistingState(original);this.current(lease,original,generation);
   return this.journal.advance(lease,original,generation,'copy_intent');
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{original?.fill(0);}
 }
 /** One step: initial absent item -> create-only (keep intent), fresh exact read
  * + validation -> verified, another fresh exact read + validation -> cutover.
  * All reads prohibit UI. Lost writes reconcile by readback on the next call.
  * A missing verified item never authorizes regeneration or recreation.
  */
 async advance(lease:AuthorityLease,generation:number,options:{interaction:'setup'|'prohibited'}):Promise<MasterAuthorityRecord> {
  let original:Uint8Array|undefined,observed:Uint8Array|undefined;
  try{
   this.preflight(lease);original=await this.installation.readOriginalFile();this.exact(original);
   const state=this.current(lease,original,generation);
   if(state.phase!=='copy_intent'&&state.phase!=='keychain_verified')throw new CustodyError('conflict');
   try{observed=await this.native.read(this.journal.installationId,{interaction:'prohibited'});}
   catch(error){
    this.current(lease,original,generation);
    if(!(error instanceof CustodyError)||error.code!=='missing'||state.phase!=='copy_intent')throw error;
    // Recheck bound consumers immediately before creating an item, including
    // resumed copy intents whose original validation belongs to another call.
    await this.installation.validateExistingState(original);this.current(lease,original,generation);
    await this.native.addMaster(this.journal.installationId,original,options);
    return this.current(lease,original,generation);
   }
   this.current(lease,original,generation);this.exact(observed);
   if(!timingSafeEqual(original,observed))throw new CustodyError('conflict');
   await this.installation.validateExistingState(observed);this.current(lease,original,generation);
   return this.journal.advance(lease,original,generation,state.phase==='copy_intent'?'keychain_verified':'keychain_authoritative');
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{original?.fill(0);observed?.fill(0);}
 }
}
