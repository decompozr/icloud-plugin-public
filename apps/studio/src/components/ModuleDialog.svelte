<script lang="ts">
  import { getContext, untrack } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { AdminModel } from "../lib/admin-model.svelte.js";
  import type { DialogCenter } from "../lib/ui-state.svelte.js";
  import { scopeCopy } from "../lib/admin-model.svelte.js";
  import Modal from "./Modal.svelte";
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
  const networkReady = $derived(
    !model.systemStale &&
      (model.state.localOwner ||
        (model.system?.connectivity ?? model.status?.prerequisites)
          ?.privateReachable === true),
  );
  const ready = $derived(
    !enabling ||
      (!!model.state.enrolled &&
        networkReady &&
        (id === "photos" ? permissionReady === true : credentialReady)),
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
    <h3>{t("moduleRequirements")}</h3>
    <ul class="requirements">
      <li>
        <span>{t("requirementOwner")}</span><span
          >{t(model.state.enrolled ? "ready" : "notReady")}</span
        >
      </li>
      <li>
        <span>Tailscale</span><span
          >{t(networkReady ? "ready" : "notReady")}</span
        >{#if !networkReady}<button
            class="secondary"
            onclick={() => (model.requirementDialog = "tailscale")}
            >{t("setupRequirement")}</button
          >{/if}
      </li>
      {#if id === "photos"}<li>
          <span>{t("requirementPhotos")}</span><span
            >{t(
              permissionReady
                ? "ready"
                : permissionReady === null
                  ? "checking"
                  : "notReady",
            )}</span
          >
        </li>
        <PhotosSetup onverified={(value) => (permissionReady = value)} />
      {:else}<li>
          <span>{t("requirementCredential")}</span><span
            >{t(credentialReady ? "ready" : "notReady")}</span
          >{#if !credentialReady}<button
              type="button"
              class="secondary"
              onclick={() =>
                dialogs.openCredential("app-password", { mode: "add" })}
              >{t("setupRequirement")}</button
            >{/if}
        </li>{/if}
    </ul>
  </section>
  <section>
    <h3>{t("advancedScopes")}</h3>
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
            disabled={model.busy}
            onchange={(e) => toggle(field.id, e.currentTarget.checked)}
          />
        </li>{/each}
    </ul>
  </section>
  <p class="muted">{t("policyNote")}</p>
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
  .requirements {
    list-style: none;
    padding: 0;
  }
  .requirements li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--ui-border);
  }
  .requirements li > span:first-child {
    flex: 1;
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
