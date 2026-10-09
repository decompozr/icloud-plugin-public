<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy} from '../contracts.js';
 import type {BundledModuleUi} from '@decompozr/ui/contracts';
 import RequirementsMount from '@decompozr/ui/components/RequirementsMount.svelte';
 import StatusMarker from '@decompozr/ui/components/StatusMarker.svelte';
 let {definition,requirementIdentity,credentialReady,credentialKnown,requirementsReady,requirementUnknown,onverified}:{definition?:BundledModuleUi;requirementIdentity:{id:string}|null;credentialReady:boolean;credentialKnown:boolean;requirementsReady:boolean;requirementUnknown:boolean;onverified:(value:boolean)=>void}=$props();
 const {t}=getContext<UiCopy>('copy');
</script>
<section class="module-requirements" aria-label={t('moduleRequirementsTitle')}>
 <header class="module-section-heading requirements-heading">
  <StatusMarker state={requirementsReady?'ready':requirementUnknown?'unknown':'missing'} label={t(requirementsReady?'requirementsReadyShort':requirementUnknown?'requirementsUnknownShort':'requirementsNeededShort')}/>
  <h3>{t('moduleRequirementsTitle')}</h3>
 </header>
 {#if definition && requirementIdentity}{#key requirementIdentity}
 {@const mounted=requirementIdentity}
 <RequirementsMount {definition} {credentialReady} {credentialKnown} onverified={value=>{if(requirementIdentity===mounted)onverified(value)}}/>
 {/key}{/if}
</section>
