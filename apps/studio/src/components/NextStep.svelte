<script lang="ts">
  import { getContext } from 'svelte';
  import type { UiCopy } from '../contracts.js';
  import type { AdminModel } from '../lib/admin-model.svelte.js';
  import type { DialogCenter } from '../lib/ui-state.svelte.js';
  import { nextSetupTask } from '../lib/next-setup-task.js';
  import ActionButton from '@decompozr/ui/components/ActionButton.svelte';
  import type { IconName } from '@decompozr/ui/design-system/icons.js';
  let { model, dialogs, onconnections, oncapabilities }: { model: AdminModel; dialogs: DialogCenter; onconnections: () => void; oncapabilities: () => void } = $props();
  const { t } = getContext<UiCopy>('copy');
  const connectivity = $derived(model.system?.connectivity ?? model.status?.prerequisites);
  const task = $derived(nextSetupTask({
    fresh: !model.dashboardFailed && !model.systemStale && !model.diagnosticsFailed,
    networkReady: connectivity ? (['installed','authenticated','online','privateReachable'].some(key => connectivity[key as keyof typeof connectivity] == null) ? null : ['installed','authenticated','online','privateReachable'].every(key => connectivity[key as keyof typeof connectivity] === true)) : null,
    credentialStored: model.dashboard ? model.dashboard.accounts.some(account => account.credentialStored) : null,
    capabilitiesEnabled: model.dashboard ? (Object.values(model.saved).some(policy => policy && Object.values(policy).some(Boolean)) ? true : Object.values(model.saved).some(policy => !policy) ? null : false) : null,
    clientCount: model.clients?.length ?? null,
  }));
  const copy = {
    refresh: ['nextRefreshTitle','nextRefreshHelp','nextRefreshAction','refresh'],
    network: ['nextNetworkTitle','nextNetworkHelp','tailscaleSetup','settings'],
    account: ['nextAccountTitle','nextAccountHelp','addAccount','plus'],
    capabilities: ['nextCapabilitiesTitle','nextCapabilitiesHelp','chooseCapabilities','settings'],
    client: ['nextClientTitle','nextClientHelp','connectTitle','connection'],
    review: ['nextReviewTitle','nextReviewHelp','navConnections','connection'],
  } as const;
  function act() {
    if (task === 'refresh') void model.run(() => model.refreshCard('all'));
    else if (task === 'network') model.requirementDialog = 'tailscale';
    else if (task === 'account') dialogs.openCredential('app-password', { mode: 'add' });
    else if (task === 'capabilities') oncapabilities();
    else if (task === 'client') model.requirementDialog = 'client';
    else onconnections();
  }
</script>

<section class="next-step" data-testid="next-step" data-next-task={task}>
  <div><h2>{t(copy[task][0])}</h2><p>{t(copy[task][1])}</p></div>
  <ActionButton showLabel class="primary" label={t(copy[task][2])} icon={copy[task][3] as IconName} disabled={model.busy} onclick={act} />
</section>
