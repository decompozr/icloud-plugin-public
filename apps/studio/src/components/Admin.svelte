<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { AdminState, UiCopy } from "../contracts.js";
  import Copy from "./Copy.svelte";
  import Brand from "./Brand.svelte";
  import Icon from "./Icon.svelte";
  import PhotosSetup from "./PhotosSetup.svelte";
  import PhotosCloud from "./PhotosCloud.svelte";
  import { AdminModel } from "../lib/admin-model.svelte.js";
  import AdminDashboard from "./AdminDashboard.svelte";
  import Credential from "./Credential.svelte";
  let { state }: { state: AdminState } = $props();
  const copy = getContext<UiCopy>("copy");
  const { t } = copy;
  const locale = getContext<{
    current: "en" | "zh-TW";
    set(value: "en" | "zh-TW"): void;
  }>("locale");
  // svelte-ignore state_referenced_locally
  const model = new AdminModel(state, copy);
  onMount(() => model.start());
  const calendarCopy: Record<string, string> = {
    read: "calendarRead",
    write: "calendarWrite",
    schedule: "calendarSchedule",
    share: "calendarShare",
  };
  type CopyKey = string;
  const view = $derived(state.view ?? (state.admin ? "accounts" : "setup"));
  const accounts = $derived(state.admin && view === "accounts");
  const connections = $derived(state.admin && view === "connections");
  const policy = $derived(state.admin && view === "overview");
  const headingKey: CopyKey = $derived(
    view === "overview"
      ? "navOverview"
      : view === "accounts"
        ? "navAccounts"
        : view === "connections"
          ? "navConnections"
          : view === "system"
            ? "navSystem"
            : "headingSetup",
  );
  const links: ReadonlyArray<[string, CopyKey, string]> = [
    ["/", "navOverview", "overview"],
    ["/icloud/admin/accounts", "navAccounts", "accounts"],
    ["/icloud/admin/connections", "navConnections", "connections"],
    ["/icloud/admin/system", "navSystem", "system"],
    ["/icloud/setup", "navSetup", "setup"],
  ];
  const progressSteps = $derived(
    state.localOwner
      ? ["stepOwner", "installationPolicy", "stepConnection", "stepClient"]
      : ["stepConnection", "stepOwner", "stepAccount", "stepClient"],
  );
  function mixed(node: HTMLInputElement, values: boolean[]) {
    const update = (v: boolean[]) => {
      node.indeterminate = v.some(Boolean) && !v.every(Boolean);
    };
    update(values);
    return { update };
  }
  function selection(service: string) {
    const v = Object.values(model.draft[service] ?? {});
    return v.length && v.every(Boolean)
      ? "allPolicy"
      : v.some(Boolean)
        ? "mixedPolicy"
        : "noPolicy";
  }
  async function copyField(id: string) {
    const field = document.getElementById(id),
      feedback = document.getElementById(id + "-feedback");
    if (!field || !feedback) return;
    try {
      await navigator.clipboard.writeText(field.textContent?.trim() ?? "");
      feedback.textContent = t("copied");
      feedback.className = "sr-only";
    } catch {
      feedback.textContent = t("copyFailed");
      feedback.className = "copy-feedback-error";
      const range = document.createRange();
      range.selectNodeContents(field);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }
</script>

<svelte:head
  ><title>{t(state.admin ? "titleAdmin" : "titleSetup")}</title></svelte:head
>

{#snippet heading(key: string, path: string)}
  <h3>
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"><path d={path} /></svg
    ><Copy copyKey={key} />
  </h3>
{/snippet}
{#snippet back(index: number)}<button
    type="button"
    class="secondary"
    data-back={index}
    disabled={model.busy}
    onclick={() => model.step(index)}><Copy copyKey="back" /></button
  >{/snippet}
{#snippet field(id: string, label: string, value: string, valueKey?: string)}
  <div class="copy-field">
    <div class="copy-label" id="{id}-label"><Copy copyKey={label} /></div>
    <div class="copy-row">
      <div
        class="copy-value"
        {id}
        aria-labelledby="{id}-label"
        data-copy-value={valueKey}
      >
        {value}
      </div>
      <button
        type="button"
        class="copy-icon"
        onclick={() => void copyField(id)}
        disabled={model.busy}
        data-clipboard={id}
        data-clipboard-label={label}
        aria-label={t("copyValue") + " " + t(label)}
        title={t("copyValue") + " " + t(label)}
        aria-describedby="{id}-feedback"
        ><svg
          class="copy-glyph"
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          ><rect x="8" y="8" width="12" height="12" rx="2" /><path
            d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
          /></svg
        ><svg
          class="copied-glyph"
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"><path d="m5 12 4 4L19 6" /></svg
        ></button
      >
    </div>
    <span class="sr-only" id="{id}-feedback" role="status" aria-live="polite"
    ></span>
  </div>
{/snippet}

<main
  id="wizard"
  data-admin={state.admin}
  data-local-owner={state.localOwner ?? false}
  data-enrolled={state.enrolled}
  data-view={view}
  data-mode={state.mode ?? ""}
  data-sveltekit-reload
  aria-busy={model.busy}
>
  <Brand><Copy copyKey="brand" /></Brand><a
    class="skip-link"
    href="#page-content"><Copy copyKey={"skipContent"} /></a
  >
  <nav class="shell-nav" aria-label="iCloud">
    {#each links as [href, key, destination]}<a
        {href}
        aria-current={view === destination ? "page" : undefined}
        ><Copy copyKey={key} /></a
      >{/each}
  </nav>
  <label class="language" for="language"
    ><Copy copyKey={"language"} />
    <select
      id="language"
      value={locale?.current ?? "en"}
      onchange={(e) => locale?.set(e.currentTarget.value as "en" | "zh-TW")}
      disabled={model.busy}
      ><option value="en" lang="en">English</option><option
        value="zh-TW"
        lang="zh-TW">繁體中文</option
      ></select
    ></label
  >
  <div id="page-content" tabindex="-1">
    <h1><Copy copyKey={headingKey} /></h1>
    {#if state.admin}{:else}<p class="muted">
        <Copy copyKey={"introSetup"} />
      </p>{/if}
    {#if state.admin}{:else}<ol
        class="progress"
        data-copy-label="progress"
        aria-label={t("progress")}
      >
        {#each progressSteps as key, position}{@const index = state.localOwner
            ? [1, 4, 0, 3][position]
            : position}
          <li
            data-progress={index}
            aria-current={index === model.currentStep ? "step" : undefined}
            class:done={progressSteps.indexOf(key) <
              (state.localOwner ? [1, 4, 0, 3] : [0, 1, 2, 3]).indexOf(
                model.currentStep,
              )}
          >
            <Copy copyKey={key} />
          </li>{/each}
      </ol>{/if}
    {#if state.admin && view === "overview"}<section class="card">
        <h2><Copy copyKey={"overviewTitle"} /></h2>
        <div id="overview-content" role="status" aria-live="polite">
          <AdminDashboard {model} view="overview" />
        </div>
        <div id="overview-next" class="actions">
          <a href="/icloud/admin/connections">{t("navConnections")}</a><a
            href="/icloud/setup">{t("connectTitle")}</a
          >
        </div>
        <button
          type="button"
          id="overview-refresh"
          class="secondary"
          onclick={() => {
            model.polls = 0;
            void model.run(() => model.refreshAll());
          }}
          disabled={model.busy}><Copy copyKey={"retryDiagnostics"} /></button
        >{#if state.localOwner}<details>
            <summary><Copy copyKey={"remoteOwnerTitle"} /></summary>
            <p><Copy copyKey={"remoteOwnerHelp"} /></p>
            <button
              type="button"
              id="remote-owner-start"
              class="secondary"
              disabled={model.busy}
              onclick={() => {
                if (window.confirm(t("remoteOwnerConfirm")))
                  void model.run(async () => {
                    const value = await model.post(
                      "/icloud/admin/remote-owner",
                      { confirm: true },
                    );
                    const url = new URL(value.url);
                    if (url.protocol !== "https:") throw Error();
                    model.remoteLink = url.href;
                    setTimeout(
                      () => (model.remoteLink = ""),
                      value.expiresIn * 1000,
                    );
                  });
              }}><Copy copyKey={"remoteOwnerStart"} /></button
            >
            <div id="remote-owner-link">
              {#if model.remoteLink}<a
                  href={model.remoteLink}
                  target="_blank"
                  rel="noreferrer">{t("remoteOwnerOpen")}</a
                >{/if}
            </div>
          </details>{:else}{/if}
      </section>{:else}{/if}
    {#if state.admin && view === "system"}<section class="card">
        <h2><Copy copyKey={"systemTitle"} /></h2>
        <p><Copy copyKey={"systemHelp"} /></p>
        <button
          type="button"
          id="system-refresh"
          class="secondary"
          onclick={() => void model.run(() => model.refreshSystem())}
          disabled={model.busy}><Copy copyKey={"retryDiagnostics"} /></button
        >
        <div id="system-content" role="status" aria-live="polite">
          <AdminDashboard {model} view="system" />
        </div>
      </section>{:else}{/if}
    {#if accounts}<section class="card dashboard">
        <h2><Copy copyKey={"accountsTitle"} /></h2>
        <div id="accounts" role="list" aria-label={t("accountsTitle")}>
          <AdminDashboard {model} view="accounts" />
        </div>
        <p>
          <a href="/icloud/setup?mode=account"
            ><Copy copyKey={"addAccount"} /></a
          >
        </p>
        <div id="account-details" aria-live="polite">
          <AdminDashboard {model} view="accountDetails" />
        </div>
      </section>{:else}{/if}{#if policy}<section class="card">
        <h2><Copy copyKey={"installationPolicy"} /></h2>
        <p class="muted"><Copy copyKey={"installationPolicyHelp"} /></p>
        <section data-capability-group="mail">
          <div class="capability-heading">
            <label for="all-mail"
              >Mail <small><Copy copyKey={"selectAllCapabilities"} /></small
              ></label
            ><input
              id="all-mail"
              data-capability-all
              type="checkbox"
              checked={Object.values(model.draft.mail ?? {}).length > 0 &&
                Object.values(model.draft.mail ?? {}).every(Boolean)}
              use:mixed={Object.values(model.draft.mail ?? {})}
              onchange={(e) => model.toggleAll("mail", e.currentTarget.checked)}
              disabled={model.busy || !model.saved.mail}
            />
          </div>
          <p data-selection-summary>{t(selection("mail"))}</p>
          <details>
            <summary><Copy copyKey={"advancedScopes"} /></summary>
            <ul class="checks">
              {#each state.presentation?.capabilities ?? [] as { id, label, copyKey }}<li
                >
                  <label for="policy-input-{id}"
                    >{#if copyKey}<Copy {copyKey} />{:else}{label ??
                        id}{/if}</label
                  ><span
                    ><input
                      class="policy-toggle"
                      type="checkbox"
                      id="policy-input-{id}"
                      aria-label={copyKey ? t(copyKey) : (label ?? id)}
                      data-copy-label={copyKey}
                      checked={model.draft.mail?.[id] ?? false}
                      onchange={(e) =>
                        model.toggle("mail", id, e.currentTarget.checked)}
                      disabled={model.busy || !model.saved.mail}
                    /><span id="policy-{id}"
                      >{t(model.fieldStatus("mail", id))}</span
                    ></span
                  >
                </li>{/each}
            </ul>
          </details>
        </section>
        {#each state.modules ?? [] as module}<section
            class="module-policy"
            data-module={module.id}
            data-capability-group={module.id}
          >
            <div class="capability-heading">
              <label for="all-{module.id}"
                >{#if module.id === "calendar"}<Copy
                    copyKey={"calendarTitle"}
                  />{:else}{#if module.id === "photos"}<Copy
                      copyKey={"photosTitle"}
                    />{:else}{module.title}{/if}{/if}
                <small><Copy copyKey={"selectAllCapabilities"} /></small></label
              ><input
                id="all-{module.id}"
                data-capability-all
                type="checkbox"
                aria-describedby="help-{module.id}"
                checked={Object.values(model.draft[module.id] ?? {}).length >
                  0 &&
                  Object.values(model.draft[module.id] ?? {}).every(Boolean)}
                use:mixed={Object.values(model.draft[module.id] ?? {})}
                onchange={(e) =>
                  model.toggleAll(module.id, e.currentTarget.checked)}
                disabled={model.busy || !model.saved[module.id]}
              />
            </div>
            <p data-selection-summary>{t(selection(module.id))}</p>
            <details>
              <summary><Copy copyKey={"advancedScopes"} /></summary>
              <p id="help-{module.id}">
                {#if module.id === "calendar"}<Copy
                    copyKey={"calendarAllHelp"}
                  />{:else}{#if module.id === "photos"}<Copy
                      copyKey={"photosPolicyHelp"}
                    />{:else}{/if}{/if}
              </p>
              <ul class="checks">
                {#each module.fields as field}<li>
                    <label for="module-{module.id}-{field.id}"
                      >{#if module.id === "calendar" && calendarCopy[field.id]}<Copy
                          copyKey={calendarCopy[field.id]!}
                        />{:else}{#if module.id === "photos"}<Copy
                            copyKey={(
                              {
                                read: "photosRead",
                                write: "photosWrite",
                                delete: "photosDelete",
                              } as Record<string, CopyKey>
                            )[field.id]!}
                          />{:else}{field.label}{/if}{/if}</label
                    ><span
                      ><input
                        type="checkbox"
                        id="module-{module.id}-{field.id}"
                        data-module-field={field.id}
                        checked={model.draft[module.id]?.[field.id] ?? false}
                        onchange={(e) =>
                          model.toggle(
                            module.id,
                            field.id,
                            e.currentTarget.checked,
                          )}
                        disabled={model.busy || !model.saved[module.id]}
                      /><span data-module-state={field.id}
                        >{t(model.fieldStatus(module.id, field.id))}</span
                      ></span
                    >
                  </li>{/each}
              </ul>
            </details>
          </section>{/each}{#if state.photosConfigured}<p>
            <a href="/icloud/admin/system#photos-onboarding"
              ><Copy copyKey={"photosPermissions"} /></a
            >
          </p>{/if}
        <p class="muted"><Copy copyKey={"policyNote"} /></p>
        <p id="policy-dirty" role="status" hidden={!model.changes.length}>
          <Copy copyKey={"unsavedPolicy"} />
        </p>
        <div class="actions">
          <button
            type="button"
            class="secondary"
            id="policy-discard"
            hidden={!model.changes.length}
            onclick={() => model.discardPolicy()}
            disabled={model.busy}><Copy copyKey={"discardPolicy"} /></button
          ><button
            type="button"
            class="primary"
            id="policy-save"
            onclick={() => model.requestPolicy()}
            disabled={model.busy || !model.changes.length}
            ><Copy copyKey={"policySave"} /></button
          >
        </div>
        <div class="note" id="policy-confirm" hidden={!model.policyConfirm}>
          <p><Copy copyKey={"policyConfirm"} /></p>
          <button
            type="button"
            class="primary"
            id="policy-confirm-yes"
            onclick={() =>
              void model.run(() => model.savePolicies(true), "workingPolicy")}
            disabled={model.busy}><Copy copyKey={"policyEnable"} /></button
          >
          <button
            type="button"
            class="secondary"
            id="policy-confirm-no"
            onclick={() => {
              model.policyConfirm = false;
            }}
            disabled={model.busy}><Copy copyKey={"cancel"} /></button
          >
        </div>
      </section>{:else}{/if}{#if connections}<section class="card">
        <h2><Copy copyKey={"connectionsTitle"} /></h2>
        <p><Copy copyKey={"connectionsHelp"} /></p>
        <div id="connections-list" tabindex="-1">
          <AdminDashboard {model} view="connections" />
        </div>
        <details>
          <summary><Copy copyKey={"registrationHistory"} /></summary>
          <div id="registrations-list">
            <AdminDashboard {model} view="registrations" />
          </div>
        </details>
        <div
          id="connection-confirm"
          class="note"
          role="dialog"
          aria-modal="false"
          aria-labelledby="connection-confirm-title"
          hidden={!model.pendingConnection}
        >
          <h3 id="connection-confirm-title">
            <Copy copyKey={"connectionImpact"} />
          </h3>
          <div id="connection-impact">
            <AdminDashboard {model} view="impact" />
          </div>
          <div class="actions">
            <button
              type="button"
              id="connection-confirm-yes"
              class={model.pendingConnection?.action === "upgrade"
                ? "primary"
                : "danger"}
              onclick={() => void model.run(() => model.confirmConnection())}
              disabled={model.busy}
              ><Copy
                copyKey={model.pendingConnection?.action === "upgrade"
                  ? "confirmCapabilityUpgrade"
                  : "confirmConnectionAction"}
              /></button
            ><button
              type="button"
              id="connection-confirm-no"
              class="secondary"
              onclick={() => {
                model.pendingConnection = undefined;
              }}
              disabled={model.busy}><Copy copyKey={"cancel"} /></button
            >
          </div>
        </div>
      </section>
      <details class="card readiness" aria-labelledby="readiness-title">
        <summary id="readiness-title"
          ><Copy copyKey={"readinessTitle"} /></summary
        >
        <p><Copy copyKey={"readinessHelp"} /></p>
        <label for="readiness-account"
          ><Copy copyKey={"readinessAccount"} /></label
        ><select id="readiness-account" bind:value={model.readinessAccount}
          ><option value="">{t("chooseContext")}</option
          >{#each model.dashboard?.accounts ?? [] as a}<option value={a.id}
              >{a.label === a.user ? a.user : a.label + " · " + a.user}</option
            >{/each}</select
        ><label for="readiness-client"
          ><Copy copyKey={"readinessClient"} /></label
        ><select id="readiness-client" bind:value={model.readinessClient}
          ><option value="">{t("chooseContext")}</option
          >{#each model.clients ?? [] as c}<option value={c.clientId}
              >{(c.name ?? "Client") + " · " + c.clientId}</option
            >{/each}</select
        ><button
          type="button"
          class="secondary"
          id="readiness-refresh"
          onclick={() =>
            void model.run(async () => {
              await Promise.allSettled([
                model.refreshDashboard(),
                model.refreshClients(),
              ]);
            })}
          disabled={model.busy}><Copy copyKey={"retryDiagnostics"} /></button
        >
        <div id="readiness-results" role="status" aria-live="polite">
          <AdminDashboard {model} view="readiness" />
        </div>
        <p><Copy copyKey={"readinessTestHelp"} /></p>
      </details>{:else}{/if}
    <div
      class={state.admin ? undefined : "card onboarding-layer"}
      aria-labelledby={state.admin ? undefined : "onboarding-label"}
    >
      {#if !state.admin}<p class="brand" id="onboarding-label">
          <Copy copyKey="shellSetup" />
        </p>{/if}{#if state.admin}{:else}<section
          data-step="0"
          hidden={model.currentStep !== 0}
        >
          <h2 tabindex="-1"><Copy copyKey={"connectionTitle"} /></h2>
          <p class="muted"><Copy copyKey={"connectionIntro"} /></p>
          <ul class="checks">
            {#each ["installed", "authenticated", "online", "privateReachable"] as const as key}<li
              >
                <span><Copy copyKey={key} /></span><span
                  id="check-{key}"
                  class="check-state"
                  ><Copy
                    copyKey={model.status
                      ? model.status.prerequisites[key]
                        ? "ready"
                        : "notReady"
                      : "checking"}
                  /></span
                >
              </li>{/each}
          </ul>
          <div
            id="connection-help"
            class="note"
            hidden={!model.status ||
              Object.values(model.status.prerequisites).every(Boolean)}
          >
            {model.status
              ? t(
                  !model.status.prerequisites.installed
                    ? "missingInstall"
                    : !model.status.prerequisites.authenticated
                      ? "missingLogin"
                      : !model.status.prerequisites.online
                        ? "missingOnline"
                        : "missingPrivate",
                )
              : ""}
          </div>
          <details>
            <summary><Copy copyKey={"connectionHelp"} /></summary>
            <p>
              <a
                href="https://tailscale.com/download"
                target="_blank"
                rel="noreferrer"><Copy copyKey={"download"} /></a
              >
            </p>
            <p><Copy copyKey={"downloadHelp"} /></p>
            <p>
              <a
                href="https://tailscale.com/docs/features/tailscale-serve"
                target="_blank"
                rel="noreferrer"><Copy copyKey={"serveHelp"} /></a
              >
            </p>
            {#each state.connectionCommands ?? [] as command, index}{@render field(
                "connection-command-" + index,
                "connectionCommand",
                command,
              )}{/each}
          </details>
          <div class="actions">
            <button
              id="connection-next"
              class="primary"
              onclick={() =>
                model.step(
                  model.status?.enrolled
                    ? state.mode === "account"
                      ? 2
                      : 3
                    : 1,
                )}
              disabled={model.busy || !model.canContinue}
              ><Copy copyKey={"next"} /></button
            ><button
              id="recheck"
              class="secondary"
              onclick={() => void model.run(() => model.check())}
              disabled={model.busy}><Copy copyKey={"recheck"} /></button
            >
          </div>
        </section>
        <section data-step="1" hidden={model.currentStep !== 1}>
          <h2 tabindex="-1"><Copy copyKey={"ownerTitle"} /></h2>
          <p><Copy copyKey={"ownerIntro"} /></p>
          <div class="note"><Copy copyKey={"ownerNote"} /></div>
          <p id="owner-denied" class="error" hidden={model.canRegister}>
            <Copy copyKey={"ownerDenied"} />
          </p>
          <p
            id="passkey-existing"
            class="note"
            hidden={!model.status?.passkeyRegistered}
          >
            <Copy copyKey={"existingPasskey"} />
          </p>
          <div class="actions">
            <button
              id="register"
              class="primary button-icon"
              onclick={() =>
                void model.run(() => model.enroll(), "passkeyLoading")}
              disabled={model.busy || !model.canRegister}
              ><Icon name="passkey" /><Copy
                copyKey={model.status?.passkeyRegistered
                  ? "resume"
                  : "register"}
              /></button
            >{@render back(0)}
          </div>
        </section>{/if}
      {#if accounts}<details id="account-maintenance">
          <summary><Copy copyKey={"accountMaintenance"} /></summary>
          <p class="muted"><Copy copyKey={"maintenanceHelp"} /></p>
          {#if state.presentation?.credentialStepLabel === "stepMail"}<Credential
              admin={true}
              {model}
            />{:else}{@html state.presentation?.credentialSection(true) ??
              ""}{/if}
        </details>{:else}{/if}
      {#if state.admin}{:else}<section
          data-step="2"
          hidden={model.currentStep !== 2}
        >
          <h2 tabindex="-1"><Copy copyKey={"addAccount"} /></h2>
          <p><Copy copyKey={"accountWizardHelp"} /></p>
          <p>
            <a href="/icloud/admin/accounts"
              ><Copy copyKey={"accountMaintenance"} /></a
            >
          </p>
          <div class="note">
            <a
              href="https://support.apple.com/102654"
              target="_blank"
              rel="noreferrer"><Copy copyKey={"appleGuide"} /></a
            >
          </div>
          <form
            id="account-add"
            onsubmit={(e) => {
              e.preventDefault();
              void model.run(() => model.add(), "saving");
            }}
          >
            <label for="account-user"><Copy copyKey={"email"} /></label><input
              id="account-user"
              type="email"
              required
              autocomplete="username"
              maxlength="254"
              bind:value={model.user}
              disabled={model.busy}
            /><label for="account-label"
              ><Copy copyKey={"accountLabel"} /></label
            ><input
              id="account-label"
              type="text"
              autocomplete="off"
              maxlength="100"
              bind:value={model.label}
              disabled={model.busy}
            /><label for="account-password"><Copy copyKey={"password"} /></label
            ><input
              id="account-password"
              type="password"
              required
              autocomplete="new-password"
              maxlength="256"
              bind:value={model.accountPassword}
              aria-invalid={model.invalidField === "account-password"
                ? "true"
                : undefined}
              aria-describedby="error"
              oninput={() => (model.invalidField = "")}
              disabled={model.busy}
            /><small><Copy copyKey={"passwordHelp"} /></small>
            <div class="actions">
              <button id="account-add-save" class="primary" type="submit"
                ><Copy copyKey={"saveAccount"} /></button
              ><a href="/"><Copy copyKey={"cancel"} /></a><button
                id="account-skip"
                class="secondary"
                type="button"
                onclick={() => {
                  if (
                    model.dashboard?.accounts.some((a) => a.credentialStored)
                  ) {
                    model.step(3);
                    window.dispatchEvent(new Event("photos-enrolled"));
                  } else model.message("savedAccountRequired", true);
                }}
                disabled={model.busy ||
                  !model.dashboard?.accounts.some((a) => a.credentialStored)}
                ><Copy copyKey={"useSavedAccount"} /></button
              >
            </div>
          </form>
        </section>
        <section data-step="3" hidden={model.currentStep !== 3}>
          <h2 tabindex="-1"><Copy copyKey={"connectTitle"} /></h2>
          <p><Copy copyKey={"connectIntro"} /></p>
          <div class="note"><Copy copyKey={"endpointPrerequisite"} /></div>
          {#if state.pluginDownload}<p>
              <a
                class="button"
                href="/icloud/admin/plugin.zip"
                download="icloud-plugin.zip"
                ><Copy copyKey={"pluginDownload"} /></a
              >
            </p>
            <p>
              <Copy copyKey={"pluginDownloadHelp"} />
            </p>{:else}{/if}{@render heading(
            "guideOpen",
            "M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
          )}
          <p><Copy copyKey={"openInstructions"} /></p>
          <p>
            <a
              class="button"
              href="https://chatgpt.com/plugins"
              target="_blank"
              rel="noreferrer"><Copy copyKey={"openChatGPT"} /></a
            >
          </p>
          {@render heading(
            "guideDeveloper",
            "M12 3v3M12 18v3M3 12h3M18 12h3M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
          )}
          <p><Copy copyKey={"developerInstructions"} /></p>
          {@render heading("guideCreate", "M12 5v14M5 12h14")}
          <p><Copy copyKey={"chatgptPath"} /></p>
          <p>
            <a
              href="/icloud/assets/plugin-icon.png"
              download="icloud-plugin.png"><Copy copyKey={"iconDownload"} /></a
            ><small><Copy copyKey={"iconHelp"} /></small>
          </p>
          {@render field(
            "chatgpt-name",
            "fieldName",
            t("appName"),
            "appName",
          )}{@render field(
            "chatgpt-description",
            "fieldDescription",
            t("appDescription"),
            "appDescription",
          )}{#if state.publicMcpUrl}{@render field(
              "chatgpt-url",
              "fieldUrl",
              state.publicMcpUrl,
            )}{:else}<p class="error">
              <Copy copyKey={"urlMissing"} />
            </p>{/if}{@render heading(
            "guideAuth",
            "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6",
          )}
          <p><Copy copyKey={"oauthInstructions"} /></p>
          {@render heading("guideSubmit", "M5 12l4 4L19 6")}
          <p><Copy copyKey={"submitInstructions"} /></p>
          {@render heading(
            "guideAuthorize",
            "M8 11V7a4 4 0 0 1 8 0v4M5 11h14v10H5zM12 15v2",
          )}
          <p><Copy copyKey={"authorizeInstructions"} /></p>
          <p>
            <a
              href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
              target="_blank"
              rel="noreferrer"><Copy copyKey={"clientGuide"} /></a
            >
          </p>
          {@render heading("guideTry", "M3 5h18v14H3zM3 5l9 7 9-7")}
          <p><Copy copyKey={"promptInstructions"} /></p>
          {@render field(
            "chatgpt-prompt",
            "promptLabel",
            t("safePrompt"),
            "safePrompt",
          )}
          <div class="actions">
            <a class="button" href="/"><Copy copyKey={"manage"} /></a>
          </div>
        </section>{/if}
      <p id="result" class="status" role="status" aria-live="polite">
        {!model.error && model.messageKey ? t(model.messageKey) : ""}
      </p>
      <p
        id="error"
        class="error"
        role="alert"
        hidden={!model.error || !model.messageKey}
      >
        {model.error && model.messageKey ? t(model.messageKey) : ""}
      </p>
    </div>
    <noscript><p class="error"><Copy copyKey={"noScript"} /></p></noscript
    >{#if state.photosConfigured && (view === "system" || view === "setup")}<div
        id="photos-onboarding"
        hidden={!state.enrolled && !model.status?.enrolled}
      >
        <PhotosSetup active={state.enrolled || model.status?.enrolled} />
      </div>{:else}{/if}{#if state.photosCloudConfigured && view === "system"}<PhotosCloud
      />{:else}{/if}
  </div>
</main>
