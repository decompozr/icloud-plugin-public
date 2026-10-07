import type {Principal} from '../auth/verify.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
export interface EvidenceRow {accountId:string;clientId:string;service:string;authorizedAt:string;expiresAt:string;reads:Record<string,string>}
interface Stored extends EvidenceRow {ownerId:string;stamp:string}
const readTools:Record<string,string>={homekit_automation_inventory:'homekit',homekit_read:'homekit',mail_list_mailboxes:'mail',mail_search:'mail',mail_read:'mail',calendar_list_calendars:'calendar',calendar_query_events:'calendar',calendar_get_event:'calendar',photos_query:'photos',photos_albums:'photos',photos_detail:'photos',photos_persons:'photos'};
/** Bounded process-local observations. No token, request argument or provider result is retained. */
export class ReadinessEvidence {
 private rows=new Map<string,Stored>();
 constructor(private stamp:(p:Principal,service:string)=>string|undefined,private now=()=>Date.now()){}
 private key(p:Principal,service:string){return JSON.stringify([p.subject,p.accountId,p.clientId,service]);}
 private identity(p:Principal){return !!p.accountId&&!!p.clientId&&!!p.expiresAt&&p.expiresAt>this.now();}
 observe(p:Principal){
  if(!this.identity(p))return;
  for(const service of ['mail','calendar','photos','homekit']){if(!p.scopes.has(service+'.read'))continue;const stamp=this.stamp(p,service);if(!stamp)continue;const key=this.key(p,service),old=this.rows.get(key);const now=this.now();
   this.rows.set(key,{ownerId:p.subject,accountId:p.accountId!,clientId:p.clientId!,service,stamp,authorizedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(p.expiresAt!,now+86400000)).toISOString(),reads:old?.stamp===stamp&&Date.parse(old.expiresAt)>now?old.reads:{}});
  }
  while(this.rows.size>256)this.rows.delete(this.rows.keys().next().value!);
 }
 start(p:Principal,tool:string){const service=readTools[tool];if(!service||!this.identity(p)||!p.scopes.has(service+'.read'))return;const stamp=this.stamp(p,service);if(!stamp)return;
  return(result:CallToolResult)=>{if(result.isError||!this.identity(p)||this.stamp(p,service)!==stamp)return;
   // Missing events and explicitly incomplete/unsupported provider results are not successful reads.
   if(!result.content?.some(item=>item.type==='text'))return;
   try{for(const item of result.content??[])if(item.type==='text'){const value=JSON.parse(item.text);if(service==='homekit'&&(!value||typeof value!=='object'||(tool==='homekit_automation_inventory'&&(!Array.isArray(value.scenes)||!Array.isArray(value.automations)||value.schemaVersion!==1))||(tool==='homekit_read'&&(value.valueSource!=='fresh-read'||value.error!==null))))return;if(service==='calendar'&&(!value||typeof value!=='object'||(tool==='calendar_list_calendars'&&!Array.isArray(value.calendars))||(tool==='calendar_query_events'&&!Array.isArray(value.events))||(tool==='calendar_get_event'&&(!value.event||typeof value.event!=='object'))))return;if(service==='photos'&&(!value||typeof value!=='object'||(tool==='photos_query'&&!Array.isArray(value.assets))||(tool==='photos_albums'&&!Array.isArray(value.albums))||(tool==='photos_persons'&&!Array.isArray(value.persons))||(tool==='photos_detail'&&typeof value.id!=='string')))return;if(value&&typeof value==='object'&&(value.status==='not_found'||value.complete===false||value.error||['unknown','rejected','unsupported','incomplete'].includes(value.status)))return;}}catch{return;}
   const row=this.rows.get(this.key(p,service));if(row?.stamp===stamp)row.reads[tool]=new Date(this.now()).toISOString();
  };
 }
 list(ownerId:string):EvidenceRow[]{const output:EvidenceRow[]=[];
  for(const [key,row] of this.rows){if(row.ownerId!==ownerId)continue;const p:Principal={subject:ownerId,accountId:row.accountId,clientId:row.clientId,expiresAt:Date.parse(row.expiresAt),scopes:new Set([row.service+'.read'])};
   if(!this.identity(p)||this.stamp(p,row.service)!==row.stamp){this.rows.delete(key);continue;}
   const {ownerId:_,stamp:__,...safe}=row;output.push({...safe,reads:{...safe.reads}});
  }return output;
 }
}
