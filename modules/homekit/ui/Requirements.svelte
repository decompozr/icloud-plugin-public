<script lang="ts">
 import type{ModuleRequirementsProps}from'@decompozr/ui/contracts';
 import Setup from './HomeKitSetup.svelte';
 let{onverified}:ModuleRequirementsProps=$props();
</script>
<Setup embedded {onverified}/>
