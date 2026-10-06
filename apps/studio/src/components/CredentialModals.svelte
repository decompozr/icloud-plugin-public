<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { z } from "zod";
  import type { UiCopy } from "../contracts.js";
  import type { DialogCenter, ToastCenter } from "../lib/ui-state.svelte.js";
  import Modal from "./Modal.svelte";
  import PhotosCloud from "./PhotosCloud.svelte";
  let { center }: { center: DialogCenter } = $props();
  const { t } = getContext<UiCopy>("copy");
  const toast = getContext<ToastCenter>("toast");
  let user = $state(""),
    label = $state(""),
    password = $state(""),
    accountId = $state(""),
    busy = $state(false),
    generation = 0;
  let accounts = $state<
    Array<{
      id: string;
      user: string;
      label: string;
      credentialStored: boolean;
    }>
  >([]);
  const current = $derived(center.credential);
  const selected = $derived(
    accounts.find((account) => account.id === accountId),
  );
  async function post(path: string, body: unknown) {
    const r = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const code = (await r.json().catch(() => null))?.error;
      throw Error(
        (
          {
            PROVIDER_VALIDATION_FAILED: "providerError",
            ACCOUNT_EXISTS: "accountExists",
            OWNER_REQUIRED: "ownerError",
          } as Record<string, string>
        )[code] ?? "actionError",
      );
    }
    return r.json();
  }
  $effect(() => {
    const value = current;
    if (value && value.generation !== generation) {
      generation = value.generation;
      password = "";
      user = "";
      label = "";
      accountId = value.options.accountId ?? "";
      accounts = value.options.accounts ?? [];
      if (!value.options.submit) void load(value.generation);
    }
  });
  async function load(id: number) {
    try {
      const r = await fetch("/icloud/admin/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const value = z
        .object({
          accounts: z.array(
            z.object({
              id: z.string(),
              user: z.string(),
              label: z.string(),
              credentialStored: z.boolean(),
            }),
          ),
        })
        .parse(await r.json());
      if (center.credential?.generation === id) {
        accounts = value.accounts;
        if (
          !accountId &&
          current?.options.mode !== "add" &&
          accounts.length === 1
        )
          accountId = accounts[0]!.id;
      }
    } catch {
      toast.push("statusError", "error");
    }
  }
  function close() {
    password = "";
    user = "";
    label = "";
    center.closeCredential();
  }
  async function submit() {
    const entry = current;
    if (!entry || busy) return;
    busy = true;
    const input = {
      ...(accountId ? { accountId } : {}),
      user: selected?.user ?? user,
      label: selected?.label ?? label,
      appPassword: password,
    };
    password = "";
    try {
      if (entry.options.submit) await entry.options.submit(input);
      else if (accountId)
        await post("/icloud/admin/credential", {
          accountId,
          appPassword: input.appPassword,
        });
      else await post("/icloud/admin/accounts/add", input);
      toast.push("saved");
      await entry.options.onSuccess?.();
      window.dispatchEvent(new Event("studio:credentials-updated"));
      center.closeCredential(entry.generation);
    } catch (e) {
      toast.push(
        e instanceof Error &&
          [
            "providerError",
            "accountExists",
            "ownerError",
            "auth_savedReconnect",
            "auth_duplicateAccount",
            "auth_providerError",
          ].includes(e.message)
          ? e.message
          : "actionError",
        "error",
      );
    } finally {
      password = "";
      busy = false;
    }
  }
  onMount(() => {
    const clear = () => (password = "");
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    return () => {
      clear();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", clear);
    };
  });
</script>

<Modal
  open={!!current}
  title={t(
    current?.kind === "apple-account"
      ? "appleSessionModal"
      : "appPasswordModal",
  )}
  onclose={close}
  {busy}
>
  {#if current?.kind === "apple-account"}<p class="muted">
      {t("webSessionHelp")}
    </p>
    {#if !accounts.length}<p>{t("noAccountYet")}</p>
      <button
        class="primary"
        onclick={() => center.openCredential("app-password", { mode: "add" })}
        >{t("addAccount")}</button
      >{:else}<PhotosCloud
        preferredAccountId={current.options.accountId}
        inModal
        onbusy={value=>busy=value}
        oncomplete={() =>
          window.dispatchEvent(new Event("studio:credentials-updated"))}
      />{/if}
  {:else}<p class="muted">{t("credentialModalHelp")}</p>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {#if !current?.options.submit}<label for="credential-account"
          >{t("chooseExistingAccount")}</label
        ><select
          id="credential-account"
          bind:value={accountId}
          disabled={busy}
          onchange={() => (password = "")}
          ><option value="">{t("newAccountOption")}</option
          >{#each accounts as account}<option value={account.id}
              >{account.label === account.user
                ? account.user
                : account.label + " · " + account.user}</option
            >{/each}</select
        >{/if}
      {#if !accountId}<label for="credential-user">{t("email")}</label><input
          id="credential-user"
          type="email"
          required
          maxlength="254"
          autocomplete="username"
          bind:value={user}
          disabled={busy}
        /><label for="credential-label">{t("accountLabel")}</label><input
          id="credential-label"
          maxlength="100"
          autocomplete="off"
          bind:value={label}
          disabled={busy}
        />{/if}
      <label for="credential-password">{t("password")}</label><input
        id="credential-password"
        type="password"
        required
        maxlength="256"
        autocomplete="new-password"
        bind:value={password}
        disabled={busy}
      />
      <p>
        <a
          href="https://support.apple.com/102654"
          target="_blank"
          rel="noreferrer">{t("appleGuide")}</a
        >
      </p>
      <div class="actions">
        <button class="primary" type="submit" disabled={busy}
          >{t("saveAccount")}</button
        ><button class="secondary" type="button" disabled={busy} onclick={close}
          >{t("cancel")}</button
        >
      </div>
    </form>{/if}
</Modal>
