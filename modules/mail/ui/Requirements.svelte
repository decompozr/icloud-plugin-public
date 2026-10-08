<script lang="ts">
 import type{ModuleRequirementsProps}from'@decompozr/ui/contracts';
 import AppPasswordRequirement from '@decompozr/account/ui/AppPasswordRequirement.svelte';
 let props:ModuleRequirementsProps=$props();
</script>
<AppPasswordRequirement {...props}/>
