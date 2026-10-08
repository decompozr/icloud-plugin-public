<script lang="ts">
 import{onDestroy,untrack}from'svelte';
 import type{BundledModuleUi}from'../contracts.js';
 import type{UiProviderServices}from'../module-host.js';
 import{createModuleUiContext}from'../module-host.js';
 import RequirementStep from './RequirementStep.svelte';import ActionButton from './ActionButton.svelte';
 let{definition,credentialReady=false,onverified,services}:{definition:BundledModuleUi;credentialReady?:boolean;onverified:(ready:boolean)=>void;services:UiProviderServices}=$props();
 const contribution=untrack(()=>definition),provider=untrack(()=>services),report=untrack(()=>onverified);
 const lease=createModuleUiContext(contribution,provider,report);onDestroy(lease.dispose);const{t}=provider.copy;
</script>
{#each contribution.requirements??[] as requirement}
 <RequirementStep title={t(requirement.titleKey)} state={credentialReady?'done':'todo'} hint={t(requirement.hintKey)}>
  {#if !credentialReady}<ActionButton type="button" class="primary" onclick={()=>lease.ctx.account.openCredentials()} label={t('setupRequirement')} icon="settings"/>{/if}
 </RequirementStep>
{/each}
{#if contribution.Section}{@const Section=contribution.Section}<Section ctx={lease.ctx} embedded />{/if}
