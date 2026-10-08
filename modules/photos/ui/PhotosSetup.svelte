<script lang="ts">
  import ActionButton from "@decompozr/ui/components/ActionButton.svelte";
  import { getContext, onMount, untrack } from "svelte";
  import type { UiCopy } from "@decompozr/ui/contracts";
  import type { ToastCenter } from "@decompozr/ui/toast-state.svelte.js";
  import { z } from "zod";
  import RequirementStep from "@decompozr/ui/components/RequirementStep.svelte";
  let {
    active = true,
    onverified,
  }: { active?: boolean; onverified?: (ready: boolean) => void } = $props();
  const { t } = getContext<UiCopy>("copy");
  const toast = getContext<ToastCenter>("toast");
  let busy = $state(false);
  let pollingUntil = 0;
  const schema = z.object({
    libraryReadable: z.boolean(),
    libraryStatus: z.string(),
    authorization: z.enum([
      "not_requested",
      "restricted",
      "denied",
      "authorized",
      "limited",
      "unavailable",
    ]),
    ready: z.boolean(),
  });
  let last = $state<z.infer<typeof schema>>(),
    checkedAt = $state(""),
    failed = $state(false);
  const result = $derived(
    last
      ? last.ready
        ? "photosPermissionReady"
        : !last.libraryReadable
          ? "photosLibraryUnavailable"
          : "photosAuthorization_" + last.authorization
      : "",
  );
  async function run(action?: string) {
    if (busy || !active) return;
    busy = true;
    try {
      const r = await fetch(
        "/icloud/admin/photos/" + (action ? "action" : "status"),
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
          ...(action
            ? {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action }),
              }
            : {}),
        },
      );
      if (!r.ok) throw Error();
      if (action) {
        pollingUntil = Date.now() + 120000;
      } else {
        last = schema.parse(await r.json());
        onverified?.(last.ready);
        checkedAt = new Date().toISOString();
      }
      failed = false;
    } catch {
      failed = true;
      toast?.push("photosPermissionFailed", "error");
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    let lastFocus = Date.now();
    const focus = () => {
      if (!document.hidden && Date.now() - lastFocus >= 1000) {
        lastFocus = Date.now();
        void run();
      }
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(() => {
      if (Date.now() < pollingUntil && !last?.ready && !document.hidden)
        void run();
    }, 2000);
    return () => {
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  });
  $effect(() => {
    if (active) untrack(() => void run());
  });
</script>

<section id="photos-setup" aria-label={t("photosTitle")}>
  <RequirementStep
    title={t("photosRead")}
    state={failed
      ? "error"
      : !last
        ? "checking"
        : last.libraryReadable
          ? "done"
          : "todo"}
    hint={t("photosReadInstruction")}
  >
    {#if !last?.libraryReadable}<ActionButton
        type="button"
        class="primary"
        data-photos-action="files"
        disabled={busy}
        onclick={() => void run("files")}
        label={t("photosLibraryOpen")}
        icon="folder"
      />{/if}
  </RequirementStep>
  <RequirementStep
    title={t("photosOrganizeAccess")}
    state={failed
      ? "error"
      : !last
        ? "checking"
        : last.authorization === "authorized"
          ? "done"
          : "todo"}
    hint={t("photosAccessInstruction")}
  >
    {#if last?.authorization !== "authorized"}<ActionButton
        type="button"
        class="primary"
        data-photos-action="authorize"
        disabled={busy}
        onclick={() => void run("authorize")}
        label={t("photosAuthorizationRequest")}
        icon="check"
      />
      {#if last?.authorization === "denied" || last?.authorization === "restricted"}<ActionButton
          type="button"
          class="secondary"
          data-photos-action="photos"
          disabled={busy}
          onclick={() => void run("photos")}
          label={t("photosAuthorizationOpen")}
          icon="settings"
        />{/if}
    {/if}
  </RequirementStep>
  {#if failed}<p class="error" role="alert">
      {t("photosPermissionFailed")}
    </p>{/if}
  <div class="status-row">
    <span id="photos-status" role="status" aria-live="polite"
      >{last?.ready ? t("requirementsReady") : busy ? t("checking") : ""}</span
    ><ActionButton
      type="button"
      class="secondary"
      id="photos-recheck"
      disabled={busy}
      onclick={() => void run()}
      label={t("checkAgainShort")}
      icon="refresh"
    />
  </div>
  <details class="help">
    <summary>{t("photosPermissionHelpShort")}</summary>
    <p>{t("photosMetadataHelp")}</p>
    <ActionButton
      type="button"
      class="secondary"
      disabled={busy}
      onclick={() => void run("automation")}
      label={t("photosAutomationOpen")}
      icon="settings"
    />
  </details>
</section>

<style>
  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--ui-muted);
  }
  .help {
    margin-top: 12px;
    font-size: 12px;
  }
  .help p {
    font-size: 13px;
  }
  .help summary {
    cursor: pointer;
  }
</style>
