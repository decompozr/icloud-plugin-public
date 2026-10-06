<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  import Modal from "./Modal.svelte";
  import PhotosSetup from "./PhotosSetup.svelte";
  import RefreshButton from "./RefreshButton.svelte";
  import Icon from "./Icon.svelte";
  let { model }: { model: AdminModel } = $props();
  const { t } = getContext<UiCopy>("copy"),
    toast = getContext<ToastCenter>("toast");
  const kind = $derived(model.requirementDialog);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast?.push("copied");
    } catch {
      toast?.push("copyFailed", "error");
    }
  }
</script>

<Modal
  open={!!kind}
  title={t(
    kind === "tailscale"
      ? "tailscaleSetup"
      : kind === "owner"
        ? "ownerSetup"
        : kind === "photos"
          ? "photosPermissions"
          : "connectTitle",
  )}
  onclose={() => (model.requirementDialog = undefined)}
  busy={model.busy}
>
  {#if kind === "tailscale"}<p>{t("tailscaleSetupHelp")}</p>
    <ul class="checks">
      {#each ["installed", "authenticated", "online", "privateReachable"] as key}<li
        >
          <span>{t(key)}</span><span
            >{t(
              (model.system?.connectivity ?? model.status?.prerequisites)?.[
                key as
                  "installed" | "authenticated" | "online" | "privateReachable"
              ] === true
                ? "ready"
                : "notReady",
            )}</span
          >
        </li>{/each}
    </ul>
    <p>
      <a href="https://tailscale.com/download" target="_blank" rel="noreferrer"
        >{t("download")}</a
      >
    </p>
    <p>
      <a
        href="https://tailscale.com/docs/features/tailscale-serve"
        target="_blank"
        rel="noreferrer">{t("serveHelp")}</a
      >
    </p>
    {#each model.state.connectionCommands ?? [] as command}<div
        class="copy-row"
      >
        <code>{command}</code><button
          class="secondary icon-button"
          aria-label={t("copyValue")}
          onclick={() => void copy(command)}>⧉</button
        >
      </div>{/each}
    <div class="actions">
      <RefreshButton
        label={t("refreshService")}
        busy={model.busy}
        onclick={() =>
          void model.run(() =>
            model.state.admin ? model.refreshCard("service") : model.check(),
          )}
      />
    </div>
  {:else if kind === "owner"}<p>{t("ownerSetupHelp")}</p>
    <p>{t("ownerNote")}</p>
    <button
      id="register"
      type="button"
      class="primary button-icon"
      disabled={model.busy || !model.canRegister}
      onclick={() => void model.run(() => model.enroll(), "passkeyLoading")}
      ><Icon name="passkey" />{t(
        model.status?.passkeyRegistered ? "resume" : "register",
      )}</button
    >{#if !model.canRegister}<p class="muted">{t("ownerDenied")}</p>{/if}
  {:else if kind === "photos"}<PhotosSetup />
  {:else}<p>{t("connectIntro")}</p>
    {#if model.state.publicMcpUrl}<div class="copy-row">
        <code>{model.state.publicMcpUrl}</code><button
          class="secondary"
          onclick={() => void copy(model.state.publicMcpUrl!)}
          >{t("copyValue")}</button
        >
      </div>{/if}{/if}
</Modal>
