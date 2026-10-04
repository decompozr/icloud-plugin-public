import type {OwnerSecretStore,MailAccount} from '../storage/owner-store.js';
import type {InvocationContext} from '../modules/context.js';
import {serviceEligible,type RegisteredService} from './capabilities.js';

export class AccountRoutingError extends Error {
 constructor(readonly code:'account_not_authorized'|'service_unavailable'|'account_selection_required'|'invalid_account_id'){super(code);}
}
/** Only grant IDs from verified authentication enter here. Owner-wide enumeration is never a fallback. */
export class AccountAccess {
 constructor(private store:OwnerSecretStore,readonly services:readonly Pick<RegisteredService,'id'|'title'>[]){}
 accounts(context?:InvocationContext):MailAccount[]{
  if(!context||context.ownerId!==this.store.ownerId())return [];
  const ids=context.accountIds??(context.accountId?[context.accountId]:[]);
  return [...new Set(ids)].flatMap(id=>{try{return [this.store.account(context.ownerId,id)];}catch{return [];}});
 }
 eligible(context:InvocationContext|undefined,service:string){return this.accounts(context).filter(account=>serviceEligible(account,service));}
 catalog(context?:InvocationContext){
  const defaults=context&&context.ownerId===this.store.ownerId()?this.store.serviceDefaults(context.ownerId):{};
  return {accounts:this.accounts(context).map(account=>({account_id:account.id,label:account.label,user:account.user,services:this.services.map(service=>{
   const state=account.services?.[service.id]??{availability:'unknown',enabled:false,reason:'not_checked',checkedAt:null};
   return {id:service.id,title:service.title,...state,enabled:account.credentialStored&&state.enabled,eligible:serviceEligible(account,service.id),is_default:defaults[service.id]===account.id&&serviceEligible(account,service.id)};
  })}))};
 }
 select(context:InvocationContext|undefined,service:string,explicit:unknown):InvocationContext {
  if(explicit!==undefined&&(typeof explicit!=='string'||!explicit||explicit.length>256))throw new AccountRoutingError('invalid_account_id');
  const authorized=this.accounts(context),eligible=authorized.filter(account=>serviceEligible(account,service));
  let selected:MailAccount|undefined;
  if(typeof explicit==='string'){
   selected=authorized.find(account=>account.id===explicit);
   if(!selected)throw new AccountRoutingError('account_not_authorized');
   if(!serviceEligible(selected,service))throw new AccountRoutingError('service_unavailable');
  }else{
   const preferred=context?this.store.serviceDefaults(context.ownerId)[service]:undefined;
   selected=eligible.find(account=>account.id===preferred);
   if(!selected&&eligible.length===1)selected=eligible[0];
   if(!selected)throw new AccountRoutingError(eligible.length?'account_selection_required':'service_unavailable');
  }
  return {...context!,accountId:selected!.id};
 }
}
