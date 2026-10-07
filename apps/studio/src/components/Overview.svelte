<script lang="ts">
  import AccountCard from "../../../../modules/account/ui/AccountCard.svelte";
  import ModuleSwitch from "../../../../packages/ui/src/components/ModuleSwitch.svelte";
  import Tag from "../../../../packages/ui/src/design-system/Tag.svelte";
  import { scopeCopy } from "../lib/admin-model.svelte.js";
  import { controlMetrics } from "../../../../packages/ui/src/design-system/controlMetrics.js";
  import { spacing } from "../../../../packages/ui/src/design-system/spacing.js";
  import ActionButton from "../../../../packages/ui/src/components/ActionButton.svelte";
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import CopyButton from "../../../../packages/ui/src/components/CopyButton.svelte";
  import RefreshButton from "../../../../packages/ui/src/components/RefreshButton.svelte";
  import Skeleton from "../../../../packages/ui/src/components/Skeleton.svelte";
  import DesignIcon from "../../../../packages/ui/src/components/DesignIcon.svelte";
  let {
    model,
    dialogs,
    setup = false,
  }: { model: AdminModel; dialogs: DialogCenter; setup?: boolean } = $props();
  const { t } = getContext<UiCopy>("copy");
  const moduleOrder: Record<string, number> = {
    mail: 0,
    calendar: 1,
    photos: 2,
    homekit: 3,
  };
  const modules = $derived(
    [
      { id: "mail", title: "Mail" },
      ...(model.state.modules ?? []).map((m) => ({
        id: m.id,
        title: m.id === "photos" ? t("photosTitle") : m.title,
      })),
    ].sort((a, b) => (moduleOrder[a.id] ?? 99) - (moduleOrder[b.id] ?? 99)),
  );
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
          model.run(() =>
            model.state.admin ? model.refreshCard("service") : model.check(),
          )}
      />
    </header>
    {#if model.systemLoading && model.state.admin && !model.system}<Skeleton
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
        <dt>{t("runtimeFolder")}</dt>
        <dd class="runtime-path">
          <code title={model.system?.locations?.runtimeDirectory}
            >{model.system?.locations?.runtimeDirectory ??
              t("unknownValue")}</code
          ><CopyButton
            value={model.system?.locations?.runtimeDirectory}
            label={t("copyRuntimeFolder")}
          />
        </dd>
        <dt>Tailscale</dt>
        <dd>
          {t(
            tailscaleReady ? "ready" : "notReady",
          )}{#if !tailscaleReady}<ActionButton
              type="button"
              class="secondary"
              onclick={() => (model.requirementDialog = "tailscale")}
              label={t("setupRequirement")}
              icon="settings"
            />{/if}
        </dd>
      </dl>{/if}
    {#if model.systemStale}<p class="muted">{t("freshnessFailed")}</p>{/if}
  </section>
  {#if !model.state.enrolled}<section class="card">
      <header><h2>{t("requirementOwner")}</h2></header>
      <p>{t("ownerSetupHelp")}</p>
      <ActionButton
        type="button"
        class="primary"
        onclick={() => (model.requirementDialog = "owner")}
        label={t("ownerSetup")}
        icon="user"
      />
    </section>{/if}
  <section
    class="card"
    data-testid="accounts-card"
    aria-busy={model.accountsLoading && model.state.admin}
  >
    <header>
      <h2>{t("accountsCard")}</h2>
      <div class="card-tools">
        <ActionButton
          icon="plus"
          label={t("addAccount")}
          disabled={!model.state.enrolled || model.busy}
          onclick={() =>
            dialogs.openCredential("app-password", { mode: "add" })}
        /><RefreshButton
          id="accounts-refresh"
          label={t("refreshAccounts")}
          busy={model.accountsLoading || model.busy}
          onclick={() => model.run(() => model.refreshCard("accounts"))}
        />
      </div>
    </header>
    {#if model.state.admin && model.accountsLoading && !model.dashboard}<Skeleton
        rows={3}
      />{:else}
      <div
        class="counts"
        style:--count-size={controlMetrics.compact.icon}
        style:--count-gap={spacing[2]}
        style:--count-group-gap={spacing[6]}
      >
        <div title={t("accountNumber")}>
          <DesignIcon name="user" size={controlMetrics.compact.icon} /><strong
            >{model.dashboard?.accounts.length ?? 0}</strong
          ><span class="sr-only">{t("accountNumber")}</span>
        </div>
        <div title={t("authorizedNumber")}>
          <DesignIcon
            name="connection"
            size={controlMetrics.compact.icon}
          /><strong
            >{model.connections
              ? model.connections.length
              : t("unknownValue")}</strong
          ><span class="sr-only">{t("authorizedNumber")}</span>
        </div>
      </div>
      <div class="account-list" role="list">
        {#each model.dashboard?.accounts ?? [] as account (account.id)}<AccountCard
            {account} {dialogs}
            busy={model.busy}
            sessionPhase={model.webSessions[account.id]?.phase}
            sessionAvailable={!!model.state.photosCloudConfigured}
            onrevoke={(id)=>{model.revokeAccount=id}}
          />{/each}
      </div>
      {#if model.dashboard && !model.dashboard.accounts.length}<p class="muted">
          {t("noAccountYet")}
        </p>{/if}
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
        onclick={() => model.run(() => model.refreshCard("capabilities"))}
      />
    </header>

    {#if model.state.admin && model.accountsLoading && !model.dashboard}<Skeleton
        rows={3}
      />{:else}{#each modules as module}{@const policy = model.saved[module.id]}
        <div class="module-summary">
          <div>
            <h3>{module.title}</h3>
            <div class="module-statuses">
              <Tag
                tone={policy && Object.values(policy).some(Boolean)
                  ? "sage"
                  : "neutral"}
                label={t(
                  !policy
                    ? "unknownValue"
                    : Object.values(policy).some(Boolean)
                      ? "moduleEnabled"
                      : "moduleDisabled",
                )}
              />
              {#each Object.entries(policy ?? {}).filter(([, enabled]) => enabled) as [key]}
                <Tag label={t(scopeCopy[module.id + "." + key] ?? key)} />
              {/each}
            </div>
          </div>
          <div class="actions">
            <ModuleSwitch
              label={t("moduleEnable") + " " + module.title}
              enabled={!!policy && Object.values(policy).some(Boolean)}
              disabled={!model.state.enrolled || model.busy || !policy}
              onchange={(enable) => openModule(module.id, enable)}
            />
            <ActionButton
              icon="settings"
              label={t("moduleConfigure") + " " + module.title}
              disabled={!model.state.enrolled || model.busy}
              onclick={() => openModule(module.id)}
            />
          </div>
        </div>{/each}{/if}

    {#if modules.some((module) => module.id === "photos")}<p
        class="muted"
        data-testid="photos-shared-write-unsupported"
      >
        {t("photosUnsupported")}
      </p>{/if}
    {#if model.dashboardFailed}<p class="muted">{t("freshnessFailed")}</p>{/if}
  </section>
</div>

<style>
  .runtime-path {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }
  .runtime-path code {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
  }

  .overview-grid {
    display: grid;
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
    align-items: center;
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
    display: flex;
    gap: var(--count-group-gap);
    padding: 0 0 1rem;
  }
  .counts div {
    display: flex;
    align-items: center;
    gap: var(--count-gap);
  }
  .counts strong {
    font-size: var(--count-size);
    line-height: 1;
    font-weight: 500;
  }
  .module-statuses {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .module-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    border-top: 1px solid var(--ui-border);
    padding: 0.75rem 0;
  }
  .module-summary h3 {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .module-summary .actions {
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
