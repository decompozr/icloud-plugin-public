<script lang="ts">
 import {getContext,onMount,onDestroy}from'svelte';
 import SettingsSection from'@decompozr/ui/components/SettingsSection.svelte';
 import Switch from'@decompozr/ui/design-system/Switch.svelte';
 import ActionButton from'@decompozr/ui/components/ActionButton.svelte';
 import Modal from'@decompozr/ui/components/Modal.svelte';
 import type{UiCopy}from'../contracts.js';
 import type{ToastCenter}from'../lib/ui-state.svelte.js';
 const{t}=getContext<UiCopy>('copy'),toast=getContext<ToastCenter>('toast');
 let service=$state<{available:boolean;startAtLogin:boolean;restartOnFailure:boolean;managed?:boolean;operation?:{state:string}|null}>(),busy=$state(false),confirm=$state(false),startChecked=$state(false),restartChecked=$state(false);let mounted=true;
 onDestroy(()=>{mounted=false});
 async function load(id?:string){const response=await fetch('/icloud/admin/service/status'+(id?'?id='+encodeURIComponent(id):''),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error();const value=await response.json();if(mounted){service=value;startChecked=value.startAtLogin;restartChecked=value.restartOnFailure;}return value;}
 onMount(()=>{void load().catch(()=>{if(mounted)toast.push('serviceReadFailed','error')})});
 async function save(input:unknown,action='configure'){
  if(busy)return;busy=true;confirm=false;
  try{const response=await fetch('/icloud/admin/service/'+action,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(response.status!==202)throw Error();const receipt=await response.json();const id=receipt.operation?.id;if(typeof id!=='string')throw Error();if(mounted)toast.push('serviceReconnecting','info');
   for(let n=0;n<80&&mounted;n++){await new Promise(r=>setTimeout(r,1000));try{const value=await load(id);if(value.operation?.state==='failed')throw Error('failed');if(value.operation?.state==='superseded'){toast.push('serviceSuperseded','info');return}if(value.operation?.state==='completed'){toast.push('serviceSaved','success');return}}catch(error){if(error instanceof Error&&error.message==='failed')throw error}}
   throw Error();
  }catch{if(mounted)toast.push('serviceCheckStatus','error')}finally{if(mounted)busy=false}
 }
 function toggle(key:'startAtLogin'|'restartOnFailure',event:Event){const checked=(event.currentTarget as HTMLInputElement).checked;if(service){const input={startAtLogin:service.startAtLogin,restartOnFailure:service.restartOnFailure,[key]:checked};void save(input)}}
</script>
<SettingsSection title={t('serviceBackgroundTitle')}>
 {#snippet tools()}<ActionButton icon="refresh" label={t('serviceRefresh')} disabled={busy} onclick={()=>void load().catch(()=>toast.push('serviceReadFailed','error'))}/>{/snippet}
 <p class="muted">{t('serviceLoginHelp')}</p>
 <Switch label={t('serviceStartAtLogin')} bind:checked={startChecked} disabled={busy||!service?.available} onchange={event=>toggle('startAtLogin',event)}/>
 <Switch label={t('serviceRestartOnFailure')} bind:checked={restartChecked} disabled={busy||!service?.available} onchange={event=>toggle('restartOnFailure',event)}/>
 <div class="actions"><ActionButton label={t('serviceRestart')} icon="refresh" disabled={busy||!service?.available} onclick={()=>confirm=true}/></div>
</SettingsSection>
<Modal open={confirm} title={t('serviceRestart')} onclose={()=>confirm=false} {busy}><p>{t('serviceRestartHelp')}</p><div class="actions"><ActionButton icon="refresh" label={t('serviceRestart')} disabled={busy} onclick={()=>void save({confirm:true},'restart')}/><ActionButton icon="close" label={t('cancel')} class="secondary" onclick={()=>confirm=false}/></div></Modal>
