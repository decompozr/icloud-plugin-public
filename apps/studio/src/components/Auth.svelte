<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy, AuthMode } from "../contracts.js";
  import Brand from "./Brand.svelte";
  import Icon from "./Icon.svelte";
  let { mode }: { mode: AuthMode } = $props();
  const { authT } = getContext<UiCopy>("copy");
  const consent = $derived(mode === "consent"),
    connect = $derived(mode === "connect");
</script>

<main class="auth-layout">
  <Brand>{authT("product")}</Brand>
  <div class="card">
    <h1>
      {authT(
        connect
          ? "headingConnect"
          : consent
            ? "headingConsent"
            : "headingSignIn",
      )}
    </h1>
    {#if connect}<p class="muted">{authT("introConnect")}</p>
      <div data-connect-accounts></div>
      <button class="secondary" type="button" data-connect-add
        >{authT("addAccount")}</button
      >
      <form data-connect-form hidden>
        <label for="connect-email">{authT("email")}</label><input
          id="connect-email"
          name="user"
          type="email"
          required
          maxlength="320"
          autocomplete="username"
        /><label for="connect-password">{authT("password")}</label><input
          id="connect-password"
          name="appPassword"
          type="password"
          required
          maxlength="256"
          autocomplete="new-password"
        /><small>{authT("passwordHelp")}</small>
        <p>
          <a
            href="https://support.apple.com/102654"
            target="_blank"
            rel="noreferrer">{authT("appleGuide")}</a
          >
        </p>
        <label for="connect-label">{authT("accountLabel")}</label><input
          id="connect-label"
          name="label"
          maxlength="120"
        />
        <div class="actions">
          <button class="primary" type="submit">{authT("saveAccount")}</button
          ><button class="secondary" type="button" data-connect-back
            >{authT("backToAccounts")}</button
          >
        </div>
      </form>{:else}{#if consent}<p class="muted">{authT("introConsent")}</p>
        <p data-auth-account></p>
        <p class="muted" data-auth-photos-library hidden>
          {authT("photosLibrary")}
        </p>
        <p class="auth-client" data-auth-client></p>
        <details class="auth-client-details">
          <summary>{authT("clientIdentifier")}</summary><small
            data-auth-client-id
          ></small>
        </details>
        <fieldset data-auth-scopes>
          <legend>{authT("permissions")}</legend>
        </fieldset>{:else}<p class="muted">{authT("introSignIn")}</p>{/if}{/if}
    <div class="actions">
      {#if connect}{:else}<button
          class="primary button-icon"
          type="button"
          data-auth-primary
          >{#if consent}{:else}<Icon name="passkey" />{/if}{authT(
            consent ? "allow" : "usePasskey",
          )}</button
        >{/if}{#if consent || connect}<button
          class="secondary"
          type="button"
          data-auth-deny>{authT(connect ? "cancel" : "deny")}</button
        >{:else}{/if}
    </div>
    <p class="status" role="status" aria-live="polite" data-auth-status></p>
  </div>
</main>
