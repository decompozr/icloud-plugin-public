import {z} from 'zod';
import {capabilitySchema} from './capabilities.js';
export const accountSchema=z.object({id:z.string(),user:z.string(),label:z.string(),credentialStored:z.boolean(),credentialRevision:z.number().optional(),services:z.record(capabilitySchema).optional()});
export const serviceSchema=z.object({id:z.string(),title:z.string()});
export type AccountView=z.infer<typeof accountSchema>;
export type ServiceView=z.infer<typeof serviceSchema>;
const copy={
 en:{services:'Account services',available:'Available',unavailable:'Unavailable',unknown:'Not confirmed',enabled:'Enabled',disabled:'Disabled',verified:'Access verified.',legacy_mail:'Previously connected Mail; check again to refresh availability.',service_not_provisioned:'The provider confirmed this service is not provisioned.',probe_failed:'Access could not be confirmed. Sign-in or network checks failed.',not_checked:'This service has not been checked.',credential_revoked:'The stored credential has been removed.',note:'Service availability does not grant write, send, scheduling or sharing permission.'},
 'zh-TW':{services:'帳號服務',available:'可用',unavailable:'不可用',unknown:'尚未確認',enabled:'已啟用',disabled:'已停用',verified:'已確認可以存取。',legacy_mail:'先前已連接 Mail；請重新檢查目前可用性。',service_not_provisioned:'服務提供者已確認尚未開通此服務。',probe_failed:'無法確認存取權，登入或網路檢查未成功。',not_checked:'尚未檢查此服務。',credential_revoked:'已移除儲存的憑證。',note:'服務可用性不會授予寫入、寄送、邀請或共享權限。'},
};
export function renderServiceChecklist(account:AccountView,services:readonly ServiceView[],edit?:(service:string,enabled:boolean)=>void):HTMLElement {
 const words=copy[document.documentElement.lang==='zh-TW'?'zh-TW':'en'];
 const group=document.createElement('fieldset');group.className='account-services';
 const legend=document.createElement('legend');legend.textContent=words.services;group.append(legend);
 for(const service of services){
  const state=account.services?.[service.id]??{availability:'unknown',enabled:false,reason:'not_checked',checkedAt:null};
  const eligible=account.credentialStored&&state.availability==='available';
  const row=document.createElement('div');row.className='account-service';
  const name=document.createElement('strong');name.textContent=service.title;row.append(name);
  const availableLabel=document.createElement('label'),available=document.createElement('input');available.type='checkbox';available.checked=eligible;available.disabled=true;
  availableLabel.append(available,document.createTextNode(words[account.credentialStored?state.availability:'unknown']));row.append(availableLabel);
  const label=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=eligible&&state.enabled;enabled.disabled=!edit||!eligible;enabled.dataset.serviceToggle=service.id;enabled.dataset.eligible=String(!!edit&&eligible);enabled.id=`service-${account.id}-${service.id}`;
  const reasonId=`reason-${account.id}-${service.id}`;enabled.setAttribute('aria-describedby',reasonId);enabled.setAttribute('aria-label',`${service.title} · ${account.label} · ${words.enabled}`);
  label.append(enabled,document.createTextNode(words[enabled.checked?'enabled':'disabled']));row.append(label);
  enabled.addEventListener('change',()=>edit?.(service.id,enabled.checked));
  const reason=document.createElement('small');reason.id=reasonId;reason.textContent=words[account.credentialStored?state.reason:'credential_revoked'];row.append(reason);group.append(row);
 }
 const note=document.createElement('small');note.textContent=words.note;group.append(note);return group;
}
