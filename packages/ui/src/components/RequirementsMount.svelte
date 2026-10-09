<script lang="ts">
 import{onDestroy,untrack}from'svelte';
 import type{BundledModuleUi,ModuleRequirementsProps}from'../contracts.js';
 let{definition,credentialReady,credentialKnown,onverified}:{definition:BundledModuleUi;credentialReady?:boolean;credentialKnown?:boolean;onverified:(ready:boolean)=>void}=$props();
 const Requirements=untrack(()=>definition.Requirements);
 const report=untrack(()=>onverified);let mounted=true;
 onDestroy(()=>{mounted=false});
 // The child receives one stable callback for this mounted dialog. Late results
 // cannot read a newer parent props getter and report into another dialog.
 function verified(value:boolean){if(mounted)report(value)}
</script>
<Requirements {credentialReady} {credentialKnown} onverified={verified}/>
