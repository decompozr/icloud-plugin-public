<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "@decompozr/ui/contracts";
  import type {DialogCenter} from "./dialog-state.svelte.js";
  import Tag from "@decompozr/ui/design-system/Tag.svelte";
  import Menu from "@decompozr/ui/design-system/Menu.svelte";
  let {account,busy=false,sessionPhase,sessionAvailable=false,dialogs,onrevoke}:{
    account:{id:string;user:string;label:string;credentialStored:boolean};
    busy?:boolean;sessionPhase?:string;sessionAvailable?:boolean;
    dialogs:DialogCenter;onrevoke:(id:string)=>void;
  }=$props();
  const { t } = getContext<UiCopy>("copy");
  const savedSession = $derived(
    sessionPhase === "authenticated",
  );
  const sessionStatus = $derived(
    savedSession
      ? "sessionSavedShort"
      : sessionPhase
        ? "credentialMissingShort"
        : "unknownValue",
  );
</script>

<article class="account-card" role="listitem" data-account-id={account.id}>
  <header class="account-card-header">
    <div class="account-identity">
      <h3>{account.label === account.user ? account.user : account.label}</h3>
      {#if account.label !== account.user}<p class="muted">
          {account.user}
        </p>{/if}
    </div>
    <div class="account-actions" role="group" aria-label={account.user}>
      <Menu label={t("accountActions")} compact disabled={busy} items={[
        {id:"credential",label:t(account.credentialStored ? "editAppPassword" : "openAppPassword"),onSelect:()=>dialogs.openCredential("app-password",{accountId:account.id,mode:"rotate"})},
        {id:"session",label:t(savedSession ? "manageAppleSession" : "openAppleSession"),disabled:!sessionAvailable,onSelect:()=>dialogs.openCredential("apple-account",{accountId:account.id})},
        {id:"remove",label:t("revoke"),separatorBefore:true,onSelect:()=>onrevoke(account.id)},
      ]} />
    </div>
  </header>
  <div class="account-statuses">
    <Tag
      tone={account.credentialStored ? "sage" : "neutral"}
      label={t("appPasswordShort") +
        " · " +
        t(
          account.credentialStored
            ? "credentialStoredShort"
            : "credentialMissingShort",
        )}
    />
    {#if sessionAvailable}<Tag
        tone={savedSession ? "sage" : "neutral"}
        label={t("appleSessionShort") + " · " + t(sessionStatus)}
      />{/if}
  </div>
</article>
