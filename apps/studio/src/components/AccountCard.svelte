<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import Tag from "../lib/design-system/Tag.svelte";
  import ActionButton from "./ActionButton.svelte";
  let {
    account,
    model,
    dialogs,
  }: {
    account: {
      id: string;
      user: string;
      label: string;
      credentialStored: boolean;
    };
    model: AdminModel;
    dialogs: DialogCenter;
  } = $props();
  const { t } = getContext<UiCopy>("copy");
  const savedSession = $derived(
    model.webSessions[account.id]?.phase === "authenticated",
  );
  const sessionStatus = $derived(
    savedSession
      ? "sessionSavedShort"
      : model.webSessions[account.id]?.phase
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
        disabled={model.busy}
        onclick={() =>
          dialogs.openCredential("app-password", {
            accountId: account.id,
            mode: "rotate",
          })}
      />
      <ActionButton
        icon="circle-dot"
        label={t(savedSession ? "manageAppleSession" : "openAppleSession")}
        disabled={model.busy || !model.state.photosCloudConfigured}
        onclick={() =>
          dialogs.openCredential("apple-account", { accountId: account.id })}
      />
      <ActionButton
        icon="trash-2"
        label={t("revoke")}
        class="danger"
        disabled={model.busy}
        onclick={() => (model.revokeAccount = account.id)}
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
    {#if model.state.photosCloudConfigured}<Tag
        tone={savedSession ? "sage" : "neutral"}
        label={t("appleSessionShort") + " · " + t(sessionStatus)}
      />{/if}
  </div>
</article>
