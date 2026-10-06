<script lang="ts">
  import { getContext, onMount, untrack } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import { z } from "zod";
  let { active = true }: { active?: boolean } = $props();
  const { t } = getContext<UiCopy>("copy");
  let busy = $state(false),
    message = $state("");
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
      if (action) message = "photosPermissionOpened";
      else {
        last = schema.parse(await r.json());
        checkedAt = new Date().toISOString();
        message = "";
      }
      failed = false;
    } catch {
      failed = true;
      message = "photosPermissionFailed";
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    let lastFocus = Date.now();
    const focus = () => {
      if (!document.hidden && Date.now() - lastFocus >= 30000) {
        lastFocus = Date.now();
        void run();
      }
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  });
  $effect(() => {
    if (active) untrack(() => void run());
  });
</script>

<section class="card" id="photos-setup" aria-labelledby="photos-setup-title">
  <h2 id="photos-setup-title">{t("photosSetupTitle")}</h2>
  <p>{t("photosSetupHelp")}</p>
  <ol style="list-style:none;padding-left:0">
    <li style="margin-bottom:1rem" data-photos-step="library">
      <strong>{t("photosLibraryStep")}</strong>
      <p>{t("photosLibraryHelp")}</p>
      <button
        type="button"
        class="secondary"
        data-photos-action="files"
        disabled={busy}
        onclick={() => void run("files")}>{t("photosLibraryOpen")}</button
      >
    </li>
    <li style="margin-bottom:1rem" data-photos-step="authorization">
      <strong>{t("photosAuthorizationStep")}</strong>
      <p>{t("photosAuthorizationHelp")}</p>
      <button
        type="button"
        class="primary"
        data-photos-action="authorize"
        disabled={busy}
        onclick={() => void run("authorize")}
        >{t("photosAuthorizationRequest")}</button
      >
      <button
        type="button"
        class="secondary"
        data-photos-action="photos"
        disabled={busy}
        onclick={() => void run("photos")}
        >{t("photosAuthorizationOpen")}</button
      >
    </li>
    <li style="margin-bottom:1rem" data-photos-step="verify">
      <strong>{t("photosVerificationStep")}</strong>
      <p>{t("photosVerificationHelp")}</p>
      <p id="photos-status" role="status" aria-live="polite">
        {failed && last ? t("photosPreviousResult") + " " : ""}{failed &&
        last &&
        result
          ? t(result)
          : message
            ? t(message)
            : result
              ? t(result)
              : ""}{checkedAt
          ? " · " +
            t("photosCheckedAt") +
            " " +
            new Date(checkedAt).toLocaleString()
          : ""}{failed && last ? " · " + t("freshnessFailed") : ""}
      </p>
      <button
        type="button"
        class="secondary"
        id="photos-recheck"
        disabled={busy}
        onclick={() => void run()}>{t("photosVerificationCheck")}</button
      >
    </li>
  </ol>
  <details>
    <summary>{t("photosMetadataDetails")}</summary>
    <p>{t("photosMetadataHelp")}</p>
    <a
      href="x-apple.systempreferences:com.apple.preference.security?Privacy_Photos"
      >Photos</a
    >
    ·
    <a
      href="x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
      >Full Disk Access</a
    >
    ·
    <a
      href="x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
      >Automation</a
    >
  </details>
</section>
