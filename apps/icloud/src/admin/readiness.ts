import {z} from 'zod';
export const connectionSchema=z.object({clientId:z.string(),name:z.string().nullable(),accountId:z.string(),grantedScopes:z.array(z.string()),authorizedAt:z.string().datetime(),expiresAt:z.string().datetime()});
export type AuthorizedConnection=z.infer<typeof connectionSchema>;
export const clientImpactSchema=z.object({clientId:z.string(),name:z.string().nullable(),action:z.enum(['revoke','remove']),accountIds:z.array(z.string()),accessTokens:z.number().int().nonnegative(),refreshTokens:z.number().int().nonnegative(),consents:z.number().int().nonnegative(),authorizationCodes:z.number().int().nonnegative(),registrationRemoved:z.boolean(),accountsPreserved:z.literal(true),removable:z.boolean()});
export const clientPreviewSchema=z.object({impact:clientImpactSchema,confirmation:z.string()});
export type ClientImpact=z.infer<typeof clientImpactSchema>;
export const recoverySchema=z.object({clients:z.array(z.object({clientId:z.string(),name:z.string().nullable(),registeredScopes:z.array(z.string()),recovery:z.enum(['explicit_client_update_then_consent','new_client_registration_then_consent','fresh_consent_and_tool_refresh'])})),connections:z.array(connectionSchema).optional()});
export type RecoveryClient=z.infer<typeof recoverySchema>['clients'][number];
/** Registration is a ceiling, never evidence of account-bound consent or a read. */
export function readiness(policy:Record<string,boolean>|null|undefined,service:string,client?:RecoveryClient){
 return {configured:policy===null||policy===undefined?'configuredUnknown':policy.read?'configuredOn':'configuredOff',authorization:'unknownAuthorization',tested:'unknownRead',recovery:!client?'recoverySelect':client.registeredScopes.includes(service+'.read')?'recoveryConsent':client.recovery==='explicit_client_update_then_consent'?'recoveryOwner':'recoveryNew'} as const;
}

export const evidenceSchema=z.object({accountId:z.string(),clientId:z.string(),service:z.string(),authorizedAt:z.string().datetime(),expiresAt:z.string().datetime(),reads:z.record(z.string().datetime())});
export type ReadEvidence=z.infer<typeof evidenceSchema>;
export function matchingEvidence(rows:ReadEvidence[],accountId:string,clientId:string,service:string,now=Date.now()){return rows.find(r=>r.accountId===accountId&&r.clientId===clientId&&r.service===service&&Date.parse(r.expiresAt)>now);}
