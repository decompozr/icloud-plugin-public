<script lang="ts">
 import {getContext} from 'svelte';
 import type{UiCopy,ModuleRequirementsProps}from'../../../packages/ui/src/contracts.js';
 import type{DialogCenter}from'./dialog-state.svelte.js';
 import RequirementStep from '../../../packages/ui/src/components/RequirementStep.svelte';
 import ActionButton from '../../../packages/ui/src/components/ActionButton.svelte';
 let{credentialReady=false}:ModuleRequirementsProps=$props();
 const{t}=getContext<UiCopy>('copy');const dialogs=getContext<DialogCenter>('dialogs');
</script>
<RequirementStep title={t('requirementCredential')} state={credentialReady?'done':'todo'} hint={t('accountCredentialInstruction')}>
 {#if !credentialReady}<ActionButton type="button" class="primary" onclick={()=>dialogs.openCredential('app-password',{mode:'add'})} label={t('setupRequirement')} icon="settings" />{/if}
</RequirementStep>
