<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { z } from "zod";
  import type { UiCopy, AuthMode, ScopeLabels } from "../contracts.js";
  import {
    AuthFailure,
    request,
    signedOAuthQuery,
    destination,
    signIn,
  } from "../lib/auth-protocol.js";
  import type { DialogCenter, ToastCenter } from "../lib/ui-state.svelte.js";
  import Brand from "./Brand.svelte";
  import Icon from "./Icon.svelte";
  let {
    mode,
    privateAdmin = false,
    scopeLabels = {},
  }: {
    mode: AuthMode;
    privateAdmin?: boolean;
    scopeLabels?: ScopeLabels;
  } = $props();
  const dialogs = getContext<DialogCenter>("dialogs"),
    toast = getContext<ToastCenter>("toast");
  const { authT } = getContext<UiCopy>("copy");
  const locale = getContext<{ current: string }>("locale");
  // svelte-ignore state_referenced_locally
  let busy = $state(false),
    ready = $state(mode === "sign-in"),
    message = $state(""),
    error = $state(false),
    adding = $state(false);
  let user = $state(""),
    password = $state(""),
    label = $state("");
  let accounts = $state<
      Array<{
        id: string;
        user: string;
        label: string;
        credentialStored: boolean;
      }>
    >([]),
    selected = $state<{ user: string; label: string } | undefined>(),
    client = $state<{ id: string; name?: string } | undefined>();
  let scopes = $state<string[]>([]),
    chosen = $state<string[]>([]);
  const statusSchema = z.object({
    accounts: z.array(
      z.object({
        id: z.string(),
        user: z.string(),
        label: z.string(),
        credentialStored: z.boolean(),
      }),
    ),
    selectedAccount: z
      .object({
        id: z.string(),
        user: z.string(),
        label: z.string(),
        credentialStored: z.boolean(),
      })
      .optional(),
    client: z.object({ id: z.string(), name: z.string().optional() }),
    permissions: z.array(z.string()),
  });
  const display = (account: { label: string; user: string }) =>
    !account.label.trim() ||
    account.label.toLowerCase() === account.user.toLowerCase()
      ? { primary: account.user }
      : { primary: account.label, secondary: account.user };
  const scopeLabel = (scope: string) => {
    const known: Record<string, string> = {
      offline_access: "scopeOffline",
      "photos.read": "scopePhotosRead",
      "photos.write": "scopePhotosWrite",
      "photos.delete": "scopePhotosDelete",
    };
    if (known[scope]) return authT(known[scope]);
    const value = scopeLabels[scope];
    return typeof value === "string"
      ? value
      : (value?.[locale?.current ?? "en"] ?? value?.default ?? scope);
  };
  const groups = $derived(
    [
      { title: "permissionMail", prefix: "mail." },
      { title: "permissionCalendar", prefix: "calendar." },
      { title: "permissionPhotos", prefix: "photos." },
      { title: "permissionConnection", prefix: "" },
    ]
      .map((group) => ({
        ...group,
        scopes: scopes.filter((scope) =>
          group.prefix
            ? scope.startsWith(group.prefix)
            : !["mail.", "calendar.", "photos."].some((prefix) =>
                scope.startsWith(prefix),
              ),
        ),
      }))
      .filter((group) => group.scopes.length),
  );
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    message = "";
    error = false;
    try {
      await action();
      message = "";
    } catch (e) {
      message = e instanceof AuthFailure ? e.key : "actionFailed";
      error = true;
      toast?.push("auth_" + message, "error");
    } finally {
      busy = false;
    }
  }
  async function load() {
    const value = statusSchema.parse(
      await (
        await request(
          "/icloud/connect/status?" +
            new URLSearchParams({
              oauth_query: signedOAuthQuery(location.search),
            }),
        )
      ).json(),
    );
    accounts = value.accounts;
    selected = value.selectedAccount;
    client = value.client;
    if (mode === "consent") {
      if (!value.selectedAccount?.credentialStored)
        throw new AuthFailure("chooseAccount");
      scopes = value.permissions;
      chosen = [...scopes];
      ready = scopes.length > 0;
    }
  }
  function go(value: unknown) {
    const url = destination(value);
    if (!url) throw new AuthFailure("incompleteAuthorization");
    location.assign(url);
  }
  async function consent(accept: boolean) {
    password = "";
    if (accept && !chosen.length) throw new AuthFailure("selectPermission");
    go(
      await (
        await request("/icloud/auth/oauth2/consent", {
          accept,
          ...(accept ? { scope: chosen.join(" ") } : {}),
          oauth_query: signedOAuthQuery(location.search),
        })
      ).json(),
    );
  }
  async function addCredential(input: {
    user: string;
    appPassword: string;
    label: string;
  }) {
    password = "";
    try {
      go(
        await (
          await request("/icloud/connect/add", {
            oauth_query: signedOAuthQuery(location.search),
            user: input.user,
            appPassword: input.appPassword,
            ...(input.label.trim() ? { label: input.label.trim() } : {}),
          })
        ).json(),
      );
    } catch (e) {
      let stored = false;
      try {
        await load();
        stored = accounts.some(
          (a) =>
            a.credentialStored &&
            a.user.toLowerCase() === input.user.trim().toLowerCase(),
        );
      } catch {}
      if (
        stored &&
        (!(e instanceof AuthFailure) ||
          !["ACCOUNT_EXISTS", "PROVIDER_VALIDATION_FAILED"].includes(
            e.code ?? "",
          ))
      )
        throw new Error("auth_savedReconnect");
      throw new Error(
        e instanceof AuthFailure ? "auth_" + e.key : "actionError",
      );
    } finally {
      password = "";
    }
  }
  onMount(() => {
    if (mode !== "sign-in") void run(load);
    const clear = () => {
      password = "";
    };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    return () => {
      clear();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", clear);
    };
  });
</script>

<svelte:head
  ><title
    >{authT(
      mode === "connect"
        ? "titleConnect"
        : mode === "consent"
          ? "titleConsent"
          : "titleSignIn",
    )} · {authT("product")}</title
  ></svelte:head
>
<main class="auth-layout" data-sveltekit-reload>
  <Brand>{authT("product")}</Brand>
  <div class="card">
    <h1>
      {authT(
        mode === "connect"
          ? "headingConnect"
          : mode === "consent"
            ? "headingConsent"
            : "headingSignIn",
      )}
    </h1>
    {#if mode === "connect"}
      <p class="muted">{authT("introConnect")}</p>
      <div data-connect-accounts hidden={adding}>
        {#each accounts as account (account.id)}{@const d =
            display(account)}<button
            type="button"
            class="secondary account-choice"
            disabled={busy || !account.credentialStored}
            onclick={() =>
              void run(async () =>
                go(
                  await (
                    await request("/icloud/connect/select", {
                      oauth_query: signedOAuthQuery(location.search),
                      accountId: account.id,
                    })
                  ).json(),
                ),
              )}
            ><span>{d.primary}</span>{#if d.secondary}<span
                class="account-address">{d.secondary}</span
              >{/if}{#if !account.credentialStored}<span class="account-address"
                >{authT("accountUnavailable")}</span
              >{/if}</button
          >{/each}
      </div>
      <button
        class="secondary"
        type="button"
        data-connect-add
        hidden={adding}
        disabled={busy}
        onclick={() => {
          dialogs.openCredential("app-password", {
            mode: "add",
            accounts,
            submit: (input) => addCredential(input),
          });
        }}>{authT("addAccount")}</button
      >
    {:else if mode === "consent"}
      <p class="muted">{authT("introConsent")}</p>
      <p data-auth-account>
        {selected
          ? authT("selectedAccount") +
            ": " +
            display(selected).primary +
            (display(selected).secondary
              ? " · " + display(selected).secondary
              : "")
          : ""}
      </p>
      <p
        class="muted"
        data-auth-photos-library
        hidden={!scopes.some((scope) => scope.startsWith("photos."))}
      >
        {authT("photosLibrary")}
      </p>
      <p class="auth-client" data-auth-client>
        {client?.name ?? (client ? authT("unknownClient") : "")}
      </p>
      <details>
        <summary>{authT("clientIdentifier")}</summary><small data-auth-client-id
          >{client?.id ?? ""}</small
        >
      </details>
      <fieldset data-auth-scopes>
        <legend>{authT("permissions")}</legend>{#each groups as group}<h3>
            {authT(group.title)}
          </h3>
          {#each group.scopes as scope}<label class="permission-choice"
              ><input
                type="checkbox"
                value={scope}
                bind:group={chosen}
                data-auth-scope
                disabled={busy}
              /><span>{scopeLabel(scope)}</span></label
            >{/each}{/each}
      </fieldset>
    {:else}<p class="muted">{authT("introSignIn")}</p>{/if}
    <div class="actions">
      {#if mode !== "connect"}<button
          class="primary button-icon"
          type="button"
          data-auth-primary
          disabled={busy || !ready}
          onclick={() =>
            void run(() =>
              mode === "sign-in" ? signIn(privateAdmin) : consent(true),
            )}
          >{#if mode === "sign-in"}<Icon name="passkey" />{/if}{authT(
            mode === "consent" ? "allow" : "usePasskey",
          )}</button
        >{/if}{#if mode !== "sign-in"}<button
          class="secondary"
          type="button"
          data-auth-deny
          disabled={busy}
          onclick={() => void run(() => consent(false))}
          >{authT(mode === "connect" ? "cancel" : "deny")}</button
        >{/if}
    </div>
  </div>
</main>

<style>
  :global([data-auth-scopes]) {
    border: 0;
    padding: 0;
    margin: 1.5rem 0;
  }
  .permission-choice {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.5rem 0;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    margin: 0;
    font-weight: 400;
    cursor: pointer;
  }
  .permission-choice:hover {
    background: var(--ui-soft);
  }
  .permission-choice:has(input:focus-visible) {
    outline: 2px solid var(--ui-focus);
    outline-offset: 2px;
  }
  @media (pointer: coarse) {
    .permission-choice {
      min-height: 44px;
    }
  }
  .permission-choice input {
    margin-top: 0.15rem;
  }
</style>
