<script lang="ts">
 import{getContext,onDestroy,untrack}from'svelte';import{createModuleUiContext}from'@decompozr/ui/module-host.js';import type{BundledModuleUi,ModulePage,UiCopy}from'@decompozr/ui/contracts';import type{DialogCenter,ToastCenter}from'../lib/ui-state.svelte.js';import{moduleUiProvider}from'../lib/module-ui-provider.js';
 let{module,page}:{module:BundledModuleUi;page:ModulePage}=$props();
 const Renderer=untrack(()=>page.Component),services=moduleUiProvider(getContext<UiCopy>('copy'),getContext<ToastCenter>('toast'),getContext<DialogCenter>('dialogs'));
 const lease=createModuleUiContext(untrack(()=>module),services);onDestroy(lease.dispose);
</script>
<Renderer ctx={lease.ctx}/>
