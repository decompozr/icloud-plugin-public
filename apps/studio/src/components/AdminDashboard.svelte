<script lang="ts">
  import DesignIcon from "./DesignIcon.svelte";
  import CopyButton from "./CopyButton.svelte";
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import { scopeCopy } from "../lib/admin-model.svelte.js";
  let { model, view }: { model: AdminModel; view: string } = $props();
  const { t } = getContext<UiCopy>("copy");
  const label = (service: string) =>
    service === "mail"
      ? "Mail"
      : t(service === "calendar" ? "calendarTitle" : "photosTitle");
  const scope = (value: string) =>
    scopeCopy[value] ? t(scopeCopy[value]) : value;
  const latest = (accountId: string, clientId: string) =>
    Object.values(model.evidence(accountId, clientId, "mail")?.reads ?? {})
      .concat(
        Object.values(
          model.evidence(accountId, clientId, "calendar")?.reads ?? {},
        ),
        Object.values(
          model.evidence(accountId, clientId, "photos")?.reads ?? {},
        ),
      )
      .sort()
      .at(-1);
</script>

{#snippet line(key: string, value: string)}<p>
    <strong>{t(key)}:</strong>{" "}{value}
  </p>{/snippet}
{#snippet snapshot(failed: boolean, stamp?: string)}{#if failed}<p
      class="error"
    >
      {t("freshnessFailed")}
    </p>{/if}{#if stamp && model.now - Date.parse(stamp) > 60000}<p
      class="muted"
    >
      {t("staleStatus")}
    </p>{/if}{#if stamp}<p class="muted">
      {t("checkedAt")}
      {new Date(stamp).toLocaleString()}
    </p>{/if}{/snippet}
{#snippet action(
  clientId: string,
  kind: "upgrade" | "revoke" | "remove",
)}<button
    type="button"
    class="secondary"
    disabled={model.busy}
    onclick={() => void model.run(() => model.preview(clientId, kind))}
    >{t(
      kind === "upgrade"
        ? "reviewCapabilities"
        : kind === "revoke"
          ? "revokeConnection"
          : "removeConnection",
    )}</button
  >{/snippet}
{#if view === "overview"}
  {#if !model.checkedAt}<p>{t("statusLoading")}</p>{/if}
  {@render line(
    "serviceState",
    model.system
      ? t("running") +
          " · " +
          (model.system.process.version ?? t("unknownValue"))
      : t("unknownValue"),
  )}
  {@render line(
    "tailscaleSummary",
    t(
      model.system?.connectivity.privateReachable
        ? "verifiedValue"
        : "notVerifiedValue",
    ),
  )}
  <div class="summary-grid">
    {@render line(
      "accountsTitle",
      String(model.dashboard?.accounts.length ?? 0),
    )}{@render line("connectionsTitle", String(model.connections?.length ?? 0))}
  </div>
  {#if model.connectionsNeedingReview.length}<p
      class="connection-warning"
      role="status"
    >
      <DesignIcon name="warning" />
      <span
        >{t("connectionUpdatesAvailable")}
        <a href="/icloud/admin/connections">{t("reviewCapabilities")}</a></span
      >
    </p>{/if}
  {#each ["mail", "calendar", "photos"] as service}{@const reads = (
      model.dashboard?.evidence ?? []
    )
      .filter(
        (row) =>
          row.service === service &&
          model.dashboard?.accounts.some((a) => a.id === row.accountId),
      )
      .flatMap((row) => Object.values(row.reads))
      .sort()}
    <p>
      <strong>{label(service)}: </strong>{reads.length
        ? t("lastSuccess") + " " + new Date(reads.at(-1)!).toLocaleString()
        : t("neverObserved")}
    </p>{/each}
  {@render snapshot(
    model.dashboardFailed || model.diagnosticsFailed || model.systemStale,
    model.checkedAt,
  )}
{:else if view === "accounts"}
  {#each model.dashboard?.accounts ?? [] as account (account.id)}<p
      role="listitem"
    >
      <button
        type="button"
        class="secondary account-choice"
        data-account-id={account.id}
        aria-pressed={model.selectedAccount === account.id}
        disabled={model.busy}
        onclick={() => model.chooseAccount(account.id)}
        >{account.label === account.user
          ? account.user
          : account.label + " · " + account.user}<span class="account-address"
          >{t(
            account.credentialStored ? "credentialSaved" : "credentialMissing",
          )}</span
        ><span class="account-address">Mail · Calendar</span></button
      >
    </p>{/each}
{:else if view === "accountDetails"}
  {#if model.dashboard?.accounts.find((a) => a.id === model.selectedAccount)}{@const account =
      model.dashboard.accounts.find(
        (a) => a.id === model.selectedAccount,
      )!}{@render line(
      "connectionAccount",
      account.label + " · " + account.user,
    )}{@render line(
      "credentialStatus",
      t(account.credentialStored ? "credentialSaved" : "credentialMissing"),
    )}
    <p class="muted">{t("serviceSummary")}</p>
    {@render snapshot(model.dashboardFailed, model.checkedAt)}{/if}
{:else if view === "connections"}
  {#if !model.connections?.length}{@render line(
      "connectionsTitle",
      t(model.connections ? "noConnections" : "statusLoading"),
    )}{/if}
  {#each model.connections ?? [] as connection (connection.clientId + "-" + connection.accountId)}{@const warning =
      model.connectionNeedsReview(connection)}
    <article>
      <h3 class="connection-heading">
        {connection.name ?? t("clientUnnamed")}{#if warning}<span
            class="connection-warning-icon"
            title={t("connectionRegistrationOutdated")}
            ><DesignIcon name="warning" /><span class="sr-only"
              >{t("connectionRegistrationOutdated")}</span
            ></span
          >{/if}
      </h3>
      {#if warning}<p class="connection-warning" role="status">
          {t("connectionRegistrationOutdated")}
        </p>{/if}
      {@render line(
        "connectionAccount",
        model.dashboard?.accounts.find((a) => a.id === connection.accountId)
          ?.user ?? t("unavailable"),
      )}{#if connection.grantedScopes.some( (s) => s.startsWith("photos.") )}{@render line(
          "photosTitle",
          t("photosLibraryContext"),
        )}{/if}{@render line(
        "grantedActions",
        connection.grantedScopes
          .filter((s) => s.includes("."))
          .map(scope)
          .join(" · "),
      )}{@render line(
        "lastSuccess",
        latest(connection.accountId, connection.clientId)
          ? new Date(
              latest(connection.accountId, connection.clientId)!,
            ).toLocaleString()
          : t("neverObserved"),
      )}
      <div class="actions">
        {#if warning}{@render action(
            connection.clientId,
            "upgrade",
          )}{/if}{@render action(connection.clientId, "revoke")}
      </div>
    </article>{/each}
  {@render snapshot(model.diagnosticsFailed, model.clientsCheckedAt)}
{:else if view === "registrations"}
  <p>{t("registeredMetadata")}</p>
  {#each model.clients ?? [] as client (client.clientId)}<article>
      <h3>{client.name ?? t("clientUnnamed")}</h3>
      {@render line("clientRegistration", client.clientId)}{@render line(
        "registeredScopes",
        client.registeredScopes.join(", "),
      )}{#if client.upgradeAvailable}{@render action(
          client.clientId,
          "upgrade",
        )}{/if}{@render action(client.clientId, "remove")}
    </article>{/each}
{:else if view === "impact" && model.pendingConnection}
  {@const p = model.pendingConnection}{@render line(
    "navConnections",
    p.impact.name ?? t("clientUnnamed"),
  )}{@render line(
    "affectedAccounts",
    p.impact.accountIds
      .map(
        (id) =>
          model.dashboard?.accounts.find((a) => a.id === id)?.user ??
          t("unavailable"),
      )
      .join(" · ") || t("noConnections"),
  )}
  {#if p.action === "upgrade"}{@render line(
      "newAvailablePermissions",
      (p.impact.additionalScopes ?? []).map(scope).join(" · "),
    )}{:else}{@render line("connectionsTitle", String(p.impact.consents))}{/if}
  {@render line(
    "grantedActions",
    [
      ...new Set(
        (model.connections ?? [])
          .filter((c) => c.clientId === p.clientId)
          .flatMap((c) => c.grantedScopes),
      ),
    ]
      .map(scope)
      .join(" · "),
  )}
  <p>
    {t(
      p.action === "upgrade" ? "capabilityUpgradeHelp" : "connectionImpactHelp",
    )}
  </p>
{:else if view === "readiness"}
  {#each model.readinessRows() as row}<article>
      <h3>{label(row.service)}</h3>
      {#if row.service === "photos"}<p>{t("photosLibraryContext")}</p>{/if}
      <dl>
        <dt>{t("configured")}</dt>
        <dd>{t(row.configured)}</dd>
        <dt>{t("authorization")}</dt>
        <dd>{row.authorization}</dd>
        <dt>{t("readVerified")}</dt>
        <dd>{row.read}</dd>
      </dl>
      <p>{t(row.guidance)}</p>
    </article>{/each}
{:else if view === "system"}
  {#if !model.system}{@render line(
      "systemTitle",
      t("unavailable"),
    )}{:else}{@const s = model.system}{@render snapshot(
      model.systemStale,
      s.checkedAt,
    )}{@render line(
      "serverProcess",
      t("running") +
        " · PID " +
        s.process.pid +
        " · " +
        s.process.uptimeSeconds +
        "s",
    )}{@render line(
      "runningVersion",
      s.process.version ?? t("unknownValue"),
    )}{@render line("runtimeVersion", s.process.runtime)}{@render line(
      "installedVersion",
      s.installed.version ?? t("unknownValue"),
    )}
    {#if s.locations}<div class="system-path">
        <strong>{t("runtimeFolder")}:</strong><code
          title={s.locations.runtimeDirectory}
          >{s.locations.runtimeDirectory}</code
        ><CopyButton
          value={s.locations.runtimeDirectory}
          label={t("copyRuntimeFolder")}
        />
      </div>
      <div class="system-path">
        <strong>{t("installationFolder")}:</strong><code
          title={s.locations.installationDirectory ?? undefined}
          >{s.locations.installationDirectory ?? t("unknownValue")}</code
        ><CopyButton
          value={s.locations.installationDirectory ?? undefined}
          label={t("copyValue")}
        />
      </div>{/if}
    {#each ["installed", "authenticated", "online", "privateReachable"] as key}{@render line(
        key,
        t(
          s.connectivity[key as keyof typeof s.connectivity] === true
            ? "verifiedValue"
            : "notVerifiedValue",
        ),
      )}{/each}
    {#each ["public", "private"] as kind}{@const exposure =
        s.exposure[kind as "public" | "private"]}
      <article>
        <h3>{t(kind === "public" ? "publicExposure" : "privateExposure")}</h3>
        {@render line("originLabel", exposure.origin)}{@render line(
          "funnelConfig",
          t(
            exposure.funnelAllowed === null
              ? "unknownValue"
              : exposure.funnelAllowed
                ? "allowedValue"
                : "notAllowedValue",
          ),
        )}{#each exposure.routes as route}<p>
            <strong>{route.path}: </strong>{t(
              route.mapped === null
                ? "unknownValue"
                : route.mapped
                  ? "mappedValue"
                  : "notMappedValue",
            )}
          </p>{/each}
      </article>{/each}
    {@render line("externalReachability", t("externalUnknown"))}{@render line(
      "supervision",
      s.supervision.state === "verified"
        ? s.supervision.label + " · " + t("verifiedValue")
        : t("supervisionUnknown"),
    )}{@render line("limitedLogs", t("logsUnavailable"))}{/if}
{/if}

<style>
  .system-path {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
    min-width: 0;
  }
  .system-path strong {
    flex: none;
  }
  .system-path code {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8125rem;
  }
</style>
