<script lang="ts">
 import type{ModuleRequirementsProps}from'../../../packages/ui/src/contracts.js';
 import AppPasswordRequirement from '../../account/ui/AppPasswordRequirement.svelte';
 let props:ModuleRequirementsProps=$props();
</script>
<AppPasswordRequirement {...props}/>
