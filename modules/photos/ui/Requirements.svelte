<script lang="ts">
 import type{ModuleRequirementsProps}from'@decompozr/ui/contracts';
 import Setup from './PhotosSetup.svelte';
 let{onverified}:ModuleRequirementsProps=$props();
</script>
<Setup {onverified}/>
