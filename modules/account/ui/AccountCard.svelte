<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "@decompozr/ui/contracts";
  import type {DialogCenter} from "./dialog-state.svelte.js";
  import Tag from "@decompozr/ui/design-system/Tag.svelte";
  import ActionButton from "@decompozr/ui/components/ActionButton.svelte";
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
    <div class="account-actions">
      <ActionButton
        icon="pencil"
        label={t(
          account.credentialStored ? "editAppPassword" : "openAppPassword",
        )}
        disabled={busy}
        onclick={() =>
          dialogs.openCredential("app-password", {
            accountId: account.id,
            mode: "rotate",
          })}
      />
      <ActionButton
        icon="circle-dot"
        label={t(savedSession ? "manageAppleSession" : "openAppleSession")}
        disabled={busy || !sessionAvailable}
        onclick={() =>
          dialogs.openCredential("apple-account", { accountId: account.id })}
      />
      <ActionButton
        icon="trash-2"
        label={t("revoke")}
        class="danger"
        disabled={busy}
        onclick={() => onrevoke(account.id)}
      />
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
