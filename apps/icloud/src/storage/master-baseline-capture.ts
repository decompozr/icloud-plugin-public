import type {Database} from 'bun:sqlite';
import {z} from 'zod';
import {InstallationAccess} from '../server/installation-access.js';
import {MasterAuthorityJournal,type AuthorityLease} from './master-authority.js';
import {MasterConsumerBaselineStore} from './master-consumer-baseline.js';
import {validateMasterConsumers,type MasterConsumerBaseline} from './master-consumer-validation.js';
import {SqliteOwnerStore} from './owner-store.js';
import {AccountAuthorityJournal} from './account-authority.js';
import {validateResourceClientCiphertexts} from '../auth/key-contexts.js';
import {SqliteOutboundLedger} from '../mail/storage/outbound-ledger.js';
import {SqliteCalendarLedger} from '../calendar/storage/ledger.js';
import {CustodyError} from './custody-contract.js';

const text=z.string().min(1).max(256),identity=z.object({ownerId:text,accountId:text}).strict();
const selectionSchema=z.object({ownerId:text.nullable(),ownerFormat:z.enum(['legacy-v1','accounts-v2']),
 requiredAuthRecordId:z.string().regex(/^resource-client-v2:[a-f0-9]{64}$/).nullable(),
 presence:z.object({auth:z.boolean(),mail:z.boolean(),calendar:z.boolean(),accountCustody:z.boolean()}).strict(),
 historicalAccountIdentities:z.array(identity).max(4095),
}).strict();
/** Trusted operator selection, not inferred from missing tables/configuration.
 * Historical namespaces require independently retained identity evidence. They
 * authorize validation of retained ciphertext, never account/session revival. */
export type MasterBaselineSelection=z.infer<typeof selectionSchema>;

/** Initial administrative capture+establishment only. No path opening, key read,
 * owner-store/auth construction, native port or fallback. Caller authenticates
 * selection and supplies safe existing handles; old/custom writers must already
 * be stopped. Every registry account (including revoked) is inventoried. Existing
 * format-2 intent/established history rejects capture; resume consumes the exact
 * retained record through MasterConsumerBaselineStore instead. */
export function captureAndEstablishMasterBaseline(options:{journal:MasterAuthorityJournal;lease:AuthorityLease;access:InstallationAccess;masterKey:Uint8Array;minimumMasterGeneration:number;ownerDatabase:Database;authDatabase:Database;markerPath:string;selection:MasterBaselineSelection}):MasterConsumerBaseline {
 try{
  const {journal,lease,access,masterKey,ownerDatabase,authDatabase,markerPath}=options;
  const assertStoppedMaintenance=()=>{access.assertStoppedMaintenanceFor(journal.directory);journal.assertLease(lease);};
  assertStoppedMaintenance();
  if(!Number.isSafeInteger(options.minimumMasterGeneration)||options.minimumMasterGeneration<1)throw new CustodyError('invalid_input');
  const expectation={requiredAuthority:'file' as const,minimumGeneration:options.minimumMasterGeneration};
  const inspection=journal.inspectRecovery(masterKey,lease.operationId,expectation);
  if(inspection.staged||inspection.committed.format!==1||inspection.committed.phase!=='file_authoritative')throw new CustodyError('conflict');
  const selected=selectionSchema.parse(options.selection);
  if(selected.presence.auth!==(selected.requiredAuthRecordId!==null))throw new CustodyError('invalid_input');
  const stores={ownerDatabase,authDatabase,markerPath,assertStoppedMaintenance};
  const baseline=ownerDatabase.transaction(()=>authDatabase.transaction(()=>{
   const owner=SqliteOwnerStore.validateExistingCiphertexts({...stores,masterKey,installationId:journal.installationId,ownerId:selected.ownerId,ownerFormat:selected.ownerFormat,database:ownerDatabase});
   const identities=new Map<string,z.infer<typeof identity>>();
   if(selected.ownerFormat==='accounts-v2'){
    for(const raw of ownerDatabase.query('SELECT owner,id FROM mail_accounts ORDER BY id').all()){
     const account=z.object({owner:text,id:z.string().uuid()}).strict().parse(raw);
     const value={ownerId:account.owner,accountId:account.id};identities.set(JSON.stringify([value.ownerId,value.accountId]),value);
    }
   }
   for(const historical of selected.historicalAccountIdentities){
    if(historical.ownerId!==selected.ownerId)throw new CustodyError('invalid_input');
    identities.set(JSON.stringify([historical.ownerId,historical.accountId]),historical);
   }
   if(identities.size>4095)throw new CustodyError('invalid_input');
   const calendarAccountIdentities=[...identities.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,value])=>value);
   const mailOwnerNamespaces=[...(selected.ownerId===null?[]:[selected.ownerId]),...calendarAccountIdentities.map(value=>JSON.stringify([value.ownerId,value.accountId]))];
   const calendarPolicyOwners=selected.ownerId===null?[]:[selected.ownerId];
   const expected={owner,
    auth:selected.presence.auth?validateResourceClientCiphertexts({database:authDatabase,masterKey,requiredRecordId:selected.requiredAuthRecordId!}):null,
    mail:selected.presence.mail?SqliteOutboundLedger.validateExistingReceipts({database:authDatabase,masterKey,allowedOwnerNamespaces:mailOwnerNamespaces}):null,
    calendar:selected.presence.calendar?SqliteCalendarLedger.validateExistingPayloads({database:authDatabase,masterKey,policyOwners:calendarPolicyOwners,accountIdentities:calendarAccountIdentities}):null,
    accountCustody:selected.presence.accountCustody?AccountAuthorityJournal.validateExistingRecords({database:ownerDatabase,installationId:journal.installationId,masterKey,ownerId:selected.ownerId}):null};
   const captured={installationId:journal.installationId,ownerId:selected.ownerId,ownerFormat:selected.ownerFormat,requiredAuthRecordId:selected.requiredAuthRecordId,mailOwnerNamespaces,calendarPolicyOwners,calendarAccountIdentities,expected};
   // Explicit presence and wrong-database/partial-schema checks also apply to
   // capture; a missing table is never interpreted as an absent consumer.
   validateMasterConsumers({...stores,masterKey,baseline:captured});return captured;
  })())();
  assertStoppedMaintenance();
  if(JSON.stringify(journal.verify(masterKey,expectation))!==JSON.stringify(inspection.committed))throw new CustodyError('conflict');
  return new MasterConsumerBaselineStore(journal).create(lease,masterKey,baseline,stores);
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
}
