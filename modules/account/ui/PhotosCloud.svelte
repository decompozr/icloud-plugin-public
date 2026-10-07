<script lang="ts">
  import ActionButton from "../../../packages/ui/src/components/ActionButton.svelte";
  import { getContext, onMount } from "svelte";
  import { z } from "zod";
  import type { UiCopy } from "../../../packages/ui/src/contracts.js";
  let {
    preferredAccountId,
    inModal = false,
    oncomplete,
    onbusy,
  }: {
    preferredAccountId?: string;
    inModal?: boolean;
    oncomplete?: () => void;
    onbusy?: (value: boolean) => void;
  } = $props();
  const toast =
    getContext<import("../../../packages/ui/src/toast-state.svelte.js").ToastCenter>("toast");
  const { t } = getContext<UiCopy>("copy");
  let busy = $state(false),
    account = $state(""),
    password = $state(""),
    code = $state(""),
    confirm = $state(false),
    message = $state("");
  let accounts = $state<Array<{ id: string; user: string; label: string }>>([]);
  const schema = z.object({
    dependencyReady: z.boolean(),
    setupAvailable: z.boolean(),
    phase: z
      .enum([
        "not_connected",
        "awaiting_2fa",
        "authenticated",
        "challenge_expired",
      ])
      .optional(),
    verificationMethod: z
      .enum(["sms", "trusted_device", "security_key", "unknown"])
      .default("unknown"),
    managementReady: z.boolean(),
  });
  let status = $state<z.infer<typeof schema>>();
  const statusKey = $derived(
    !status?.dependencyReady
      ? "photosCloudNeedSetup"
      : status.phase === "awaiting_2fa"
        ? "photosVerification_" + status.verificationMethod
        : status.phase === "challenge_expired"
          ? "photosCloudExpired"
          : status.phase === "authenticated"
            ? "photosCloudAuthenticated"
            : "photosCloudChoose",
  );
  async function request(path: string, body?: unknown) {
    const r = await fetch("/icloud/admin/photos/cloud/" + path, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(path === "setup" ? 300000 : 70000),
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (!r.ok) throw Error();
    return r.json();
  }
  async function refresh() {
    status = schema.parse(
      await request(
        "status" + (account ? "?accountId=" + encodeURIComponent(account) : ""),
      ),
    );
    message = "";
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    onbusy?.(true);
    try {
      await action();
    } catch {
      message = "photosCloudFailed";
      toast?.push(message, "error");
    } finally {
      busy = false;
      onbusy?.(false);
    }
  }
  async function action(path: string, extra: Record<string, unknown> = {}) {
    if (!account) throw Error();
    const result = await request(path, { accountId: account, ...extra });
    await refresh();
    oncomplete?.();
    if (result.phase === "verification_failed")
      toast?.push("photosVerificationFailed", "error");
    else if (result.phase === "unsupported_authentication")
      toast?.push("photosCloudUnsupported", "error");
    else if (
      ["delivery_failed", "authentication_required"].includes(result.phase)
    )
      toast?.push("photosCloudNewRequest", "error");
    else if (result.phase === "authenticated") toast?.push("auth_signedIn");
  }
  const clear = () => {
    password = "";
    code = "";
  };
  onMount(() => {
    void run(async () => {
      const r = await fetch("/icloud/admin/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      accounts = z
        .object({
          accounts: z.array(
            z.object({
              id: z.string().uuid(),
              user: z.string(),
              label: z.string(),
            }),
          ),
        })
        .parse(await r.json()).accounts;
      if (
        preferredAccountId &&
        accounts.some((a) => a.id === preferredAccountId)
      )
        account = preferredAccountId;
      else if (accounts.length === 1) account = accounts[0]!.id;
      await refresh();
    });
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    return () => {
      clear();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", clear);
    };
  });
</script>

<section
  class="card"
  id="photos-cloud-setup"
  aria-labelledby="photos-cloud-title"
>
  <h2 id="photos-cloud-title">{t("photosCloudTitle")}</h2>
  <details>
    <summary>{t("photosPermissionHelpShort")}</summary>
    <p>{t("photosCloudHelp")}</p>
  </details>
  <p>{t("photosCloudPrivacy")}</p>
  <label for="photos-cloud-account">{t("connectionAccount")}</label><select
    id="photos-cloud-account"
    required
    bind:value={account}
    disabled={busy}
    onchange={() => {
      clear();
      confirm = false;
      void run(refresh);
    }}
    ><option value="">{t("chooseContext")}</option>{#each accounts as a}<option
        value={a.id}
        >{a.label === a.user ? a.user : a.label + " · " + a.user}</option
      >{/each}</select
  >
  <p id="photos-cloud-status" class="muted">{t(statusKey)}</p>
  <ActionButton
    type="button"
    id="photos-cloud-install"
    hidden={status?.dependencyReady || !status?.setupAvailable}
    disabled={busy}
    onclick={() =>
      void run(async () => {
        message = "photosCloudWorking";
        await request("setup", {});
        await refresh();
      })}
    label={t("photosCloudSetup")}
    icon="download"
  />
  <form
    id="photos-cloud-login"
    hidden={status?.phase === "awaiting_2fa" ||
      status?.phase === "authenticated"}
    onsubmit={(e) => {
      e.preventDefault();
      const secret = password;
      password = "";
      void run(() => action("login", { password: secret }));
    }}
  >
    <fieldset
      id="photos-cloud-login-fields"
      disabled={busy || !status?.dependencyReady}
    >
      <label for="photos-cloud-password">{t("photosCloudPassword")}</label
      ><input
        id="photos-cloud-password"
        type="password"
        autocomplete="current-password"
        maxlength="1024"
        required
        bind:value={password}
      /><ActionButton
        type="submit"
        label={t("photosCloudSignIn")}
        icon="arrow-right"
      />
    </fieldset>
  </form>
  <form
    id="photos-cloud-verify"
    hidden={status?.phase !== "awaiting_2fa"}
    onsubmit={(e) => {
      e.preventDefault();
      const value = code;
      code = "";
      void run(() => action("verify", { code: value }));
    }}
  >
    <label for="photos-cloud-code"
      >{t(
        status?.verificationMethod === "sms"
          ? "photosCloudSmsCode"
          : "photosCloudCode",
      )}</label
    ><input
      id="photos-cloud-code"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      pattern={"[0-9]{6}"}
      maxlength="6"
      required
      bind:value={code}
      disabled={busy}
    /><ActionButton
      type="submit"
      disabled={busy}
      label={t("photosCloudVerify")}
      icon="check"
    /><ActionButton
      type="button"
      id="photos-cloud-send-code"
      disabled={busy}
      onclick={() => void run(() => action("send-code"))}
      label={t(
        status?.verificationMethod === "sms"
          ? "photosCloudSendSms"
          : "photosCloudSendCode",
      )}
      icon="message-square"
    />
  </form>
  <ActionButton
    type="button"
    id="photos-cloud-recheck"
    disabled={busy}
    onclick={() => void run(() => action("recheck"))}
    label={t("photosCloudRecheck")}
    icon="refresh"
  /><ActionButton
    type="button"
    id="photos-cloud-revoke"
    disabled={busy}
    onclick={() => {
      if (!confirm) {
        toast?.push("photosCloudNeedConfirm", "error");
        return;
      }
      void run(async () => {
        await action("revoke", { confirm: true });
        confirm = false;
      });
    }}
    label={t("photosCloudRevoke")}
    icon="unplug"
  /><label
    ><input
      type="checkbox"
      id="photos-cloud-revoke-confirm"
      bind:checked={confirm}
    />{t("photosCloudConfirm")}</label
  >
</section>
