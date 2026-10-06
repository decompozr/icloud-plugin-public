<script lang="ts">
 import {designIcons} from '../design-icons.js';
 let{name,size='1rem'}:{name:keyof typeof designIcons;size?:string}=$props();
</script>
<svg data-icon={name} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{#each designIcons[name] as node}<svelte:element this={node.tag} {...node.attributes}/>{/each}</svg>
<style>svg{display:inline-block;vertical-align:middle;flex-shrink:0}</style>
