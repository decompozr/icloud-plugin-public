import {z} from 'zod';
const statusSchema=z.object({dependencyReady:z.boolean(),setupAvailable:z.boolean(),phase:z.enum(['not_connected','awaiting_2fa','authenticated','challenge_expired']).optional(),managementReady:z.boolean()});
export function initializePhotosCloud(){
 const root=document.getElementById('photos-cloud-setup');if(!root)return;
 const account=document.getElementById('photos-cloud-account') as HTMLSelectElement;
 const status=document.getElementById('photos-cloud-status')!;
 const password=document.getElementById('photos-cloud-password') as HTMLInputElement;
 const code=document.getElementById('photos-cloud-code') as HTMLInputElement;
 const confirm=document.getElementById('photos-cloud-revoke-confirm') as HTMLInputElement;
 let busy=false;
 const message=(value:string)=>{status.textContent=value;};
 async function request(path:string,body?:unknown){const response=await fetch('/icloud/admin/photos/cloud/'+path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(path==='setup'?300000:70000)});if(!response.ok)throw Error('Connection request failed.');return await response.json();}
 async function refresh(){
  const result=statusSchema.parse(await request('status'+(account.value?'?accountId='+encodeURIComponent(account.value):'')));
  const fields=document.getElementById('photos-cloud-login-fields') as HTMLFieldSetElement;fields.disabled=!result.dependencyReady;
  const install=document.getElementById('photos-cloud-install') as HTMLButtonElement;install.hidden=result.dependencyReady||!result.setupAvailable;
  document.getElementById('photos-cloud-verify')!.hidden=result.phase!=='awaiting_2fa';
  message(!result.dependencyReady?'Set up the connection before signing in.':result.phase==='awaiting_2fa'?'Enter the verification code from Apple.':result.phase==='challenge_expired'?'Verification expired. Sign in again.':result.phase==='authenticated'?'Signed in. Shared Album operations have not yet been verified.':'Select an account and sign in.');
 }
 async function run(action:()=>Promise<void>){if(busy)return;busy=true;account.disabled=true;root!.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
  try{await action();}catch{message('Could not complete the connection request. Check the account and try an explicit new request.');}
  finally{busy=false;account.disabled=false;root!.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);}
 }
 async function action(path:string,extra:Record<string,unknown>={}){if(!account.value)throw Error();const result=await request(path,{accountId:account.value,...extra});await refresh();if(['verification_failed','delivery_failed','unsupported_authentication','authentication_required'].includes(result.phase))message(result.phase==='verification_failed'?'Verification failed. Check the code.':result.phase==='unsupported_authentication'?'This authentication method is not supported yet.':'Apple authentication needs a new explicit sign-in or code request.');}
 account.addEventListener('change',()=>{password.value='';code.value='';confirm.checked=false;void run(refresh);});
 document.getElementById('photos-cloud-install')!.addEventListener('click',()=>void run(async()=>{message('Setting up the connection on the service.');await request('setup',{});await refresh();}));
 document.getElementById('photos-cloud-login')!.addEventListener('submit',event=>{event.preventDefault();const secret=password.value;password.value='';void run(()=>action('login',{password:secret}));});
 document.getElementById('photos-cloud-verify')!.addEventListener('submit',event=>{event.preventDefault();const value=code.value;code.value='';void run(()=>action('verify',{code:value}));});
 document.getElementById('photos-cloud-send-code')!.addEventListener('click',()=>void run(()=>action('send-code')));
 document.getElementById('photos-cloud-recheck')!.addEventListener('click',()=>void run(()=>action('recheck')));
 document.getElementById('photos-cloud-revoke')!.addEventListener('click',()=>{if(!confirm.checked){message('Confirm disconnecting this account first.');return;}void run(async()=>{await action('revoke',{confirm:true});confirm.checked=false;});});
 void run(async()=>{const response=await fetch('/icloud/admin/status',{credentials:'same-origin'});if(!response.ok)throw Error();const value=z.object({accounts:z.array(z.object({id:z.string().uuid(),user:z.string(),label:z.string()}))}).parse(await response.json());account.replaceChildren(new Option('Choose account',''),...value.accounts.map(a=>new Option(a.label===a.user?a.user:a.label+' · '+a.user,a.id)));if(value.accounts.length===1)account.value=value.accounts[0]!.id;await refresh();});
}
