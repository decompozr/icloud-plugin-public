import {z} from 'zod';
export const connectionSchema=z.object({clientId:z.string(),name:z.string().nullable(),accountId:z.string(),grantedScopes:z.array(z.string()),authorizedAt:z.string().datetime(),expiresAt:z.string().datetime()});
export type AuthorizedConnection=z.infer<typeof connectionSchema>;
export const clientImpactSchema=z.object({clientId:z.string(),name:z.string().nullable(),action:z.enum(['revoke','remove','upgrade']),accountIds:z.array(z.string()),accessTokens:z.number().int().nonnegative(),refreshTokens:z.number().int().nonnegative(),consents:z.number().int().nonnegative(),authorizationCodes:z.number().int().nonnegative(),registrationRemoved:z.boolean(),accountsPreserved:z.literal(true),removable:z.boolean(),registeredScopes:z.array(z.string()).optional(),additionalScopes:z.array(z.string()).optional(),upgradable:z.boolean().optional()});
export const clientPreviewSchema=z.object({impact:clientImpactSchema,confirmation:z.string()});
export type ClientImpact=z.infer<typeof clientImpactSchema>;
export const recoverySchema=z.object({enabledScopes:z.array(z.string()).optional(),existingGrantsChanged:z.literal(false).optional(),clients:z.array(z.object({clientId:z.string(),name:z.string().nullable(),registeredScopes:z.array(z.string()),missingEnabledScopes:z.array(z.string()).optional(),upgradeAvailable:z.boolean().optional(),recovery:z.enum(['explicit_client_update_then_consent','new_client_registration_then_consent','fresh_consent_and_tool_refresh'])})),connections:z.array(connectionSchema).optional()});
export type RecoveryClient=z.infer<typeof recoverySchema>['clients'][number];
/** Registration is a ceiling, never evidence of account-bound consent or a read. */
export function readiness(policy:Record<string,boolean>|null|undefined,service:string,client?:RecoveryClient){
 return {configured:policy===null||policy===undefined?'configuredUnknown':policy.read?'configuredOn':'configuredOff',authorization:'unknownAuthorization',tested:'unknownRead',recovery:!client?'recoverySelect':client.registeredScopes.includes(service+'.read')?'recoveryConsent':client.recovery==='explicit_client_update_then_consent'?'recoveryOwner':'recoveryNew'} as const;
}

export const evidenceSchema=z.object({accountId:z.string(),clientId:z.string(),service:z.string(),authorizedAt:z.string().datetime(),expiresAt:z.string().datetime(),reads:z.record(z.string().datetime())});
export type ReadEvidence=z.infer<typeof evidenceSchema>;
export function matchingEvidence(rows:ReadEvidence[],accountId:string,clientId:string,service:string,now=Date.now()){return rows.find(r=>r.accountId===accountId&&r.clientId===clientId&&r.service===service&&Date.parse(r.expiresAt)>now);}

/** Diagnose composed capabilities, including installed modules with read disabled. */
export function readinessServices(modules:Record<string,Record<string,boolean>>|undefined):string[]{
 return ['mail',...Object.keys(modules??{}).filter(id=>id!=='mail')];
}
/** Health, catalog discovery and review decisions do not establish a provider read. */
export function observedProviderRead(service:string,reads:Record<string,string>):{verifiedAt?:string;listedAt?:string}{
 const tools:Record<string,string[]>={mail:['mail_list_mailboxes','mail_search','mail_read'],calendar:['calendar_query_events','calendar_get_event'],photos:['photos_query','photos_albums','photos_detail','photos_persons']};
 const verifiedAt=(tools[service]??[]).map(name=>reads[name]).filter((stamp):stamp is string=>!!stamp).sort().at(-1);
 const listedAt=service==='calendar'?reads.calendar_list_calendars:undefined;
 return {verifiedAt:service==='calendar'&&!listedAt?undefined:verifiedAt,listedAt};
}

export const connectionsRequestSchema=z.object({method:z.literal("GET"),path:z.literal("/icloud/admin/oauth-clients")}).strict();
export type ConnectionsRequest=z.infer<typeof connectionsRequestSchema>;
export type ConnectionsResponse=z.infer<typeof recoverySchema>;
