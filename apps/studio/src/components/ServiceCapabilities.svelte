<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy} from '../contracts.js';
 import type {AdminModel} from '../lib/admin-model.svelte.js';
 import Tag from '@decompozr/ui/design-system/Tag.svelte';
 import RefreshButton from '@decompozr/ui/components/RefreshButton.svelte';
 import Skeleton from '@decompozr/ui/components/Skeleton.svelte';
 import CapabilityCard from './CapabilityCard.svelte';
 let {model,modules,openModule,region=$bindable()}:{model:AdminModel;modules:{id:string;title:string}[];openModule:(id:string,enable?:boolean)=>void;region?:HTMLElement}=$props();
 const {t}=getContext<UiCopy>('copy');
</script>
  <section
    class="card wide capabilities-target"
    bind:this={region}
    tabindex="-1"
    aria-label={t("capabilitiesCard")}
    data-testid="capabilities-card"
    aria-busy={model.accountsLoading}
  >
    <header>
      <div class="card-heading"><h2>{t("capabilitiesCard")}</h2>{#if model.dashboardFailed}<Tag label={t("snapshotStale")} />{/if}</div>
      <RefreshButton
        id="capabilities-refresh"
        label={t("refreshCapabilities")}
        busy={model.accountsLoading || model.busy}
        onclick={() => model.run(() => model.refreshCard("capabilities"))}
      />
    </header>

    {#if model.state.admin && model.accountsLoading && !model.dashboard}<Skeleton
        rows={3}
      />{:else}{#each modules as module}{@const policy = model.saved[module.id]}
        <CapabilityCard {model} {module} {openModule}/>{/each}{/if}

    {#if modules.some((module) => module.id === "photos")}<p
        class="muted"
        data-testid="photos-shared-write-unsupported"
      >
        {t("photosUnsupported")}
      </p>{/if}
    {#if model.dashboardFailed}<p class="muted">{t("freshnessFailed")}</p>{/if}
  </section>