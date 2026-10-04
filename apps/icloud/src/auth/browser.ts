import {accountSchema,serviceSchema,renderServiceChecklist,type ServiceView} from '../accounts/presentation.js';
import {consentScopeLabel} from './scope-labels.js';
import { authT } from './i18n.js';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { z } from 'zod';
const registrationOptions=z.object({challenge:z.string(),rp:z.object({id:z.string(),name:z.string()}),user:z.object({id:z.string(),name:z.string(),displayName:z.string()}),pubKeyCredParams:z.array(z.object({type:z.literal('public-key'),alg:z.number().int()})),timeout:z.number().optional()});
const authenticationOptions=z.object({challenge:z.string(),rpId:z.string(),timeout:z.number().optional()});

class AuthRequestError extends Error {constructor(message:string,readonly code?:string){super(message);}}
/** The server is authoritative for parsing and verifying all ceremony responses. */
async function request(path:string,body?:object,headers:Record<string,string>={}) {
 const result=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:{...headers,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(!result.ok){const body:unknown=await result.json().catch(()=>null);const code=typeof body==='object'&&body!==null&&'error'in body?body.error:undefined;throw new AuthRequestError(authT(code==='PROVIDER_VALIDATION_FAILED'?'providerError':code==='ACCOUNT_EXISTS'?'duplicateAccount':code==='CREDENTIAL_REQUIRED'?'accountUnavailable':code==='CONNECT_RESTART_REQUIRED'?'savedReconnect':['ACCOUNT_ALREADY_SELECTED','ACCOUNT_SELECTION_REQUIRED','ACCOUNT_SELECTION_EXPIRED','INVALID_AUTHORIZATION','INVALID_ACCOUNT_REQUEST'].includes(String(code))?'connectionExpired':'requestFailed'),typeof code==='string'?code:undefined);}
 return result;
}
export async function registerOwner():Promise<void>{
 const begun=z.object({passkeyRegistered:z.boolean()}).parse(await(await request('/icloud/setup/begin',{})).json());
 if(begun.passkeyRegistered)return;
 const options=registrationOptions.parse(await(await request('/icloud/auth/passkey/generate-register-options')).json());
 const response=await startRegistration({optionsJSON:{...options,attestation:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'}}});
 await request('/icloud/auth/passkey/verify-registration',{response,name:authT('owner'),createSession:true});
}
/** Filter unrelated page parameters; the provider verifies the signature server-side. */
export function signedOAuthQuery(search:string):string{
 const all=new URLSearchParams(search),names=new Set(all.getAll('ba_param'));
 if(!all.has('sig')||names.size===0)throw Error(authT('incompleteConnection'));
 const signed=new URLSearchParams();
 for(const [key,value]of all)if(key==='sig'||key==='ba_param'||names.has(key))signed.append(key,value);
 return signed.toString();
}
function redirectResult(value:unknown):string|undefined{
 if(typeof value!=='object'||value===null||!('url'in value)||typeof value.url!=='string')return;
 const parsed=new URL(value.url,location.origin);
 if(!['http:','https:'].includes(parsed.protocol))throw Error(authT('unsupportedCallback'));
 return parsed.href;
}
async function signIn():Promise<void>{
 const oauthQuery=location.search?signedOAuthQuery(location.search):undefined;
 const options=authenticationOptions.parse(await(await request('/icloud/auth/passkey/generate-authenticate-options')).json());
 const response=await startAuthentication({optionsJSON:{...options,userVerification:'required'}});
 const result:unknown=await(await request('/icloud/auth/passkey/verify-authentication',{response,...(oauthQuery?{oauth_query:oauthQuery}:{})})).json();
 const destination=redirectResult(result);
 if(destination){location.assign(destination);return;}
 if(oauthQuery){const continued=await(await request('/icloud/auth/oauth2/continue',{oauth_query:oauthQuery})).json();const destination=redirectResult(continued);if(!destination)throw new AuthRequestError(authT('incompleteAuthorization'));location.assign(destination);return;}
 if(document.body.dataset.authReturn==='/icloud/admin'){location.assign('/icloud/admin');return;}
 const status=document.querySelector('[data-auth-status]');if(status)status.textContent=authT('signedIn');
}
async function consent(accept:boolean):Promise<void>{
 const result:unknown=await(await request('/icloud/auth/oauth2/consent',{accept,oauth_query:signedOAuthQuery(location.search)})).json();
 const destination=redirectResult(result);if(!destination)throw Error(authT('incompleteAuthorization'));location.assign(destination);
}
/** Empty optional names must be absent so the server can use the account email. */
export function connectionCredential(data:FormData):{user:string;appPassword:string;label?:string}{
 const label=String(data.get('label')??'').trim();
 return {user:String(data.get('user')??''),appPassword:String(data.get('appPassword')??''),...(label?{label}:{})};
}
export function accountDisplay(account:{label:string;user:string}):{primary:string;secondary?:string}{
 const label=account.label.trim(),user=account.user.trim();
 return !label||label.toLowerCase()===user.toLowerCase()?{primary:user}:{primary:label,secondary:user};
}
function mount(){
 const mode=document.body.dataset.authMode;if(!mode)return;
 const status=document.querySelector('[data-auth-status]');
 let busy=false;
 const run=async(button:HTMLButtonElement,action:()=>Promise<void>)=>{if(busy)return;busy=true;const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];const states=buttons.map(item=>item.disabled);buttons.forEach(item=>item.disabled=true);button.disabled=true;if(status){status.classList.remove('error');status.textContent=authT('working');}try{await action();if(status)status.textContent='';}catch(error){if(status){status.classList.add('error');status.textContent=error instanceof AuthRequestError?error.message:authT('actionFailed');}}finally{busy=false;buttons.forEach((item,index)=>item.disabled=states[index]??false);button.disabled=mode==='consent'&&button===primary&&!consentReady;}};
 const primary=document.querySelector<HTMLButtonElement>('[data-auth-primary]');if(mode==='consent'&&primary)primary.disabled=true;let consentReady=mode!=='consent';
 primary?.addEventListener('click',()=>{if(mode==='consent'&&!consentReady)return;void run(primary,()=>mode==='sign-in'?signIn():consent(true));});
 const deny=document.querySelector<HTMLButtonElement>('[data-auth-deny]');deny?.addEventListener('click',()=>void run(deny,()=>consent(false)));
 const connectionStatus=z.object({accounts:z.array(accountSchema),selectedAccount:accountSchema.optional(),selectedAccounts:z.array(accountSchema).optional(),services:z.array(serviceSchema).default([]),client:z.object({id:z.string(),name:z.string().optional()})});
 const loadStatus=async()=>connectionStatus.parse(await(await request('/icloud/connect/status?'+new URLSearchParams({oauth_query:signedOAuthQuery(location.search)}))).json());
 const continueToConsent=(value:unknown)=>{const url=redirectResult(value);if(!url)throw new AuthRequestError(authT('incompleteAuthorization'));location.assign(url);};
 let registeredServices:ServiceView[]=[];
 function renderAccounts(accounts:Array<z.infer<typeof accountSchema>>){
  const list=document.querySelector('[data-connect-accounts]');list?.replaceChildren();
  const choices=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=authT('chooseAccounts');choices.append(legend);
  for(const account of accounts){
   const card=document.createElement('div');card.className='account-choice';
   const label=document.createElement('label'),field=document.createElement('input');field.type='checkbox';field.value=account.id;field.name='authorizedAccounts';field.disabled=!account.credentialStored;
   const display=accountDisplay(account);label.append(field,document.createTextNode(`${display.primary}${display.secondary?' · '+display.secondary:''}${account.credentialStored?'':` · ${authT('accountUnavailable')}`} `));card.append(label,renderServiceChecklist(account,registeredServices));choices.append(card);
  }
  const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=authT('continueSelected');button.disabled=true;
  choices.addEventListener('change',()=>{button.disabled=busy||!choices.querySelector('input[name=authorizedAccounts]:checked');});
  button.addEventListener('click',()=>void run(button,async()=>{
   const accountIds=[...choices.querySelectorAll<HTMLInputElement>('input[name=authorizedAccounts]:checked')].map(field=>field.value);
   if(!accountIds.length)throw new AuthRequestError(authT('chooseAccount'));
   continueToConsent(await(await request('/icloud/connect/select',{oauth_query:signedOAuthQuery(location.search),accountIds})).json());
  }));
  list?.append(choices,button);
 }
 if(mode==='connect'||mode==='consent')void run(primary??document.createElement('button'),async()=>{
  const result=await loadStatus();registeredServices=result.services;
  if(mode==='consent'){
   const accounts=result.selectedAccounts??(result.selectedAccount?[result.selectedAccount]:[]);
   if(!accounts.length||accounts.some(account=>!account.credentialStored))throw new AuthRequestError(authT('chooseAccount'));
   consentReady=true;
   const target=document.querySelector('[data-auth-account]');target?.replaceChildren();
   for(const account of accounts){const display=accountDisplay(account),name=document.createElement('p');name.textContent=`${authT('selectedAccount')}: ${display.primary}${display.secondary?' · '+display.secondary:''}`;target?.append(name,renderServiceChecklist(account,registeredServices));}
   const client=document.querySelector('[data-auth-client]'),clientId=document.querySelector('[data-auth-client-id]');
   if(client)client.textContent=result.client.name??authT('unknownClient');
   if(clientId)clientId.textContent=result.client.id;
   return;
  }
  renderAccounts(result.accounts);
  const form=document.querySelector<HTMLFormElement>('[data-connect-form]');
  document.querySelector('[data-connect-add]')?.addEventListener('click',()=>{if(form)form.hidden=false;document.getElementById('connect-email')?.focus();});
  form?.addEventListener('submit',event=>{
   event.preventDefault();const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(!button)return;
   void run(button,async()=>{
    const data=new FormData(form),password=form.elements.namedItem('appPassword');
    try{continueToConsent(await(await request('/icloud/connect/add',{oauth_query:signedOAuthQuery(location.search),...connectionCredential(data)})).json());}
    catch(error){let stored=false;try{const accounts=(await loadStatus()).accounts;renderAccounts(accounts);stored=accounts.some(account=>account.credentialStored&&account.user.toLowerCase()===String(data.get('user')).trim().toLowerCase());}catch{}if(stored&&(!(error instanceof AuthRequestError)||!['ACCOUNT_EXISTS','PROVIDER_VALIDATION_FAILED'].includes(error.code??'')))throw new AuthRequestError(authT('savedReconnect'));throw error;}
    finally{if(password instanceof HTMLInputElement)password.value='';}
   });
  });
 });
 if(mode==='consent'){
  const params=new URLSearchParams(location.search);
  const labels=z.record(z.string(),z.union([z.string(),z.record(z.string(),z.string())])).parse(JSON.parse(document.body.dataset.authScopeLabels??'{}'));
  labels.offline_access=authT('scopeOffline');
  const list=document.querySelector('[data-auth-scopes]');for(const scope of(params.get('scope')??'').split(' ').filter(Boolean)){const item=document.createElement('li');item.textContent=consentScopeLabel(labels,scope,document.documentElement.lang);list?.append(item);}
 }
}
if(typeof document!=='undefined')mount();
