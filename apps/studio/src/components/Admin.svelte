<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { AdminState, UiCopy } from "../contracts.js";
  import { AdminModel } from "../lib/admin-model.svelte.js";
  import {
    ToastCenter,
    DialogCenter,
    type LocaleControl,
  } from "../lib/ui-state.svelte.js";
  import Brand from "./Brand.svelte";
  import Overview from "./Overview.svelte";
  import AdminDashboard from "./AdminDashboard.svelte";
  import ModuleDialog from "./ModuleDialog.svelte";
  import RequirementDialog from "./RequirementDialog.svelte";
  import Modal from "./Modal.svelte";
  import RefreshButton from "./RefreshButton.svelte";
  let { state }: { state: AdminState } = $props();
  const copy = getContext<UiCopy>("copy"),
    { t } = copy,
    locale = getContext<LocaleControl>("locale");
  const toast = getContext<ToastCenter>("toast") ?? new ToastCenter(),
    dialogs = getContext<DialogCenter>("dialogs") ?? new DialogCenter();
  // svelte-ignore state_referenced_locally
  const model = new AdminModel(state, copy, toast);
  const view = $derived(state.view ?? (state.admin ? "accounts" : "setup"));
  const heading = $derived(
    view === "overview"
      ? "navOverview"
      : view === "accounts"
        ? "navAccounts"
        : view === "connections"
          ? "navConnections"
          : view === "system"
            ? "navSystem"
            : "requirementsPage",
  );
  const links = [
    ["/icloud/admin", "navOverview", "overview"],
    ["/icloud/admin/accounts", "navAccounts", "accounts"],
    ["/icloud/admin/connections", "navConnections", "connections"],
    ["/icloud/admin/system", "navSystem", "system"],
  ];
  onMount(() => {
    const stop = model.start();
    if (!state.admin) {
      model.systemLoading = false;
      model.accountsLoading = false;
      model.clientsLoading = false;
      if (
        ["local-owner", "remote-owner"].includes(
          new URLSearchParams(location.search).get("mode") ?? "",
        )
      )
        model.requirementDialog = "owner";
      if (state.mode === "account")
        dialogs.openCredential("app-password", { mode: "add" });
    }
    return stop;
  });
</script>

<svelte:head
  ><title>{t(state.admin ? "titleAdmin" : "titleSetup")}</title></svelte:head
>
<main
  id="wizard"
  data-admin={state.admin}
  data-view={view}
  data-sveltekit-reload
  aria-busy={model.busy}
>
  <Brand>{t("brand")}</Brand><a class="skip-link" href="#page-content"
    >{t("skipContent")}</a
  >
  {#if state.enrolled}<nav class="shell-nav" aria-label="iCloud">
      {#each links as [href, key, destination]}<a
          {href}
          aria-current={view === destination ? "page" : undefined}>{t(key)}</a
        >{/each}
    </nav>{/if}
  <label class="language" for="language"
    >{t("language")}
    <select
      id="language"
      value={locale?.current ?? "en"}
      onchange={(e) => locale?.set(e.currentTarget.value as "en" | "zh-TW")}
      ><option value="en">English</option><option value="zh-TW">繁體中文</option
      ></select
    ></label
  >
  <div id="page-content" tabindex="-1">
    <div class="page-heading">
      <h1>{t(heading)}</h1>
      {#if view === "overview"}<RefreshButton
          id="overview-refresh"
          label={t("refreshPage")}
          busy={model.busy}
          onclick={() => void model.run(() => model.refreshCard("all"))}
        />{/if}
    </div>
    {#if view === "overview" || !state.admin}<Overview
        {model}
        {dialogs}
        setup={!state.admin}
      />
    {:else if view === "accounts"}<section class="card">
        <header class="card-header">
          <h2>{t("accountsTitle")}</h2>
          <RefreshButton
            label={t("refreshAccounts")}
            busy={model.busy}
            onclick={() => void model.run(() => model.refreshCard("accounts"))}
          />
        </header>
        <div id="accounts" role="list">
          {#each model.dashboard?.accounts ?? [] as account}<article
              role="listitem"
              class="account-row"
            >
              <h3>
                {account.label === account.user
                  ? account.user
                  : account.label + " · " + account.user}
              </h3>
              <p>
                {t(
                  account.credentialStored
                    ? "credentialSaved"
                    : "credentialMissing",
                )}
              </p>
              <div class="actions">
                <button
                  type="button"
                  class="secondary"
                  onclick={() =>
                    dialogs.openCredential("app-password", {
                      accountId: account.id,
                      mode: "rotate",
                    })}>{t("editAppPassword")}</button
                ><button
                  type="button"
                  class="secondary"
                  onclick={() =>
                    dialogs.openCredential("apple-account", {
                      accountId: account.id,
                    })}>{t("openAppleSession")}</button
                ><button
                  type="button"
                  class="danger"
                  onclick={() => (model.revokeAccount = account.id)}
                  >{t("revoke")}</button
                >
              </div>
            </article>{/each}
        </div>
        <button
          type="button"
          class="secondary"
          onclick={() =>
            dialogs.openCredential("app-password", { mode: "add" })}
          >{t("addAccount")}</button
        >
      </section>
    {:else if view === "connections"}<section class="card">
        <header class="card-header">
          <h2>{t("connectionsTitle")}</h2>
          <RefreshButton
            label={t("refreshAccounts")}
            busy={model.busy}
            onclick={() => void model.run(() => model.refreshCard("accounts"))}
          />
        </header>
        <p>{t("connectionsHelp")}</p>
        <div id="connections-list" tabindex="-1">
          <AdminDashboard {model} view="connections" />
        </div>
        <details>
          <summary>{t("registrationHistory")}</summary>
          <div id="registrations-list">
            <AdminDashboard {model} view="registrations" />
          </div>
        </details>
      </section>
      <details class="card readiness">
        <summary id="readiness-title">{t("readinessTitle")}</summary>
        <p>{t("readinessHelp")}</p>
        <label for="readiness-account">{t("readinessAccount")}</label><select
          id="readiness-account"
          bind:value={model.readinessAccount}
          ><option value="">{t("chooseContext")}</option
          >{#each model.dashboard?.accounts ?? [] as account}<option
              value={account.id}>{account.label + " · " + account.user}</option
            >{/each}</select
        ><label for="readiness-client">{t("readinessClient")}</label><select
          id="readiness-client"
          bind:value={model.readinessClient}
          ><option value="">{t("chooseContext")}</option
          >{#each model.clients ?? [] as client}<option value={client.clientId}
              >{client.name ?? client.clientId}</option
            >{/each}</select
        >
        <div id="readiness-results">
          <AdminDashboard {model} view="readiness" />
        </div>
      </details>
    {:else if view === "system"}<section class="card">
        <header class="card-header">
          <h2>{t("systemTitle")}</h2>
          <RefreshButton
            id="system-refresh"
            label={t("refreshService")}
            busy={model.busy}
            onclick={() => void model.run(() => model.refreshCard("service"))}
          />
        </header>
        <p>{t("systemHelp")}</p>
        <div id="system-content"><AdminDashboard {model} view="system" /></div>
        <div class="actions">
          <button
            class="secondary"
            onclick={() => (model.requirementDialog = "tailscale")}
            >{t("tailscaleSetup")}</button
          >{#if state.photosConfigured}<button
              class="secondary"
              onclick={() => (model.requirementDialog = "photos")}
              >{t("photosPermissions")}</button
            >{/if}
        </div>
      </section>{/if}
  </div>
  <noscript><p class="error">{t("noScript")}</p></noscript>
</main>
<ModuleDialog {model} {dialogs} /><RequirementDialog {model} />
<Modal
  open={!!model.pendingConnection}
  title={t(
    model.pendingConnection?.action === "upgrade"
      ? "reviewCapabilities"
      : "connectionImpact",
  )}
  onclose={() => (model.pendingConnection = undefined)}
  busy={model.busy}
  ><div id="connection-confirm">
    <div id="connection-impact"><AdminDashboard {model} view="impact" /></div>
    <div class="actions">
      <button
        id="connection-confirm-yes"
        type="button"
        class={model.pendingConnection?.action === "upgrade"
          ? "primary"
          : "danger"}
        disabled={model.busy}
        onclick={() => void model.run(() => model.confirmConnection())}
        >{t(
          model.pendingConnection?.action === "upgrade"
            ? "confirmCapabilityUpgrade"
            : "confirmConnectionAction",
        )}</button
      ><button
        id="connection-confirm-no"
        type="button"
        class="secondary"
        disabled={model.busy}
        onclick={() => (model.pendingConnection = undefined)}
        >{t("cancel")}</button
      >
    </div>
  </div></Modal
>
<Modal
  open={!!model.revokeAccount}
  title={t("revokeTitle")}
  onclose={() => (model.revokeAccount = "")}
  busy={model.busy}
  ><p>{t("revokeIntro")}</p>
  <p>
    {model.dashboard?.accounts.find(
      (account) => account.id === model.revokeAccount,
    )?.user}
  </p>
  <div class="actions">
    <button
      class="danger"
      disabled={model.busy}
      onclick={() => void model.run(() => model.revoke(), "revoking")}
      >{t("revokeYes")}</button
    ><button
      class="secondary"
      disabled={model.busy}
      onclick={() => (model.revokeAccount = "")}>{t("cancel")}</button
    >
  </div></Modal
>

<style>
  .page-heading,
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .page-heading {
    margin-bottom: 1rem;
  }
  .page-heading h1 {
    margin: 0;
  }
  .card-header h2 {
    margin: 0;
  }
  .account-row {
    padding: 0.75rem 0;
    border-top: 1px solid var(--ui-border);
  }
  .account-row h3 {
    padding: 0;
    margin: 0;
    border: 0;
  }
</style>
