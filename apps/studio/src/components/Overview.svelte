<script lang="ts">
  import ServiceCapabilities from './ServiceCapabilities.svelte';
  import NextStep from "./NextStep.svelte";
  import AccountCard from "@decompozr/account/ui/AccountCard.svelte";
  import Tag from "@decompozr/ui/design-system/Tag.svelte";
  import { controlMetrics } from "@decompozr/ui/design-system/controlMetrics.js";
  import { spacing } from "@decompozr/ui/design-system/spacing.js";
  import ActionButton from "@decompozr/ui/components/ActionButton.svelte";
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import CopyButton from "@decompozr/ui/components/CopyButton.svelte";
  import RefreshButton from "@decompozr/ui/components/RefreshButton.svelte";
  import Skeleton from "@decompozr/ui/components/Skeleton.svelte";
  import DesignIcon from "@decompozr/ui/components/DesignIcon.svelte";
  let {
    model,
    dialogs,
    setup = false,
    onconnections = () => {},
  }: { model: AdminModel; dialogs: DialogCenter; setup?: boolean; onconnections?: () => void } = $props();
  const { t } = getContext<UiCopy>("copy");
  let capabilityRegion: HTMLElement | undefined = $state();
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
  function revealCapabilities() {
    if (!capabilityRegion) return;
    capabilityRegion.focus({ preventScroll: true });
    capabilityRegion.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  function openModule(id: string, enable?: boolean) {
    model.discardPolicy();
    model.moduleDialog = id;
    if (enable === true && "read" in (model.draft[id] ?? {}))
      model.toggle(id, "read", true);
    if (enable === false) model.toggleAll(id, false);
  }
</script>

<div class="overview-grid">
  {#if model.state.admin}<NextStep {model} {dialogs} {onconnections} oncapabilities={revealCapabilities} />{/if}
  <section
    class="card"
    data-testid="service-card"
    aria-busy={model.systemLoading}
  >
    <header>
      <div class="card-heading"><h2>{t("serviceCard")}</h2>{#if model.systemStale}<Tag label={t("snapshotStale")} />{/if}</div>
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
      <div class="card-heading"><h2>{t("accountsCard")}</h2>{#if model.dashboardFailed}<Tag label={t("snapshotStale")} />{/if}</div>
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
  <ServiceCapabilities {model} {modules} {openModule} bind:region={capabilityRegion}/>
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
    font-size: inherit;
  }

  .overview-grid {
    display: grid;
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
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
    grid-template-columns: max-content minmax(0, 1fr);
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
  @media (max-width: 700px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
  }
</style>
