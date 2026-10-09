<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "@decompozr/ui/contracts";
  import type {DialogCenter} from "./dialog-state.svelte.js";
  import Tag from "@decompozr/ui/design-system/Tag.svelte";
  import ActionButton from '@decompozr/ui/components/ActionButton.svelte';
  import KeyIcon from '@decompozr/ui/components/KeyIcon.svelte';
  import GlobeIcon from '@decompozr/ui/components/GlobeIcon.svelte';
  let {account,busy=false,sessionPhase,sessionAvailable=false,dialogs,onrevoke}:{
    account:{id:string;user:string;label:string;credentialStored:boolean};
    busy?:boolean;sessionPhase?:string;sessionAvailable?:boolean;
    dialogs:DialogCenter;onrevoke:(id:string)=>void;
  }=$props();
  const { t } = getContext<UiCopy>("copy");
  const savedSession = $derived(
    sessionPhase === "authenticated",
  );
  const sessionStatus = $derived(sessionPhase === 'authenticated' ? 'sessionSavedShort' : sessionPhase === 'awaiting_2fa' ? 'sessionVerifyShort' : sessionPhase === 'challenge_expired' ? 'sessionExpiredShort' : sessionPhase === 'not_connected' ? 'sessionDisconnectedShort' : 'unknownValue');
</script>
<article class="account-card" role="listitem" data-account-id={account.id}>
 <header class="account-card-header"><div class="account-identity">
 <h3>{account.label === account.user ? account.user : account.label}</h3>
 {#if account.label !== account.user}<p class="muted">{account.user}</p>{/if}
 </div></header>
 <section class="account-access-row" data-access="app-password" aria-label={t('appPasswordShort')}>
  <div class="account-access-copy"><div class="account-access-heading"><KeyIcon/><h4>{t('appPasswordShort')}</h4><Tag tone={account.credentialStored?'sage':'neutral'} label={t(account.credentialStored?'credentialStoredShort':'credentialMissingShort')}/></div><p>{t('appPasswordPurpose')}</p></div>
  <div class="account-access-actions" role="group" aria-label={t('appPasswordShort')+' - '+account.user}>
   <ActionButton icon={account.credentialStored?'pencil':'plus'} label={t(account.credentialStored?'editAppPassword':'openAppPassword')} disabled={busy} onclick={()=>dialogs.openCredential('app-password',{accountId:account.id,mode:'rotate'})}/>
   <ActionButton icon="trash-2" class="danger" label={t('revoke')} disabled={busy||!account.credentialStored} onclick={()=>onrevoke(account.id)}/>
  </div>
 </section>
 {#if sessionAvailable}<section class="account-access-row" data-access="icloud-session" aria-label={t('appleSessionShort')}>
  <div class="account-access-copy"><div class="account-access-heading"><GlobeIcon/><h4>{t('appleSessionShort')}</h4><Tag tone={savedSession?'sage':'neutral'} label={t(sessionStatus)}/></div><p>{t('icloudSessionPurpose')}</p></div>
  <div class="account-access-actions" role="group" aria-label={t('appleSessionShort')+' - '+account.user}>
   <ActionButton icon={savedSession?'settings':'arrow-right'} label={t(savedSession?'manageAppleSession':'openAppleSession')} disabled={busy} onclick={()=>dialogs.openCredential('apple-account',{accountId:account.id})}/>
   <ActionButton icon="unplug" class="danger" label={t('disconnectICloudSession')} disabled={busy||!savedSession} onclick={()=>dialogs.openCredential('icloud-disconnect',{accountId:account.id,accountUser:account.user})}/>
  </div>
 </section>{/if}
</article>
