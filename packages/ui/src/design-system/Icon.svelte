<script lang="ts">
  import { icons, type IconName, type IconSize } from './icons.js';

  let { name, size = '1.25rem', label }: { name: IconName; size?: IconSize; label?: string } = $props();
  const accessibleLabel = $derived(label?.trim() || undefined);
</script>

<svg class="icon" data-icon={name} viewBox="0 0 24 24" width={size} height={size}
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden={accessibleLabel ? undefined : true} role={accessibleLabel ? 'img' : undefined}
  aria-label={accessibleLabel} focusable="false" xmlns="http://www.w3.org/2000/svg">
  {#each icons[name] as node}
    <svelte:element this={node.tag} {...node.attributes} />
  {/each}
</svg>

<style>
  .icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }
</style>
