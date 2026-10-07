<script lang="ts">
  import { getContext, untrack } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import { scopeCopy } from "../lib/admin-model.svelte.js";
  import Modal from "./Modal.svelte";
  import RequirementStep from "./RequirementStep.svelte";
  import HomeKitSetup from './HomeKitSetup.svelte';
  import PhotosSetup from "./PhotosSetup.svelte";
  let { model, dialogs }: { model: AdminModel; dialogs: DialogCenter } =
    $props();
  const { t } = getContext<UiCopy>("copy");
  let confirm = $state(false),
    permissionReady = $state<boolean | null>(null),
    generation = 0;
  const id = $derived(model.moduleDialog);
  const metadata = $derived(
    id === "mail"
      ? {
          title: "Mail",
          fields: (model.state.presentation?.capabilities ?? []).map((f) => ({
            id: f.id,
            label: f.label ?? f.id,
            copyKey: f.copyKey,
          })),
        }
      : model.state.modules?.find((m) => m.id === id),
  );
  const draft = $derived(id ? (model.draft[id] ?? {}) : {});
  const enabling = $derived(
    id
      ? Object.entries(draft).some(
          ([key, value]) => value && !model.saved[id]?.[key],
        )
      : false,
  );
  const credentialReady = $derived(
    !model.dashboardFailed &&
      !!model.dashboard?.accounts.some((a) => a.credentialStored),
  );
  const ready = $derived(
    !enabling ||
      (!!model.state.enrolled &&
        (["photos","homekit"].includes(id ?? "") ? permissionReady === true : credentialReady)),
  );
  $effect(() => {
    const value = id;
    if (value)
      untrack(() => {
        confirm = false;
        permissionReady = null;
        const serial = ++generation;
        if (value === "photos")
          void model
            .get("/icloud/admin/photos/status")
            .then((v) => {
              if (serial === generation) permissionReady = v.ready === true;
            })
            .catch(() => {
              if (serial === generation) permissionReady = false;
            });
      });
  });
  function close() {
    if (model.changes.length && !window.confirm(t("discardNavigation"))) return;
    model.discardPolicy();
    model.moduleDialog = undefined;
  }
  function toggle(key: string, value: boolean) {
    if (!id) return;
    model.toggle(id, key, value);
    if (!value && key === "read") model.toggleAll(id, false);
    if (!value && key === "write")
      for (const dependent of ["delete", "schedule", "share", "unsubscribe"])
        if (dependent in draft) model.toggle(id, dependent, false);
    confirm = false;
  }
  async function save() {
    if (!ready || (enabling && !confirm)) {
      model.message("requirementsMissing", true);
      return;
    }
    await model.savePolicies(enabling && confirm);
    model.moduleDialog = undefined;
  }
</script>

<Modal
  open={!!id}
  title={(metadata?.title ?? "") + " · " + t("moduleSettings")}
  onclose={close}
  busy={model.busy}
>
  <section>
    {#if id === 'homekit'}<HomeKitSetup embedded onverified={(value)=>{if(id==='homekit')permissionReady=value;}}/>
    {:else if id === 'photos'}<PhotosSetup onverified={(value)=>{if(id==='photos')permissionReady=value;}}/>
    {:else}<RequirementStep title={t('requirementCredential')} state={credentialReady?'done':'todo'} hint={t('accountCredentialInstruction')}>
      {#if !credentialReady}<button type="button" class="primary" onclick={()=>dialogs.openCredential('app-password',{mode:'add'})}>{t('setupRequirement')}</button>{/if}
    </RequirementStep>{/if}
  </section>
  <section>
    <h3>{t("moduleActionsShort")}</h3>
    <ul class="checks">
      {#each metadata?.fields ?? [] as field}<li>
          <label for={"scope-" + id + "-" + field.id}
            >{scopeCopy[id + "." + field.id]
              ? t(scopeCopy[id + "." + field.id])
              : "copyKey" in field && typeof field.copyKey === "string"
                ? t(field.copyKey)
                : field.label}</label
          ><input
            id={"scope-" + id + "-" + field.id}
            type="checkbox"
            checked={draft[field.id] ?? false}
            disabled={model.busy || ("available" in field && field.available === false)}
            onchange={(e) => toggle(field.id, e.currentTarget.checked)}
          />
        </li>
        {#if id === "photos" && field.id === "delete"}<li class="muted">{t("photosDeleteHelp")}</li>{/if}
        {#if "available" in field && field.available === false}<li class="muted">{t(id==='homekit'?(field.id==='control'?'homekitControlDisabled':'homekitAutomationDisabled'):"photosCapabilityUnavailable")}</li>{/if}
        {:else}<li class="muted">{t("emptyValue")}</li>{/each}
    </ul>
  </section>
  <p class="muted">{t("moduleConsentShort")}</p>
  {#if enabling}<p>{t(ready ? "requirementsReady" : "requirementsMissing")}</p>
    <label class="confirmation"
      ><input
        type="checkbox"
        bind:checked={confirm}
        disabled={!ready || model.busy}
      /><span>{t("moduleConfirm")}</span></label
    >{/if}
  <div class="actions">
    <button
      type="button"
      class="primary"
      disabled={model.busy ||
        !ready ||
        (enabling && !confirm) ||
        !model.changes.length}
      onclick={() => void model.run(save, "workingPolicy")}
      >{t("saveModule")}</button
    ><button
      type="button"
      class="secondary"
      disabled={model.busy}
      onclick={close}>{t("cancel")}</button
    >
  </div>
</Modal>

<style>
  h3 {
    border-top: 0;
    padding-top: 0;
    margin-top: 1rem;
  }
  .confirmation {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    font-weight: 400;
  }
  .confirmation input {
    margin-top: 0.15rem;
  }
</style>
