<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import RefreshButton from "./RefreshButton.svelte";
  import Skeleton from "./Skeleton.svelte";
  let {
    model,
    dialogs,
    setup = false,
  }: { model: AdminModel; dialogs: DialogCenter; setup?: boolean } = $props();
  const { t } = getContext<UiCopy>("copy");
  const modules = $derived([
    { id: "mail", title: "Mail" },
    ...(model.state.modules ?? []).map((m) => ({
      id: m.id,
      title: m.id === "photos" ? t("photosTitle") : m.title,
    })),
  ]);
  const network = $derived(
    model.system?.connectivity ?? model.status?.prerequisites,
  );
  const tailscaleReady = $derived(
    network &&
      ["installed", "authenticated", "online", "privateReachable"].every(
        (key) => network[key as keyof typeof network] === true,
      ),
  );
  function openModule(id: string, enable?: boolean) {
    model.discardPolicy();
    model.moduleDialog = id;
    if (enable === true && "read" in (model.draft[id] ?? {}))
      model.toggle(id, "read", true);
    if (enable === false) model.toggleAll(id, false);
  }
</script>

<div class="overview-grid">
  <section
    class="card"
    data-testid="service-card"
    aria-busy={model.systemLoading}
  >
    <header>
      <h2>{t("serviceCard")}</h2>
      <RefreshButton
        id="service-refresh"
        label={t("refreshService")}
        busy={model.state.admin
          ? model.systemLoading || model.busy
          : model.busy}
        onclick={() =>
          void model.run(() =>
            model.state.admin ? model.refreshCard("service") : model.check(),
          )}
      />
    </header>
    {#if model.systemLoading && model.state.admin}<Skeleton
        rows={3}
      />{:else}<dl>
        <dt>{t("serviceVersion")}</dt>
        <dd>{model.system?.process.version ?? t("unknownValue")}</dd>
        <dt>{t("serviceStatus")}</dt>
        <dd>
          {t(
            model.system
              ? "running"
              : model.state.ready
                ? "ready"
                : "unknownValue",
          )}
        </dd>
        <dt>Tailscale</dt>
        <dd>
          {t(tailscaleReady ? "ready" : "notReady")}{#if !tailscaleReady}<button
              type="button"
              class="secondary"
              onclick={() => (model.requirementDialog = "tailscale")}
              >{t("setupRequirement")}</button
            >{/if}
        </dd>
      </dl>{/if}
    {#if model.systemStale}<p class="muted">{t("freshnessFailed")}</p>{/if}
  </section>
  {#if !model.state.enrolled}<section class="card">
      <header><h2>{t("requirementOwner")}</h2></header>
      <p>{t("ownerSetupHelp")}</p>
      <button
        type="button"
        class="primary"
        onclick={() => (model.requirementDialog = "owner")}
        >{t("ownerSetup")}</button
      >
    </section>{/if}
  <section
    class="card"
    data-testid="accounts-card"
    aria-busy={model.accountsLoading && model.state.admin}
  >
    <header>
      <h2>{t("accountsCard")}</h2>
      <RefreshButton
        id="accounts-refresh"
        label={t("refreshAccounts")}
        busy={model.accountsLoading || model.busy}
        onclick={() => void model.run(() => model.refreshCard("accounts"))}
      />
    </header>
    {#if model.state.admin && model.accountsLoading}<Skeleton rows={3} />{:else}
      <div class="counts">
        <div>
          <span>{t("accountNumber")}</span><strong
            >{model.dashboard?.accounts.length ?? 0}</strong
          >
        </div>
        <div>
          <span>{t("authorizedNumber")}</span><strong
            >{model.connections
              ? model.connections.length
              : t("unknownValue")}</strong
          >
        </div>
      </div>
      {#each model.dashboard?.accounts ?? [] as account (account.id)}<article
          class="account"
        >
          <h3>
            {account.label === account.user ? account.user : account.label}
          </h3>
          {#if account.label !== account.user}<p class="muted">
              {account.user}
            </p>{/if}
          <div class="credential-status">
            <span
              >{t("appPasswordStatus")}: {t(
                account.credentialStored ? "ready" : "notReady",
              )}</span
            ><button
              type="button"
              class="secondary"
              onclick={() =>
                dialogs.openCredential("app-password", {
                  accountId: account.id,
                  mode: "rotate",
                })}
              >{t(
                account.credentialStored
                  ? "editAppPassword"
                  : "openAppPassword",
              )}</button
            >
          </div>
          <div class="credential-status">
            <span
              >{t("appleSessionStatus")}: {t(
                model.webSessions[account.id]?.phase === "authenticated"
                  ? "sessionAuthenticated"
                  : model.webSessions[account.id]?.phase
                    ? "sessionMissing"
                    : "sessionUnknown",
              )}</span
            ><button
              type="button"
              class="secondary"
              onclick={() =>
                dialogs.openCredential("apple-account", {
                  accountId: account.id,
                })}>{t("openAppleSession")}</button
            >
          </div>
        </article>{/each}
      {#if !model.dashboard?.accounts.length}<p class="muted">
          {t("noAccountYet")}
        </p>{/if}<button
        type="button"
        class="secondary"
        disabled={!model.state.enrolled}
        onclick={() => dialogs.openCredential("app-password", { mode: "add" })}
        >{t("addAccount")}</button
      >
    {/if}{#if model.dashboardFailed || model.diagnosticsFailed}<p class="muted">
        {t("freshnessFailed")}
      </p>{/if}
  </section>
  <section
    class="card wide"
    data-testid="capabilities-card"
    aria-busy={model.accountsLoading}
  >
    <header>
      <h2>{t("capabilitiesCard")}</h2>
      <RefreshButton
        id="capabilities-refresh"
        label={t("refreshCapabilities")}
        busy={model.accountsLoading || model.busy}
        onclick={() => void model.run(() => model.refreshCard("capabilities"))}
      />
    </header>
    <p class="muted">{t("capabilitiesDisabledDefault")}</p>
    {#if model.state.admin && model.accountsLoading}<Skeleton
        rows={3}
      />{:else}{#each modules as module}{@const policy = model.saved[module.id]}
        <div class="module-summary">
          <div>
            <h3>{module.title}</h3>
            <p>
              {t(
                policy && Object.values(policy).some(Boolean)
                  ? "moduleEnabled"
                  : "moduleDisabled",
              )} · {t("moduleScopesSummary")}: {policy
                ? Object.values(policy).filter(Boolean).length
                : 0}
            </p>
          </div>
          <div class="actions">
            <label class="module-toggle"
              ><span class="sr-only">{t("moduleEnable")} {module.title}</span
              ><input
                type="checkbox"
                aria-label={t("moduleEnable") + " " + module.title}
                checked={!!policy && Object.values(policy).some(Boolean)}
                disabled={!model.state.enrolled || model.busy || !policy}
                onchange={(e) => {
                  const enable = e.currentTarget.checked;
                  e.currentTarget.checked =
                    !!policy && Object.values(policy).some(Boolean);
                  openModule(module.id, enable);
                }}
              /></label
            ><button
              type="button"
              class="secondary"
              disabled={!model.state.enrolled || model.busy}
              onclick={() => openModule(module.id)}
              >{t("moduleConfigure")}</button
            >
          </div>
        </div>{/each}{/if}
    {#if model.dashboardFailed}<p class="muted">{t("freshnessFailed")}</p>{/if}
  </section>
</div>

<style>
  .overview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .card {
    padding: 1.25rem;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    margin: 0;
  }
  .wide {
    grid-column: 1/-1;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  h2 {
    margin: 0;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 0.75rem;
    margin: 0;
  }
  dt {
    color: var(--ui-muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .counts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .counts div {
    display: grid;
    gap: 0.5rem;
  }
  .counts span {
    color: var(--ui-muted);
    font-size: 0.8125rem;
  }
  .counts strong {
    font-size: 1.5rem;
    font-weight: 500;
  }
  .account {
    border-top: 1px solid var(--ui-border);
    padding: 0.75rem 0;
  }
  .account h3 {
    border: 0;
    padding: 0;
    margin: 0.25rem 0;
  }
  .credential-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.8125rem;
  }
  .module-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    border-top: 1px solid var(--ui-border);
    padding: 0.75rem 0;
  }
  .module-summary h3 {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .module-summary p {
    margin: 0.25rem 0;
    color: var(--ui-muted);
    font-size: 0.8125rem;
  }
  .module-summary .actions {
    margin: 0;
  }
  .module-toggle {
    margin: 0;
  }
  @media (max-width: 700px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
    .card {
      padding: 1rem;
    }
  }
</style>
