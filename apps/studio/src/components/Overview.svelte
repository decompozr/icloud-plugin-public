<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import RefreshButton from "./RefreshButton.svelte";
  import Skeleton from "./Skeleton.svelte";
  import Icon from "./Icon.svelte";
 import DesignIcon from './DesignIcon.svelte';
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
        <dt>{t('runtimeFolder')}</dt><dd class="runtime-path" title={model.system?.locations?.runtimeDirectory}><code>{model.system?.locations?.runtimeDirectory??t('unknownValue')}</code></dd>
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
      <div class="card-tools"><button type="button" class="secondary icon-button" aria-label={t('addAccount')} title={t('addAccount')} disabled={!model.state.enrolled} onclick={()=>dialogs.openCredential('app-password',{mode:'add'})}><DesignIcon name="plus"/></button><RefreshButton id="accounts-refresh" label={t("refreshAccounts")} busy={model.accountsLoading||model.busy} onclick={()=>void model.run(()=>model.refreshCard('accounts'))}/></div>
    </header>
    {#if model.state.admin&&model.accountsLoading&&!model.dashboard}<Skeleton rows={3}/>{:else}
      <div class="counts"><div><strong>{model.dashboard?.accounts.length??0}</strong><span>{t('accountNumber')}</span></div><div><strong>{model.connections?model.connections.length:t('unknownValue')}</strong><span>{t('authorizedNumber')}</span></div></div>
      {#each model.dashboard?.accounts??[] as account(account.id)}
        {@const savedSession=model.webSessions[account.id]?.phase==='authenticated'}
        <article class="account">
          <div class="account-identity"><span class="account-avatar" aria-hidden="true">{(account.label||account.user).slice(0,1).toUpperCase()}</span><div><h3>{account.label===account.user?account.user:account.label}</h3>{#if account.label!==account.user}<p class="muted">{account.user}</p>{/if}</div></div>
          <div class="credential-controls">
            <button type="button" class="secondary credential-control" title={t('appPasswordStatus')+': '+t(account.credentialStored?'ready':'notReady')} aria-label={t(account.credentialStored?'editAppPassword':'openAppPassword')} onclick={()=>dialogs.openCredential('app-password',{accountId:account.id,mode:'rotate'})}>
              <DesignIcon name="pencil"/><span>{t('appPasswordShort')}</span><span class="credential-pill" class:ready={account.credentialStored}>{t(account.credentialStored?'credentialStoredShort':'credentialMissingShort')}</span>
            </button>
            <button type="button" class="secondary credential-control" title={t('appleSessionStatus')+': '+t(savedSession?'sessionAuthenticated':model.webSessions[account.id]?.phase?'sessionMissing':'sessionUnknown')} aria-label={t(savedSession?'manageAppleSession':'openAppleSession')} onclick={()=>dialogs.openCredential('apple-account',{accountId:account.id})}>
              <DesignIcon name="circle-dot"/><span>{t('appleSessionShort')}</span><span class="credential-pill" class:ready={savedSession}>{t(savedSession?'sessionSavedShort':model.webSessions[account.id]?.phase?'credentialMissingShort':'unknownValue')}</span>
            </button>
          </div>
        </article>
      {/each}
      {#if !model.dashboard?.accounts.length}<p class="muted">{t('noAccountYet')}</p><button type="button" class="secondary" disabled={!model.state.enrolled} onclick={()=>dialogs.openCredential('app-password',{mode:'add'})}>{t('addAccount')}</button>{/if}
    {/if}{#if model.dashboardFailed||model.diagnosticsFailed}<p class="muted">{t('freshnessFailed')}</p>{/if}
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

    {#if model.state.admin && model.accountsLoading && !model.dashboard}<Skeleton
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
            > <button type="button" class="secondary icon-button configure-button" aria-label={t('moduleConfigure')+' '+module.title} title={t('moduleConfigure')} disabled={!model.state.enrolled||model.busy} onclick={()=>openModule(module.id)}><Icon name="settings"/></button>
          </div>
        </div>{/each}{/if}
    {#if model.dashboardFailed}<p class="muted">{t("freshnessFailed")}</p>{/if}
  </section>
</div>

<style>
 .runtime-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.runtime-path code{font-size:.75rem}

 .configure-button{min-width:28px;min-height:28px;padding:5px}

  .overview-grid {
    display: grid;
    align-items:start;
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
  .card-tools{display:flex;gap:.25rem;align-items:center}.card-tools button{min-width:28px;min-height:28px;padding:5px}
  .counts{display:flex;gap:2rem;padding:.25rem 0 1rem}.counts div{display:flex;align-items:baseline;gap:.5rem}.counts span{color:var(--ui-muted);font-size:.8125rem}.counts strong{font-size:1.5rem;font-weight:500}
  .account{border-top:1px solid var(--ui-border);padding:1rem 0 0}.account+.account{margin-top:1rem}.account-identity{display:flex;gap:.75rem;align-items:center;margin-bottom:1rem;min-width:0}.account-identity>div{min-width:0}.account-avatar{width:36px;height:36px;flex:none;display:grid;place-items:center;background:var(--ui-soft);color:var(--ui-muted);border-radius:50%;font-weight:500}.account h3{border:0;padding:0;margin:0;overflow-wrap:anywhere}.account p{margin:.2rem 0 0;font-size:.8125rem;overflow-wrap:anywhere}
  .credential-controls{display:flex;flex-wrap:wrap;gap:.5rem}.credential-control{display:flex;align-items:center;gap:.5rem;min-height:36px;padding:.5rem .625rem;border:1px solid var(--ui-border);border-radius:4px;font-size:.8125rem;font-weight:400;max-width:100%;flex:1;white-space:nowrap}.credential-control :global(svg){flex:none;color:var(--ui-muted)}.credential-control:hover{background:var(--ui-soft)}.credential-pill{margin-left:auto;color:var(--ui-muted);font-size:.75rem}.credential-pill.ready{color:var(--ui-focus)}.credential-pill.ready::before{content:'✓';margin-right:.25rem}@media(max-width:400px){.credential-control{flex-basis:100%}}
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
