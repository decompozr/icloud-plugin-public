import type{UiProviderServices}from'@decompozr/ui/module-host.js';
import type{UiCopy}from'../contracts.js';
import type{DialogCenter,ToastCenter}from'./ui-state.svelte.js';
/** Shell implementation of global services. Feature renderers receive only ctx. */
export function moduleUiProvider(copy:UiCopy,toast:ToastCenter|undefined,dialogs:DialogCenter):UiProviderServices{return{
 copy,fetch:request=>fetch(request),notify:(key,tone)=>toast?.push(key,tone),confirm:async key=>window.confirm(copy.t(key)),
 async accounts(){const response=await fetch('/icloud/admin/status',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('OWNER_REQUIRED');return(await response.json()).accounts;},
 openCredentials:()=>dialogs.openCredential('app-password',{mode:'add'}),
};}
