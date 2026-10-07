<script lang="ts">
 import type{ModuleRequirementsProps}from'../../../packages/ui/src/contracts.js';
 import Setup from './HomeKitSetup.svelte';
 let{onverified}:ModuleRequirementsProps=$props();
</script>
<Setup embedded {onverified}/>
