import { authT } from './i18n.js';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { z } from 'zod';
const registrationOptions=z.object({challenge:z.string(),rp:z.object({id:z.string(),name:z.string()}),user:z.object({id:z.string(),name:z.string(),displayName:z.string()}),pubKeyCredParams:z.array(z.object({type:z.literal('public-key'),alg:z.number().int()})),timeout:z.number().optional()});
const authenticationOptions=z.object({challenge:z.string(),rpId:z.string(),timeout:z.number().optional()});

/** The server is authoritative for parsing and verifying all ceremony responses. */
async function request(path:string,body?:object,headers:Record<string,string>={}) {
 const result=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:{...headers,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(!result.ok)throw new Error(authT('requestFailed'));
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
 if(oauthQuery){location.assign('/icloud/auth/oauth2/authorize?'+oauthQuery);return;}
 if(document.body.dataset.authReturn==='/icloud/admin'){location.assign('/icloud/admin');return;}
 const status=document.querySelector('[data-auth-status]');if(status)status.textContent=authT('signedIn');
}
async function consent(accept:boolean):Promise<void>{
 const result:unknown=await(await request('/icloud/auth/oauth2/consent',{accept,oauth_query:signedOAuthQuery(location.search)})).json();
 const destination=redirectResult(result);if(!destination)throw Error(authT('incompleteAuthorization'));location.assign(destination);
}
function mount(){
 const mode=document.body.dataset.authMode;if(!mode)return;
 const status=document.querySelector('[data-auth-status]');
 const run=async(button:HTMLButtonElement,action:()=>Promise<void>)=>{button.disabled=true;if(status){status.classList.remove('error');status.textContent=authT('working');}try{await action();}catch{if(status){status.classList.add('error');status.textContent=authT('actionFailed');}}finally{button.disabled=false;}};
 const primary=document.querySelector<HTMLButtonElement>('[data-auth-primary]');
 primary?.addEventListener('click',()=>void run(primary,()=>mode==='sign-in'?signIn():consent(true)));
 const deny=document.querySelector<HTMLButtonElement>('[data-auth-deny]');deny?.addEventListener('click',()=>void run(deny,()=>consent(false)));
 if(mode==='consent'){
  const params=new URLSearchParams(location.search),target=document.querySelector('[data-auth-client]');
  if(target)target.textContent=params.get('client_id')??authT('unknownClient');
  const labels:Record<string,string>={'mail.send':authT('scopeSend'),'mail.read':authT('scopeRead'),'mail.write':authT('scopeWrite'),'mail.unsubscribe':authT('scopeUnsubscribe'),'offline_access':authT('scopeOffline')};
  const list=document.querySelector('[data-auth-scopes]');for(const scope of(params.get('scope')??'').split(' ').filter(Boolean)){const item=document.createElement('li');item.textContent=labels[scope]??scope;list?.append(item);}
 }
}
if(typeof document!=='undefined')mount();
