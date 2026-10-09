<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy} from '@decompozr/ui/contracts';
 import type {ToastCenter} from '@decompozr/ui/toast-state.svelte.js';
 import ActionButton from '@decompozr/ui/components/ActionButton.svelte';
 import Checkbox from '@decompozr/ui/design-system/Checkbox.svelte';
 let {accountId,user,busy=false,onbusy,oncomplete,onclose}:{accountId:string;user:string;busy?:boolean;onbusy:(value:boolean)=>void;oncomplete:()=>void;onclose:()=>void}=$props();
 const {t}=getContext<UiCopy>('copy');const toast=getContext<ToastCenter>('toast');let confirm=$state(false),error=$state(false);
 async function disconnect(){if(!confirm||busy||!accountId)return;onbusy(true);error=false;try{const response=await fetch('/icloud/admin/photos/cloud/revoke',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,confirm:true})});if(!response.ok)throw Error();oncomplete();toast.push('icloudSessionDisconnected');onclose();}catch{error=true;toast.push('photosCloudFailed','error');}finally{onbusy(false);}}
</script>
<p>{user}</p><p>{t('icloudDisconnectHelp')}</p>
{#if error}<p class="form-error" role="alert">{t('photosCloudFailed')}</p>{/if}
<Checkbox label={t('icloudDisconnectConfirm')} checked={confirm} disabled={busy} onchange={event=>{confirm=event.currentTarget.checked}}/>
<div class="actions"><ActionButton showLabel class="danger" icon="unplug" label={t('disconnectICloudSession')} disabled={busy||!confirm} onclick={()=>void disconnect()}/><ActionButton showLabel icon="close" label={t('cancel')} disabled={busy} onclick={onclose}/></div>
