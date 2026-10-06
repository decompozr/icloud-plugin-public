<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  import RequirementStep from "./RequirementStep.svelte";
  import Modal from "./Modal.svelte";
  import PhotosSetup from "./PhotosSetup.svelte";
  import RefreshButton from "./RefreshButton.svelte";
  import Icon from "./Icon.svelte";
  let { model }: { model: AdminModel } = $props();
  const { t } = getContext<UiCopy>("copy"),
    toast = getContext<ToastCenter>("toast");
  const kind = $derived(model.requirementDialog);
  const connectivity=$derived(model.system?.connectivity ?? model.status?.prerequisites);
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
  {#if kind === 'tailscale'}
    <RequirementStep title={t('installTailscaleShort')} state={connectivity?.installed?'done':'todo'} hint={t('installTailscaleHint')}>
      <a class="primary" href="https://tailscale.com/download" target="_blank" rel="noreferrer">{t('download')}</a>
    </RequirementStep>
    <RequirementStep title={t('connectTailscaleShort')} state={connectivity?.authenticated&&connectivity?.online?'done':!connectivity?.installed?'waiting':'todo'} hint={t('connectTailscaleHint')}>
      <a class="primary" href="tailscale://">{t('openTailscaleShort')}</a>
    </RequirementStep>
    <RequirementStep title={t('publishTailscaleShort')} state={connectivity?.privateReachable?'done':!connectivity?.online?'waiting':'todo'} hint={t('publishTailscaleHint')}>
      {#each model.state.connectionCommands ?? [] as command}<div class="copy-row"><code>{command}</code><button type="button" class="secondary" aria-label={t('copyValue')} onclick={()=>void copy(command)}>{t('copyValue')}</button></div>{/each}
      <details><summary>{t('photosPermissionHelpShort')}</summary><a href="https://tailscale.com/docs/features/tailscale-serve" target="_blank" rel="noreferrer">{t('serveHelp')}</a></details>
    </RequirementStep>
    <div class="actions"><RefreshButton label={t('checkAgainShort')} busy={model.busy} onclick={()=>void model.run(()=>model.state.admin?model.refreshCard('service'):model.check())}/></div>
  {:else if kind === 'owner'}
    <RequirementStep title={t('ownerPasskeyShort')} state={model.state.admin?'done':model.canRegister?'todo':'waiting'} hint={t('ownerPasskeyHint')}>
      <button id="register" type="button" class="primary button-icon" disabled={model.busy||!model.canRegister} onclick={()=>void model.run(()=>model.enroll(),'passkeyLoading')}><Icon name="passkey"/>{t(model.status?.passkeyRegistered?'resume':'register')}</button>
    </RequirementStep>
    {#if !model.canRegister&&!model.state.admin}<p class="muted">{t('ownerDenied')}</p>{/if}
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
