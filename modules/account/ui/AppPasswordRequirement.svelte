<script lang="ts">
 import {getContext} from 'svelte';
 import type{UiCopy,ModuleRequirementsProps}from'@decompozr/ui/contracts';
 import type{DialogCenter}from'./dialog-state.svelte.js';
 import RequirementStep from '@decompozr/ui/components/RequirementStep.svelte';
 import ActionButton from '@decompozr/ui/components/ActionButton.svelte';
 let{credentialReady=false,credentialKnown=true}:ModuleRequirementsProps=$props();
 const{t}=getContext<UiCopy>('copy');const dialogs=getContext<DialogCenter>('dialogs');
</script>
<RequirementStep title={t(!credentialKnown?'appPasswordUnknown':credentialReady?'appPasswordStored':'appPasswordMissing')} state={!credentialKnown?'waiting':credentialReady?'done':'todo'} hint={t('accountCredentialInstruction')}>
 {#if !credentialReady}<ActionButton showLabel type="button" class="primary" onclick={()=>dialogs.openCredential('app-password',{mode:'add'})} label={t('setupRequirement')} icon="settings" />{/if}
</RequirementStep>
