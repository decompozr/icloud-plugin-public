<script lang="ts">
  import ActionButton from "@decompozr/ui/components/ActionButton.svelte";
  import { getContext, untrack } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import { scopeCopy } from "../lib/admin-model.svelte.js";
  import Modal from "@decompozr/ui/components/Modal.svelte";
  import RequirementStep from "@decompozr/ui/components/RequirementStep.svelte";
  import RequirementsMount from "@decompozr/ui/components/RequirementsMount.svelte";
  import {bundledModules} from "../lib/bundled-modules.js";
  let { model, dialogs }: { model: AdminModel; dialogs: DialogCenter } =
    $props();
  const { t } = getContext<UiCopy>("copy");
  let confirm = $state(false),
    permissionReady = $state<boolean | null>(null);
  const id = $derived(model.moduleDialog);
  const definition=$derived(bundledModules.find(module=>module.id===id));
  const requirementIdentity=$derived(id?Object.freeze({id}):null);
  const metadata = $derived(
    definition?.presentationMetadata
      ? {
          title: definition.title ?? "",
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
        (definition?.requirement === "native"
          ? permissionReady === true
          : credentialReady)),
  );
  $effect(() => {
    const value = id;
    if (value)
      untrack(() => {
        confirm = false;
        permissionReady = null;
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
    {#if definition && requirementIdentity}
      {#key requirementIdentity}
        {@const mounted=requirementIdentity}
        <RequirementsMount {definition} {credentialReady} onverified={(value)=>{if(requirementIdentity===mounted)permissionReady=value}} />
      {/key}
    {/if}
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
            disabled={model.busy ||
              ("available" in field && field.available === false)}
            onchange={(e) => toggle(field.id, e.currentTarget.checked)}
          />
        </li>
        {#if definition?.fieldHint?.(field.id)}<li class="muted">
            {t(definition.fieldHint!(field.id)!)}
          </li>{/if}
        {#if "available" in field && field.available === false}<li
            class="muted"
          >
            {t(
              definition?.unavailableCopy?.(field.id) ?? 'requirementsMissing',
            )}
          </li>{/if}
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
    <ActionButton
      showLabel
      type="button"
      class="primary"
      disabled={model.busy ||
        !ready ||
        (enabling && !confirm) ||
        !model.changes.length}
      onclick={() => void model.run(save, "workingPolicy")}
      label={t("saveModule")}
      icon="check"
    /><ActionButton
      showLabel
      type="button"
      class="secondary"
      disabled={model.busy}
      onclick={close}
      label={t("cancel")}
      icon="close"
    />
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
