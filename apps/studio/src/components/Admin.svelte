<script lang="ts">
  import { getContext, onMount, tick, untrack } from "svelte";
  import type { AdminState, UiCopy } from "../contracts.js";
  import { AdminModel } from "../lib/admin-model.svelte.js";
  import {
    ToastCenter,
    DialogCenter,
    type LocaleControl,
    type NavigationControl,
  } from "../lib/ui-state.svelte.js";
  import Icon from "./Icon.svelte";
  import Overview from "./Overview.svelte";
  import AdminDashboard from "./AdminDashboard.svelte";
  import ModuleDialog from "./ModuleDialog.svelte";
  import RequirementDialog from "./RequirementDialog.svelte";
  import Modal from "./Modal.svelte";
  import DesignIcon from "./DesignIcon.svelte";
  import LanguageMenu from "./LanguageMenu.svelte";
  import HomeKitSetup from './HomeKitSetup.svelte';
  import SystemReset from "./SystemReset.svelte";
  import RefreshButton from "./RefreshButton.svelte";
  let { state: pageState }: { state: AdminState } = $props();
  const copy = getContext<UiCopy>("copy"),
    { t } = copy,
    locale = getContext<LocaleControl>("locale");
  const toast = getContext<ToastCenter>("toast") ?? new ToastCenter(),
    dialogs = getContext<DialogCenter>("dialogs") ?? new DialogCenter();
  // svelte-ignore state_referenced_locally
  const model = new AdminModel(pageState, copy, toast);
  // svelte-ignore state_referenced_locally
  let view = $state(pageState.view ?? (pageState.admin ? "accounts" : "setup"));
  const router = getContext<NavigationControl>("navigation");
  let navigationGeneration = 0;
  let navigating = $state(false),
    markerTop = $state(0),
    markerHeight = $state(0);
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
  let navigation = $state<HTMLElement>();
  const links = [
    ["/icloud/admin", "navOverview", "overview"],
    ["/icloud/admin/accounts", "navAccounts", "accounts"],
    ["/icloud/admin/connections", "navConnections", "connections"],
    ["/icloud/admin/system", "navSystem", "system"],
  ];
  function updateMarker() {
    const current = navigation?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (current) {
      markerTop = current.offsetTop;
      markerHeight = current.offsetHeight;
    }
  }
  async function navigate(destination: string, href: string, push = true) {
    const restore = () => {
      if (!push) {
        const current = links.find(([, , key]) => key === view);
        if (current) {
          if (router) router.replace(current[0]!);
          else history.replaceState(null, "", current[0]);
        }
      }
    };
    if (model.busy || toast.dialogs > 0) {
      restore();
      return;
    }
    if (model.hasDraft && !window.confirm(t("discardNavigation"))) {
      restore();
      return;
    }
    const generation = ++navigationGeneration;
    navigating = true;
    try {
      const response = await fetch("/icloud/admin/status", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (generation !== navigationGeneration) {
        void response.body?.cancel();
        return;
      }
      if (response.status === 401 || response.status === 403) {
        model.dashboard = undefined;
        model.system = undefined;
        model.clients = undefined;
        model.connections = undefined;
        dialogs.closeCredential();
        location.replace("/icloud/sign-in");
        return;
      }
      if (!response.ok) throw Error();
      const next = await response.json();
      if (generation !== navigationGeneration) return;
      if (toast.dialogs > 0 || model.busy) {
        restore();
        return;
      }
      model.acceptDashboard(next);
      dialogs.closeCredential();
      model.moduleDialog = undefined;
      model.requirementDialog = undefined;
      model.pendingConnection = undefined;
      model.revokeAccount = "";
      model.discardPolicy();
      model.activeView = destination as AdminState["view"];
      view = destination as typeof view;
      if (push && location.pathname !== href)
        router ? router.push(href) : history.pushState(null, "", href);
      await tick();
      updateMarker();
      void model.refreshAll();
    } catch {
      if (generation !== navigationGeneration) return;
      if (!push) {
        const current = links.find(([, , key]) => key === view);
        if (current)
          router
            ? router.replace(current[0]!)
            : history.replaceState(null, "", current[0]);
      }
      toast.push("statusError", "error");
    } finally {
      if (generation === navigationGeneration) navigating = false;
    }
  }
  function tabNavigation(destination: string, href: string, event: MouseEvent) {
    if (
      !pageState.admin ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void navigate(destination, href);
  }
  $effect(() => {
    void view;
    if (navigation)
      untrack(() => {
        void tick().then(updateMarker);
      });
  });
  onMount(() => {
    const stop = model.start();
    const pop = () => {
      const target = links.find(([href]) => href === location.pathname);
      if (target) void navigate(target[2]!, target[0]!, false);
      else location.reload();
    };
    window.addEventListener("popstate", pop);
    const resize = new ResizeObserver(updateMarker);
    if (navigation) resize.observe(navigation);
    void document.fonts.ready.then(updateMarker);

    updateMarker();

    if (!pageState.admin) {
      model.systemLoading = false;
      model.accountsLoading = false;
      model.clientsLoading = false;
      if (
        ["local-owner", "remote-owner"].includes(
          new URLSearchParams(location.search).get("mode") ?? "",
        )
      )
        model.requirementDialog = "owner";
      if (pageState.mode === "account")
        dialogs.openCredential("app-password", { mode: "add" });
    }
    return () => {
      stop();
      resize.disconnect();
      window.removeEventListener("popstate", pop);
    };
  });
</script>

<svelte:head
  ><title>{t(pageState.admin ? "titleAdmin" : "titleSetup")}</title
  ></svelte:head
>
<main
  id="wizard"
  data-admin={pageState.admin}
  data-view={view}
  data-sveltekit-reload
  aria-busy={model.busy}
>
  <a class="skip-link" href="#page-content"
    >{t("skipContent")}</a
  >
  <div class="admin-layout">
    <div class="nav-bar">
      <div class="nav-brand" title={t("brand")}><Icon name="brand"/><span class="sr-only">{t("brand")}</span></div>
      {#if pageState.enrolled}<nav
          class="shell-nav"
          aria-label="iCloud"
          bind:this={navigation}
          aria-busy={navigating}
        >
          <span
            class="active-indicator"
            aria-hidden="true"
            style:top={markerTop + "px"}
            style:height={markerHeight + "px"}
          ></span>
          {#each links as [href, key, destination]}<a
              {href}
              title={t(key)}
              aria-label={t(key)}
              onclick={(event) => tabNavigation(destination, href, event)}
              aria-current={view === destination ? "page" : undefined}
              ><DesignIcon
                name={destination === "overview"
                  ? "panels-top-left"
                  : destination === "accounts"
                    ? "user"
                    : destination === "connections"
                      ? "connection"
                      : "settings"}
                size="1.25rem"
              /></a
            >{/each}
        </nav>{/if}
      <div class="nav-language"><LanguageMenu rail /></div>
    </div>
    <div id="page-content" tabindex="-1">
      <div class="page-heading">
        <h1>{t(heading)}</h1>
        {#if view === "overview"}<RefreshButton
            id="overview-refresh"
            label={t("refreshPage")}
            busy={model.busy}
            onclick={() => model.run(() => model.refreshCard("all"))}
          />{/if}
      </div>
      {#if view === "overview" || !pageState.admin}<Overview
          {model}
          {dialogs}
          setup={!pageState.admin}
        />
      {:else if view === "accounts"}<section class="card">
          <header class="card-header">
            <h2>{t("accountsTitle")}</h2>
            <RefreshButton
              label={t("refreshAccounts")}
              busy={model.busy}
              onclick={() =>
                model.run(() => model.refreshCard("accounts"))}
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
              onclick={() =>
                model.run(() => model.refreshCard("accounts"))}
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
                value={account.id}
                >{account.label + " · " + account.user}</option
              >{/each}</select
          ><label for="readiness-client">{t("readinessClient")}</label><select
            id="readiness-client"
            bind:value={model.readinessClient}
            ><option value="">{t("chooseContext")}</option
            >{#each model.clients ?? [] as client}<option
                value={client.clientId}>{client.name ?? client.clientId}</option
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
              onclick={() => model.run(() => model.refreshCard("service"))}
            />
          </header>
          <p>{t("systemHelp")}</p>
          <div id="system-content">
            <AdminDashboard {model} view="system" />
          </div>
          <SystemReset available={pageState.resetAvailable} />
          <div class="actions">
            <button
              class="secondary"
              onclick={() => (model.requirementDialog = "tailscale")}
              >{t("tailscaleSetup")}</button
            >{#if pageState.photosConfigured}<button
                class="secondary"
                onclick={() => (model.requirementDialog = "photos")}
                >{t("photosPermissions")}</button
              >{/if}
          </div>
        </section>{#if pageState.homekitConfigured}<HomeKitSetup />{/if}{/if}
    </div>
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
  main { max-width: none; margin-top: 1rem; padding-left: env(safe-area-inset-left, 0px); }
  .nav-brand { height:44px; flex:none; display:flex; align-items:center; justify-content:center; margin-bottom:.5rem; }
  .nav-language { margin-top:auto; padding-top:.5rem; }
  #page-content { width: 100%; max-width: 60rem; margin-inline: auto; min-width: 0; }

  .admin-layout {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }
  .nav-bar {
    display:flex;
    flex-direction:column;
    height:calc(100svh - 2rem);
    padding-bottom:env(safe-area-inset-bottom, 0px);
    overflow-y:auto;
    position: sticky;
    top: 1rem;
    margin: 0;
  }
  .nav-bar .shell-nav {
    margin: 0;
    border: 0;
  }

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
