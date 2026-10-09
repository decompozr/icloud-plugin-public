<script lang="ts">
 import CapabilityConfig from './CapabilityConfig.svelte';
 import type {AdminModel} from '../lib/admin-model.svelte.js';
 import type {DialogCenter} from '../lib/ui-state.svelte.js';
 let {model,dialogs}:{model:AdminModel;dialogs:DialogCenter}=$props();
</script>
<CapabilityConfig {model} {dialogs}/>
