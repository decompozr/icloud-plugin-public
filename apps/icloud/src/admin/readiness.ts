import {z} from 'zod';
import {connectionSchema,recoverySchema,type RecoveryClient} from '../../../../modules/account/dist/index.js';
export {connectionSchema,clientImpactSchema,clientPreviewSchema,recoverySchema} from '../../../../modules/account/dist/index.js';
export type {AuthorizedConnection,ClientImpact,RecoveryClient,ConnectionsResponse} from '../../../../modules/account/dist/index.js';
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
 const tools:Record<string,string[]>={mail:['mail_list_mailboxes','mail_search','mail_read'],calendar:['calendar_query_events','calendar_get_event'],homekit:['homekit_read'],photos:['photos_query','photos_albums','photos_detail','photos_persons']};
 const verifiedAt=(tools[service]??[]).map(name=>reads[name]).filter((stamp):stamp is string=>!!stamp).sort().at(-1);
 const listedAt=service==='calendar'?reads.calendar_list_calendars:service==='homekit'?reads.homekit_automation_inventory:undefined;
 return {verifiedAt:service==='calendar'&&!listedAt?undefined:verifiedAt,listedAt};
}

export const connectionsRequestSchema=z.object({method:z.literal("GET"),path:z.literal("/icloud/admin/oauth-clients")}).strict();
export type ConnectionsRequest=z.infer<typeof connectionsRequestSchema>;
