<script lang="ts">
  import { getContext } from "svelte";
  import type { AdminState, UiCopy } from "../contracts.js";
  import Copy from "./Copy.svelte";
  import Brand from "./Brand.svelte";
  import Icon from "./Icon.svelte";
  import PhotosSetup from "./PhotosSetup.svelte";
  import PhotosCloud from "./PhotosCloud.svelte";
  let { state }: { state: AdminState } = $props();
  const { t } = getContext<UiCopy>("copy");
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
  const progressSteps=$derived(state.localOwner ? ["stepOwner","installationPolicy","stepConnection","stepClient"] : ["stepConnection","stepOwner","stepAccount","stepClient"]);
</script>

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
    data-back={index}><Copy copyKey="back" /></button
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
    <select id="language"
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
        {#each progressSteps as key, position}{@const index =
            state.localOwner ? [1, 4, 0, 3][position] : position}
          <li
            data-progress={index}
            aria-current={index === 0 ? "step" : undefined}
          >
            <Copy copyKey={key} />
          </li>{/each}
      </ol>{/if}
    {#if state.admin && view === "overview"}<section class="card">
        <h2><Copy copyKey={"overviewTitle"} /></h2>
        <div id="overview-content" role="status" aria-live="polite">
          <p><Copy copyKey={"statusLoading"} /></p>
        </div>
        <div id="overview-next" class="actions"></div>
        <button type="button" id="overview-refresh" class="secondary"
          ><Copy copyKey={"retryDiagnostics"} /></button
        >{#if state.localOwner}<details>
            <summary><Copy copyKey={"remoteOwnerTitle"} /></summary>
            <p><Copy copyKey={"remoteOwnerHelp"} /></p>
            <button type="button" id="remote-owner-start" class="secondary"
              ><Copy copyKey={"remoteOwnerStart"} /></button
            >
            <div id="remote-owner-link"></div>
          </details>{:else}{/if}
      </section>{:else}{/if}
    {#if state.admin && view === "system"}<section class="card">
        <h2><Copy copyKey={"systemTitle"} /></h2>
        <p><Copy copyKey={"systemHelp"} /></p>
        <button type="button" id="system-refresh" class="secondary"
          ><Copy copyKey={"retryDiagnostics"} /></button
        >
        <div id="system-content" role="status" aria-live="polite">
          <p><Copy copyKey={"statusLoading"} /></p>
        </div>
      </section>{:else}{/if}
    {#if accounts}<section class="card dashboard">
        <h2><Copy copyKey={"accountsTitle"} /></h2>
        <div id="accounts" role="list" aria-label={t("accountsTitle")}></div>
        <p>
          <a href="/icloud/setup?mode=account"
            ><Copy copyKey={"addAccount"} /></a
          >
        </p>
        <div id="account-details"></div>
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
              disabled
            />
          </div>
          <p data-selection-summary></p>
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
                      disabled
                    /><span id="policy-{id}"
                      ><Copy copyKey={"unavailable"} /></span
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
                disabled
              />
            </div>
            <p data-selection-summary></p>
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
                        disabled
                      /><span data-module-state={field.id}
                        ><Copy copyKey={"unavailable"} /></span
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
        <p id="policy-dirty" role="status" hidden>
          <Copy copyKey={"unsavedPolicy"} />
        </p>
        <div class="actions">
          <button type="button" class="secondary" id="policy-discard" hidden
            ><Copy copyKey={"discardPolicy"} /></button
          ><button type="button" class="primary" id="policy-save" disabled
            ><Copy copyKey={"policySave"} /></button
          >
        </div>
        <div class="note" id="policy-confirm" hidden>
          <p><Copy copyKey={"policyConfirm"} /></p>
          <button type="button" class="primary" id="policy-confirm-yes"
            ><Copy copyKey={"policyEnable"} /></button
          >
          <button type="button" class="secondary" id="policy-confirm-no"
            ><Copy copyKey={"cancel"} /></button
          >
        </div>
      </section>{:else}{/if}{#if connections}<section class="card">
        <h2><Copy copyKey={"connectionsTitle"} /></h2>
        <p><Copy copyKey={"connectionsHelp"} /></p>
        <div id="connections-list" tabindex="-1"></div>
        <details>
          <summary><Copy copyKey={"registrationHistory"} /></summary>
          <div id="registrations-list"></div>
        </details>
        <div
          id="connection-confirm"
          class="note"
          hidden
          role="dialog"
          aria-modal="false"
          aria-labelledby="connection-confirm-title"
        >
          <h3 id="connection-confirm-title">
            <Copy copyKey={"connectionImpact"} />
          </h3>
          <div id="connection-impact"></div>
          <div class="actions">
            <button type="button" id="connection-confirm-yes" class="danger"
              ><Copy copyKey={"confirmConnectionAction"} /></button
            ><button type="button" id="connection-confirm-no" class="secondary"
              ><Copy copyKey={"cancel"} /></button
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
        ><select id="readiness-account"></select><label for="readiness-client"
          ><Copy copyKey={"readinessClient"} /></label
        ><select id="readiness-client"></select><button
          type="button"
          class="secondary"
          id="readiness-refresh"><Copy copyKey={"retryDiagnostics"} /></button
        >
        <div id="readiness-results" role="status" aria-live="polite"></div>
        <p><Copy copyKey={"readinessTestHelp"} /></p>
      </details>{:else}{/if}
    <div
      class={state.admin ? undefined : "card onboarding-layer"}
      aria-labelledby={state.admin ? undefined : "onboarding-label"}
    >
      {#if !state.admin}<p class="brand" id="onboarding-label">
          <Copy copyKey="shellSetup" />
        </p>{/if}{#if state.admin}{:else}<section data-step="0">
          <h2 tabindex="-1"><Copy copyKey={"connectionTitle"} /></h2>
          <p class="muted"><Copy copyKey={"connectionIntro"} /></p>
          <ul class="checks">
            {#each ["installed", "authenticated", "online", "privateReachable"] as const as key}<li
              >
                <span><Copy copyKey={key} /></span><span
                  id="check-{key}"
                  class="check-state"><Copy copyKey={"checking"} /></span
                >
              </li>{/each}
          </ul>
          <div id="connection-help" class="note" hidden></div>
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
            <button id="connection-next" class="primary" disabled
              ><Copy copyKey={"next"} /></button
            ><button id="recheck" class="secondary"
              ><Copy copyKey={"recheck"} /></button
            >
          </div>
        </section>
        <section data-step="1" hidden>
          <h2 tabindex="-1"><Copy copyKey={"ownerTitle"} /></h2>
          <p><Copy copyKey={"ownerIntro"} /></p>
          <div class="note"><Copy copyKey={"ownerNote"} /></div>
          <p id="owner-denied" class="error" hidden>
            <Copy copyKey={"ownerDenied"} />
          </p>
          <p id="passkey-existing" class="note" hidden>
            <Copy copyKey={"existingPasskey"} />
          </p>
          <div class="actions">
            <button id="register" class="primary button-icon" disabled
              ><Icon name="passkey" /><Copy copyKey={"register"} /></button
            >{@render back(0)}
          </div>
        </section>{/if}
      {#if accounts}<details id="account-maintenance">
          <summary><Copy copyKey={"accountMaintenance"} /></summary>
          <p class="muted"><Copy copyKey={"maintenanceHelp"} /></p>
          {@html state.presentation?.credentialSection(true) ?? ""}
        </details>{:else}{/if}
      {#if state.admin}{:else}<section data-step="2" hidden>
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
          <form id="account-add">
            <label for="account-user"><Copy copyKey={"email"} /></label><input
              id="account-user"
              type="email"
              required
              autocomplete="username"
              maxlength="254"
            /><label for="account-label"
              ><Copy copyKey={"accountLabel"} /></label
            ><input
              id="account-label"
              type="text"
              autocomplete="off"
              maxlength="100"
            /><label for="account-password"><Copy copyKey={"password"} /></label
            ><input
              id="account-password"
              type="password"
              required
              autocomplete="new-password"
              maxlength="256"
            /><small><Copy copyKey={"passwordHelp"} /></small>
            <div class="actions">
              <button id="account-add-save" class="primary" type="submit"
                ><Copy copyKey={"saveAccount"} /></button
              ><a href="/"><Copy copyKey={"cancel"} /></a><button
                id="account-skip"
                class="secondary"
                type="button"><Copy copyKey={"useSavedAccount"} /></button
              >
            </div>
          </form>
        </section>
        <section data-step="3" hidden>
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
      <p id="result" class="status" role="status" aria-live="polite"></p>
      <p id="error" class="error" role="alert" hidden></p>
    </div>
    <noscript><p class="error"><Copy copyKey={"noScript"} /></p></noscript
    >{#if state.photosConfigured && (view === "system" || view === "setup")}<div
        id="photos-onboarding"
        hidden={!state.enrolled}
      >
        <PhotosSetup />
      </div>{:else}{/if}{#if state.photosCloudConfigured && view === "system"}<PhotosCloud
      />{:else}{/if}
  </div>
</main>
