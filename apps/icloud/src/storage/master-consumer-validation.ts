import type {Database} from 'bun:sqlite';
import {SqliteOwnerStore,type OwnerCiphertextValidation} from './owner-store.js';
import {AccountAuthorityJournal} from './account-authority.js';
import {validateResourceClientCiphertexts} from '../auth/key-contexts.js';
import {SqliteOutboundLedger} from '../mail/storage/outbound-ledger.js';
import {SqliteCalendarLedger,type CalendarLedgerIdentity} from '../calendar/storage/ledger.js';
import {CustodyError} from './custody-contract.js';

type AuthCounts=Readonly<{format:1;records:number}>;
type MailCounts=Readonly<{format:1;records:number;encrypted:number;pending:number}>;
type CalendarCounts=Readonly<{format:1;policies:number;operations:number;sync:number}>;
type CustodyCounts=Readonly<{format:1;records:number;cleanup:number}>;
export interface MasterConsumerReport {
 readonly owner:OwnerCiphertextValidation;
 readonly auth:AuthCounts|null;readonly mail:MailCounts|null;
 readonly calendar:CalendarCounts|null;readonly accountCustody:CustodyCounts|null;
}
/** Authenticated stopped-snapshot baseline, never inferred from current missing
 * tables or generated automatically by this validator. Count comparison detects
 * omissions, not same-count substitution/full historical rollback. */
export interface MasterConsumerBaseline {
 readonly installationId:string;readonly ownerId:string|null;
 readonly ownerFormat:'legacy-v1'|'accounts-v2';
 readonly requiredAuthRecordId:string|null;
 readonly mailOwnerNamespaces:readonly string[];
 readonly calendarPolicyOwners:readonly string[];
 readonly calendarAccountIdentities:readonly CalendarLedgerIdentity[];
 readonly expected:MasterConsumerReport;
}
const ownerTables=['owner_state','mail_accounts','provider_sessions'];
const custodyTables=['account_custody_meta','account_custody_state','account_custody_cleanup'];
const authTables=['plugin_auth_private','icloudOutbound','calendar_ledger'];
function tableNames(db:Database):Set<string>{return new Set((db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));}
function presence(names:Set<string>,tables:readonly string[],required:boolean):void {
 if(tables.some(table=>names.has(table)!==required))throw new CustodyError('recovery_required');
}
function sameCounts(actual:object|null,expected:object|null):void {
 if(actual===null||expected===null){if(actual!==expected)throw new CustodyError('recovery_required');return;}
 const a=actual as Record<string,number>,b=expected as Record<string,number>;
 if(Object.keys(a).length!==Object.keys(b).length||Object.entries(a).some(([key,value])=>!Number.isSafeInteger(b[key])||b[key]!<0||b[key]!==value))throw new CustodyError('recovery_required');
}
/** Inactive administrative composition. Caller supplies safe existing handles,
 * authenticated baseline and real cross-store stopped-maintenance exclusion.
 * Nested read snapshots do not themselves establish a shared SQLite transaction
 * or exclude file/other-process mutations. Master authority HMAC/lease validation
 * stays in MasterKeyMigration; this borrows the exact key, does not select custody
 * and never reads Keychain, starts auth, changes schema or closes either DB.
 */
export function validateMasterConsumers(options:{ownerDatabase:Database;authDatabase:Database;markerPath:string;masterKey:Uint8Array;baseline:MasterConsumerBaseline;assertStoppedMaintenance:()=>void}):MasterConsumerReport {
 try{
  options.assertStoppedMaintenance();const baseline=options.baseline;
  const report=options.ownerDatabase.transaction(()=>options.authDatabase.transaction(()=>{
   const ownerNames=tableNames(options.ownerDatabase),authNames=tableNames(options.authDatabase);
   presence(ownerNames,authTables,false);presence(authNames,[...ownerTables,...custodyTables],false);
   presence(ownerNames,custodyTables,baseline.expected.accountCustody!==null);
   presence(authNames,['plugin_auth_private'],baseline.expected.auth!==null);
   presence(authNames,['icloudOutbound'],baseline.expected.mail!==null);
   presence(authNames,['calendar_ledger'],baseline.expected.calendar!==null);
   if((baseline.expected.auth===null)!==(baseline.requiredAuthRecordId===null))throw new CustodyError('invalid_input');
   const owner=SqliteOwnerStore.validateExistingCiphertexts({database:options.ownerDatabase,markerPath:options.markerPath,masterKey:options.masterKey,installationId:baseline.installationId,ownerId:baseline.ownerId,ownerFormat:baseline.ownerFormat});
   const auth=baseline.expected.auth===null?null:validateResourceClientCiphertexts({database:options.authDatabase,masterKey:options.masterKey,requiredRecordId:baseline.requiredAuthRecordId!});
   const mail=baseline.expected.mail===null?null:SqliteOutboundLedger.validateExistingReceipts({database:options.authDatabase,masterKey:options.masterKey,allowedOwnerNamespaces:baseline.mailOwnerNamespaces});
   const calendar=baseline.expected.calendar===null?null:SqliteCalendarLedger.validateExistingPayloads({database:options.authDatabase,masterKey:options.masterKey,policyOwners:baseline.calendarPolicyOwners,accountIdentities:baseline.calendarAccountIdentities});
   const accountCustody=baseline.expected.accountCustody===null?null:AccountAuthorityJournal.validateExistingRecords({database:options.ownerDatabase,installationId:baseline.installationId,masterKey:options.masterKey,ownerId:baseline.ownerId});
   const result=Object.freeze({owner,auth,mail,calendar,accountCustody});
   for(const key of ['owner','auth','mail','calendar','accountCustody'] as const)sameCounts(result[key],baseline.expected[key]);
   return result;
  })())();
  options.assertStoppedMaintenance();return report;
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
}
