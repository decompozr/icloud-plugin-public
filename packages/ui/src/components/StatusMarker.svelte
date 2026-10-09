<script lang="ts">
 import DesignIcon from './DesignIcon.svelte';
 let {state,label,dot=false}:{state:'ready'|'missing'|'unknown';label:string;dot?:boolean}=$props();
</script>
<span class:status-dot={dot} class:status-marker={!dot} data-state={state} role="img" aria-label={label} title={label}>
 {#if !dot}<DesignIcon name={state==='ready'?'check':state==='missing'?'close':'minus'} size="1rem"/>{/if}
</span>
