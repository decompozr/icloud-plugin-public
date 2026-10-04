import {z} from 'zod';

export const serviceEvidenceSchema=z.object({
 availability:z.enum(['available','unavailable','unknown']),
 reason:z.enum(['verified','service_not_provisioned','probe_failed','not_checked','legacy_mail','credential_revoked']),
 checkedAt:z.string().datetime().nullable(),
}).strict();
export const capabilitySchema=serviceEvidenceSchema.extend({enabled:z.boolean()});
export type ServiceEvidence=z.infer<typeof serviceEvidenceSchema>;
export type AccountCapability=z.infer<typeof capabilitySchema>;
export type ProbeEvidence=Record<string,ServiceEvidence>;
export interface RegisteredService {id:string;title:string;probe(credential:{user:string;appPassword:string}):Promise<void>}
/** Only a provider's affirmative service-not-provisioned response may use this classification. */
export class ServiceUnavailableError extends Error {}
export class CredentialProbeError extends Error {
 constructor(readonly services:ProbeEvidence){super('No registered service verified the credential');}
}
export function createCredentialProbe(services:readonly RegisteredService[]){
 if(!services.length||new Set(services.map(service=>service.id)).size!==services.length)throw Error('Invalid service registry');
 return async(credential:{user:string;appPassword:string}):Promise<ProbeEvidence>=>{
  const results=await Promise.all(services.map(async service=>{
   let availability:ServiceEvidence['availability']='available',reason:ServiceEvidence['reason']='verified';
   try{await service.probe(credential);}catch(error){availability=error instanceof ServiceUnavailableError?'unavailable':'unknown';reason=error instanceof ServiceUnavailableError?'service_not_provisioned':'probe_failed';}
   return [service.id,{availability,reason,checkedAt:new Date().toISOString()}] as const;
  }));
  const evidence=Object.fromEntries(results);
  if(!Object.values(evidence).some(value=>value.availability==='available'))throw new CredentialProbeError(evidence);
  return evidence;
 };
}
export function serviceEligible(account:{credentialStored:boolean;services?:Record<string,AccountCapability>},service:string):boolean {
 const state=account.services?.[service];
 return account.credentialStored&&state?.availability==='available'&&state.enabled;
}
