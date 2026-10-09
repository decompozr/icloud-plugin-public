<script lang="ts">
  import ActionButton from "@decompozr/ui/components/ActionButton.svelte";
  import { getContext } from "svelte";
  import type { UiCopy } from "@decompozr/ui/contracts";
  const { t } = getContext<UiCopy>("copy");
  import Copy from "@decompozr/ui/components/Copy.svelte";
  import type {AccountEditPort} from "./ports.js";
  let { admin, model }: { admin: boolean; model?: AccountEditPort } = $props();
  const account = $derived(
    model?.dashboard?.accounts.find((a) => a.id === model.selectedAccount),
  );
</script>

<section data-step="2" hidden={!admin}>
  <h2 tabindex="-1">
    <Copy copyKey={admin ? "mailAdminTitle" : "mailTitle"} />
  </h2>
  <p><Copy copyKey="mailIntro" /></p>
  {#if admin}<p class="note"><Copy copyKey="replaceNote" /></p>{/if}
  <div class="note">
    <a href="https://support.apple.com/102654" target="_blank" rel="noreferrer"
      ><Copy copyKey="appleGuide" /></a
    ><br /><Copy copyKey="appleGuideHelp" />
  </div>
  <form
    id="credentials"
    data-admin={admin}
    onsubmit={(e) => {
      e.preventDefault();
      if (model) void model.run(() => model!.rotate(), "saving");
    }}
  >
    <label for="account"><Copy copyKey="accountsTitle" /></label><select
      id="account"
      required
      value={model?.selectedAccount ?? ""}
      disabled={model?.busy ?? true}
      onchange={(e) => {
        model?.chooseAccount(e.currentTarget.value);
        e.currentTarget.value = model?.selectedAccount ?? "";
      }}
      >{#each model?.dashboard?.accounts ?? [] as account}<option
          value={account.id}
          >{account.label === account.user
            ? account.user
            : account.label + " · " + account.user}</option
        >{/each}</select
    >
    <label for="password"><Copy copyKey="password" /></label><input
      id="password"
      name="password"
      type="password"
      required
      autocomplete="new-password"
      maxlength="256"
      value={model?.password ?? ""}
      aria-invalid={model?.invalidField === "password" ? "true" : undefined}
      aria-describedby="error"
      oninput={(e) => {
        if (model) {
          model.password = e.currentTarget.value;
          model.invalidField = "";
        }
      }}
      disabled={model?.busy ?? true}
    /><small><Copy copyKey="passwordHelp" /></small>
    <div class="actions">
      <ActionButton
        showLabel
        id="save"
        class="primary"
        type="submit"
        disabled={!account || model?.busy}
        label={t(admin ? "saveAdmin" : "save")}
        icon="check"
      />{#if !admin}<ActionButton
          showLabel
          type="button"
          class="secondary"
          data-back="1"
          onclick={() => model?.step(1)}
          label={t("back")}
          icon="arrow-right"
        />{/if}
    </div>
  </form>
  {#if admin}<div class="section-divider">
      <h2><Copy copyKey="revokeTitle" /></h2>
      <p class="muted"><Copy copyKey="revokeIntro" /></p>
      <ActionButton
        showLabel
        id="revoke"
        class="danger"
        disabled={!account || model?.busy}
        onclick={() => {
          if (model) model.revokeAccount = model.selectedAccount;
        }}
        label={t("revoke")}
        icon="trash-2"
      />
      <div id="revoke-confirm" hidden={!model?.revokeAccount} class="note">
        <p id="revoke-account">
          {account ? account.label + " · " + account.user : ""}
        </p>
        <p><Copy copyKey="revokeConfirm" /></p>
        <ActionButton
          showLabel
          id="revoke-yes"
          class="danger"
          disabled={model?.busy}
          onclick={() => {
            if (model) void model.run(() => model!.revoke(), "revoking");
          }}
          label={t("revokeYes")}
          icon="trash-2"
        /><ActionButton
          showLabel
          id="revoke-cancel"
          class="secondary"
          disabled={model?.busy}
          onclick={() => {
            if (model) model.revokeAccount = "";
          }}
          label={t("cancel")}
          icon="close"
        />
      </div>
    </div>{/if}
</section>
