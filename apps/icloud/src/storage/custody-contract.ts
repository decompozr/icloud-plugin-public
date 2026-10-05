import {z} from 'zod';

/** Server-only contracts. No native backend or runtime activation is selected here. */
export type CustodyFailureCode = 'invalid_input'|'locked'|'denied'|'missing'|'migration_pending'|'revoked'|'conflict'|'recovery_required'|'outcome_unknown';
export class CustodyError extends Error {
 constructor(readonly code:CustodyFailureCode){super(code);this.name='CustodyError';}
}
export const installationIdentitySchema=z.string().uuid();
export const accountCustodyIdentitySchema=z.object({
 installationId:installationIdentitySchema,ownerId:z.string().min(1).max(2048),
 accountId:z.string().uuid(),revision:z.number().int().positive().safe(),
 generation:z.number().int().positive().safe(),
}).strict();
export type AccountCustodyIdentity=z.infer<typeof accountCustodyIdentitySchema>;
export interface CustodySelector {readonly service:string;readonly account:string}
const service='org.decompozr.icloud-plugin.custody.v1';
/** Exact, fixed namespaces; neither caller-controlled services nor prefix sweeps. */
export function masterKeySelector(installationId:string):CustodySelector {
 const parsed=installationIdentitySchema.safeParse(installationId);if(!parsed.success)throw new CustodyError('invalid_input');
 return Object.freeze({service,account:JSON.stringify(['master',parsed.data])});
}
export function accountPasswordSelector(identity:AccountCustodyIdentity):CustodySelector {
 const parsed=accountCustodyIdentitySchema.safeParse(identity);if(!parsed.success)throw new CustodyError('invalid_input');
 const id=parsed.data;
 return Object.freeze({service,account:JSON.stringify(['account',id.installationId,id.ownerId,id.accountId,id.revision,id.generation])});
}
export interface RuntimeCustodyRead {readonly interaction:'prohibited'}
/** Implementations must not create items, authorize UI, or fall back on read. */
export interface MasterKeyCustody {
 read(installationId:string,options:RuntimeCustodyRead):Promise<Uint8Array>;
}
export interface AccountPasswordCustody {
 read(identity:AccountCustodyIdentity,options:RuntimeCustodyRead):Promise<Uint8Array>;
}
/** Separate administrative view; identity/consent/revision validation belongs to its caller. */
export interface CustodyProvisioning {
 addMaster(installationId:string,bytes:Uint8Array,options:{interaction:'setup'|'prohibited'}):Promise<void>;
 addPassword(identity:AccountCustodyIdentity,bytes:Uint8Array,options:{interaction:'setup'|'prohibited'}):Promise<void>;
 deleteMaster(installationId:string,options:RuntimeCustodyRead):Promise<void>;
 deletePassword(identity:AccountCustodyIdentity,options:RuntimeCustodyRead):Promise<void>;
}
