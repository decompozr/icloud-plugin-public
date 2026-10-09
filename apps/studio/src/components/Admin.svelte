<script lang="ts">
  import AccountCard from "@decompozr/account/ui/AccountCard.svelte";
  import ActionButton from "@decompozr/ui/components/ActionButton.svelte";
  import { spacing } from "@decompozr/ui/design-system/spacing.js";
  import { controlMetrics } from "@decompozr/ui/design-system/controlMetrics.js";
  import { getContext, onMount, tick, untrack } from "svelte";
  import type { AdminState, UiCopy } from "../contracts.js";
  import { AdminModel } from "../lib/admin-model.svelte.js";
  import {
    ToastCenter,
    DialogCenter,
    type LocaleControl,
    type NavigationControl,
  } from "../lib/ui-state.svelte.js";
  import Icon from "@decompozr/ui/components/Icon.svelte";
  import Overview from "./Overview.svelte";
  import AdminDashboard from "./AdminDashboard.svelte";
  import ModuleDialog from "./ModuleDialog.svelte";
  import RequirementDialog from "./RequirementDialog.svelte";
  import Modal from "@decompozr/ui/components/Modal.svelte";
  import DesignIcon from "@decompozr/ui/components/DesignIcon.svelte";
  import LanguageMenu from "./LanguageMenu.svelte";
  import SystemReset from "./SystemReset.svelte";
  import RefreshButton from "@decompozr/ui/components/RefreshButton.svelte";
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
      document.getElementById("page-content")?.scrollTo({ top: 0 });
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
  style:--shell-gap={spacing[4]}
  style:--shell-inset={spacing[4]}
  style:--shell-rail={controlMetrics.coarseTarget}
>
  <a class="skip-link" href="#page-content">{t("skipContent")}</a>
  <div class="admin-layout">
    <div class="nav-bar">
      <div class="nav-brand" title={t("brand")}>
        <Icon name="brand" /><span class="sr-only">{t("brand")}</span>
      </div>
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
              aria-label={t(key) +
                (destination === "connections" &&
                model.connectionsNeedingReview.length
                  ? ` · ${model.connectionsNeedingReview.length} ${t("connectionUpdatesCountLabel")}`
                  : "")}
              onclick={(event) => tabNavigation(destination, href, event)}
              aria-disabled={model.busy || navigating || toast.dialogs > 0 || undefined}
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
              />{#if destination === "connections" && model.connectionsNeedingReview.length}<span
                  class="connection-warning-badge"
                  aria-hidden="true"
                  data-testid="connection-warning-count"
                  >{model.connectionsNeedingReview.length}</span
                >{/if}</a
            >{/each}
        </nav>{/if}
      <div class="nav-language"><LanguageMenu rail /></div>
    </div>
    <div id="page-content" tabindex="-1">
      <div class="page-heading">
        <div class="page-title"><h1>{t(heading)}</h1>

        </div>
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
          onconnections={() => void navigate("connections", "/icloud/admin/connections")}
        />
      {:else if view === "accounts"}<section class="card">
          <header class="card-header">
            <h2>{t("accountsTitle")}</h2>
            <div class="card-tools">
              <ActionButton
                icon="plus"
                label={t("addAccount")}
                disabled={model.busy}
                onclick={() =>
                  dialogs.openCredential("app-password", { mode: "add" })}
              />
              <RefreshButton
                label={t("refreshAccounts")}
                busy={model.busy}
                onclick={() => model.run(() => model.refreshCard("accounts"))}
              />
            </div>
          </header>
          <div id="accounts" class="account-list" role="list">
            {#each model.dashboard?.accounts ?? [] as account (account.id)}
              <AccountCard {account} {dialogs} busy={model.busy}
                sessionPhase={model.webSessions[account.id]?.phase}
                sessionAvailable={!!model.state.photosCloudConfigured}
                onrevoke={(id)=>{model.revokeAccount=id}} />
            {/each}
          </div>
          {#if model.dashboard && !model.dashboard.accounts.length}<p
              class="muted"
            >
              {t("noAccountYet")}
            </p><div class="actions"><ActionButton showLabel icon="plus" label={t("addAccount")} disabled={model.busy} onclick={() => dialogs.openCredential("app-password", { mode: "add" })} /></div>{/if}
          {#if model.dashboardFailed || model.diagnosticsFailed}<p
              class="muted"
              role="status"
            >
              {t("freshnessFailed")}
            </p>{/if}
        </section>
      {:else if view === "connections"}<section class="card">
          <header class="card-header">
            <h2>{t("connectionsTitle")}</h2>
            <RefreshButton
              label={t("refreshAccounts")}
              busy={model.busy}
              onclick={() => model.run(() => model.refreshCard("accounts"))}
            />
          </header>
          <details>
            <summary>{t("photosPermissionHelpShort")}</summary>
            <p>{t("connectionsHelp")}</p>
          </details>
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

          <div id="system-content">
            <AdminDashboard {model} view="system" />
          </div>
          <SystemReset available={pageState.resetAvailable} />
          <div class="actions">
            <ActionButton
              class="secondary"
              showLabel
              onclick={() => (model.requirementDialog = "tailscale")}
              label={t("tailscaleSetup")}
              icon="settings"
            />{#if pageState.photosConfigured}<ActionButton
                class="secondary"
                showLabel
                onclick={() => (model.requirementDialog = "photos")}
                label={t("photosPermissions")}
                icon="settings"
              />{/if}
          </div>
        </section>{/if}
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
      <ActionButton
        showLabel
        id="connection-confirm-yes"
        type="button"
        class={model.pendingConnection?.action === "upgrade"
          ? "primary"
          : "danger"}
        disabled={model.busy}
        onclick={() => void model.run(() => model.confirmConnection())}
        label={t(
          model.pendingConnection?.action === "upgrade"
            ? "confirmCapabilityUpgrade"
            : "confirmConnectionAction",
        )}
        icon="check"
      /><ActionButton
        showLabel
        id="connection-confirm-no"
        type="button"
        class="secondary"
        disabled={model.busy}
        onclick={() => (model.pendingConnection = undefined)}
        label={t("cancel")}
        icon="close"
      />
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
    <ActionButton
      showLabel
      class="danger"
      disabled={model.busy}
      onclick={() => void model.run(() => model.revoke(), "revoking")}
      label={t("revokeYes")}
      icon="trash-2"
    /><ActionButton
      showLabel
      class="secondary"
      disabled={model.busy}
      onclick={() => (model.revokeAccount = "")}
      label={t("cancel")}
      icon="close"
    />
  </div></Modal
>

<style>
  main {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .nav-brand {
    height: 44px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.5rem;
  }
  .nav-language {
    margin-top: auto;
    padding-top: 0.5rem;
  }
  #page-content {
    grid-column: 2;
    width: 100%;
    height: 100%;
    max-width: none;
    margin: 0;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
    padding: var(--shell-inset);
    padding-left: 0;
    padding-right: max(var(--shell-inset), env(safe-area-inset-right, 0px));
    padding-bottom: max(var(--shell-inset), env(safe-area-inset-bottom, 0px));
  }

  .admin-layout {
    display: grid;
    grid-template-columns: var(--shell-rail) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: var(--shell-gap);
    height: 100%;
    min-height: 0;
    padding-left: env(safe-area-inset-left, 0px);
  }
  .nav-bar {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-top: var(--shell-inset);
    padding-bottom: max(var(--shell-inset), env(safe-area-inset-bottom, 0px));
    overflow: visible;
    width: var(--shell-rail);
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
  @media (max-height: 320px) {
    .nav-brand {
      display: none;
    }
    .nav-language {
      padding-top: 0;
    }
  }
</style>
