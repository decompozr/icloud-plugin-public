<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  import Modal from "./Modal.svelte";
  let { available = false }: { available?: boolean } = $props();
  const { t } = getContext<UiCopy>("copy"),
    toast = getContext<ToastCenter>("toast");
  let mode = $state<"connections" | "factory" | undefined>(),
    confirmation = $state(""),
    busy = $state(false),
    waiting = $state(false),
    uncertain = $state(false);
  const phrase = $derived(
    mode === "factory" ? "RESET ALL" : "RESET CONNECTIONS",
  );
  function open(value: "connections" | "factory") {
    mode = value;
    confirmation = "";
    waiting = false;
    uncertain = false;
  }
  function close() {
    if (!busy) {
      mode = undefined;
      confirmation = "";
    }
  }
  async function submit() {
    if (!mode || confirmation !== phrase || busy) return;
    busy = true;
    let rejected = false;
    try {
      const r = await fetch("/icloud/admin/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, confirmation, confirm: true }),
      });
      if (r.status !== 202) {
        rejected = true;
        throw Error();
      }
      const value = await r.json();
      if (typeof value.id !== "string" || !/^[a-f0-9]{64}$/.test(value.id))
        throw Error();
      waiting = true;
      confirmation = "";
      toast.push("resetQueued", "info");
      // A reset receipt survives the restart; no blind retry of the destructive POST.
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        try {
          const status = await fetch(
            "/icloud/admin/reset/status?id=" + encodeURIComponent(value.id),
            {
              cache: "no-store",
              credentials: "same-origin",
              signal: AbortSignal.timeout(3000),
            },
          );
          if (!status.ok) continue;
          const result = await status.json();
          if (result.phase === "completed") {
            location.assign(
              mode === "factory" ? "/icloud/setup" : "/icloud/sign-in",
            );
            return;
          }
          if (result.phase === "failed") throw new Error("RESET_FAILED");
        } catch (e) {
          if (e instanceof Error && e.message === "RESET_FAILED") throw e;
        }
      }
      toast.push("resetWaitExpired", "error");
    } catch {
      uncertain = !waiting && !rejected;
      toast.push(
        uncertain
          ? "resetUnknown"
          : waiting
            ? "resetFailed"
            : "resetRequestFailed",
        "error",
      );
    } finally {
      busy = false;
    }
  }
</script>

<section class="reset-section">
  <h2>{t("resetTitle")}</h2>
  <p class="muted">{t("resetSummary")}</p>
  {#if available}<div class="actions">
      <button
        type="button"
        class="secondary"
        onclick={() => open("connections")}>{t("resetConnections")}</button
      ><button type="button" class="danger" onclick={() => open("factory")}
        >{t("resetFactory")}</button
      >
    </div>{:else}<p class="muted">{t("resetUnavailable")}</p>{/if}
</section>
<Modal
  open={!!mode}
  title={t(mode === "factory" ? "resetFactory" : "resetConnections")}
  onclose={close}
  {busy}
  >{#if uncertain}<p role="alert">{t("resetUnknown")}</p>
    <p class="muted">{t("resetNoRetry")}</p>{:else if waiting}<p role="status">
      {t("resetWaiting")}
    </p>
    <p class="muted">{t("resetNoRetry")}</p>{:else}<p>
      {t(mode === "factory" ? "resetFactoryHelp" : "resetConnectionsHelp")}
    </p>
    <p class="muted">{t("resetPreserved")}</p>
    <p class="muted">{t("resetBackupHelp")}</p>
    <label for="reset-confirmation"
      >{t("resetTypePhrase")} <code>{phrase}</code></label
    ><input
      id="reset-confirmation"
      bind:value={confirmation}
      autocomplete="off"
      spellcheck="false"
      disabled={busy}
    />
    <div class="actions">
      <button
        type="button"
        class="danger"
        disabled={busy || confirmation !== phrase}
        onclick={() => void submit()}>{t("resetConfirm")}</button
      ><button type="button" class="secondary" disabled={busy} onclick={close}
        >{t("cancel")}</button
      >
    </div>{/if}</Modal
>

<style>
  .reset-section {
    border-top: 1px solid var(--ui-border);
    margin-top: 1.5rem;
    padding-top: 1.25rem;
  }
</style>
