<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import type { UiCopy } from '../contracts.js';
  import type { AdminModel } from '../lib/admin-model.svelte.js';
  import type { DialogCenter } from '../lib/ui-state.svelte.js';
  import { bundledModules } from '../lib/bundled-modules.js';
  import { actionDraft } from '../lib/action-draft.js';
  import Modal from '@decompozr/ui/components/Modal.svelte';
  import ActionButton from '@decompozr/ui/components/ActionButton.svelte';
  import CapabilityRequirements from './CapabilityRequirements.svelte';
  import AllowedActions from './AllowedActions.svelte';
  import {moduleUiProvider} from '../lib/module-ui-provider.js';
  import type {ToastCenter} from '../lib/ui-state.svelte.js';
  let { model, dialogs }: { model: AdminModel; dialogs: DialogCenter } = $props();
  const copy = getContext<UiCopy>('copy'); const {t}=copy;
  const services=untrack(()=>moduleUiProvider(copy,getContext<ToastCenter>('toast'),dialogs));
  let permissionReady = $state<boolean | null>(null);
  let renderedId = $state<string>();
  $effect(() => { if (model.moduleDialog) renderedId = model.moduleDialog; });
  const id = $derived(model.moduleDialog ?? renderedId);
  const definition = $derived(bundledModules.find(module => module.id === id));
  const requirementIdentity = $derived(id ? Object.freeze({ id }) : null);
  const metadata = $derived(definition?.presentationMetadata
    ? { title: definition.title ?? '', fields: (model.state.presentation?.capabilities ?? []).map(field => ({ id: field.id, label: field.label ?? field.id, copyKey: field.copyKey, available: true })) }
    : model.state.modules?.find(module => module.id === id));
  const draft = $derived(id ? model.draft[id] ?? {} : {});
  const policyKnown = $derived(!!id && !!model.saved[id]);
  const dependencies = $derived(definition?.actionDependencies ?? {});
  const editable = $derived((metadata?.fields ?? []).filter(field => field.available !== false).map(field => field.id));
  const allOn = $derived(editable.length > 0 && editable.every(key => draft[key]));
  const enabling = $derived(!!id && Object.entries(draft).some(([key, value]) => value && !model.saved[id!]?.[key]));
  const credentialKnown = $derived(!!model.dashboard && !model.dashboardFailed);
  const credentialReady = $derived(credentialKnown && !!model.dashboard?.accounts.some(account => account.credentialStored));
  const requirementsReady = $derived(model.state.enrolled && (definition?.requirement === 'native' ? permissionReady === true : credentialReady));
  const requirementUnknown = $derived(definition?.requirement === 'native' ? permissionReady === null : !credentialKnown);
  const canSave = $derived(!enabling || requirementsReady);
  $effect(() => { if (id) untrack(() => { permissionReady = null; }); });
  function close() {
    if (model.busy) return;
    model.discardPolicy(); model.moduleDialog = undefined;
  }
  function toggle(value: boolean, key?: string) {
    if (!model.moduleDialog || !id || !policyKnown || model.busy) return;
    model.draft[id] = actionDraft(draft, editable, dependencies, value, key);
    model.message('');
  }
  async function save() {
    if (!canSave || !policyKnown) { model.message('requirementsMissing', true); return; }
    // The explicit Save click confirms this reviewed draft. Backend checks remain authoritative.
    await model.savePolicies(enabling);
    model.moduleDialog = undefined;
  }
</script>

<Modal open={!!model.moduleDialog} onclosed={() => { if (!model.moduleDialog) renderedId = undefined; }} title={(metadata?.title ?? '') + ' ' + t('moduleSettings')} onclose={close} busy={model.busy}>
  <CapabilityRequirements {services} {definition} {requirementIdentity} {credentialReady} {credentialKnown} {requirementsReady} {requirementUnknown} onverified={value => { permissionReady = value; }} />
  <AllowedActions {id} fields={metadata?.fields ?? []} {definition} {draft} saved={id ? model.saved[id] ?? {} : {}} {editable} {dependencies} {allOn} disabled={model.busy || !policyKnown} ontoggle={toggle} />
  <div class="actions capability-config-actions">
    <ActionButton appearance="quiet" class="primary" label={t('saveModule')} icon="save" disabled={model.busy || !canSave || !model.changes.length} onclick={() => void model.run(save, 'workingPolicy')} />
    <ActionButton appearance="quiet" label={t('cancel')} icon="close" disabled={model.busy} onclick={close} />
  </div>
</Modal>
