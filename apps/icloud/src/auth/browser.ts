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
 const fragment=new URLSearchParams(typeof location==='undefined'?'':location.hash.slice(1)),proof=fragment.get('owner-proof');
 if(proof)history.replaceState(null,'',location.pathname+location.search);
 const begun=z.object({passkeyRegistered:z.boolean()}).parse(await(await request('/icloud/setup/begin',proof?{proof}:{})).json());
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
 const chosen=[...document.querySelectorAll<HTMLInputElement>('[data-auth-scope]:checked')].map(input=>input.value);
 if(accept&&!chosen.length)throw new AuthRequestError(authT('selectPermission'));
 const result:unknown=await(await request('/icloud/auth/oauth2/consent',{accept,...(accept?{scope:chosen.join(' ')}:{}),oauth_query:signedOAuthQuery(location.search)})).json();
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
/** Group only scopes returned by the signed, policy-filtered server response. */
export function consentPermissionGroups(scopes:readonly string[]):Array<{title:string;scopes:string[]}>{
 const known=['mail.','calendar.','photos.'];
 return [
  {title:authT('permissionMail'),scopes:scopes.filter(scope=>scope.startsWith('mail.'))},
  {title:authT('permissionCalendar'),scopes:scopes.filter(scope=>scope.startsWith('calendar.'))},
  {title:authT('permissionPhotos'),scopes:scopes.filter(scope=>scope.startsWith('photos.'))},
  {title:authT('permissionConnection'),scopes:scopes.filter(scope=>!known.some(prefix=>scope.startsWith(prefix)))}
 ].filter(group=>group.scopes.length>0);
}
