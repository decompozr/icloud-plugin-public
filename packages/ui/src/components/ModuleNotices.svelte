<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy,BundledModuleUi} from '../contracts.js';
 import DesignIcon from './DesignIcon.svelte';
 import {spacing} from '../design-system/spacing.js';
 import {semanticColors} from '../design-system/semanticColors.js';
 let {moduleId,notices=[]}:{moduleId:string;notices?:BundledModuleUi['notices']}=$props();
 const {t}=getContext<UiCopy>('copy');
</script>
{#each notices as notice}<p role="note" data-module-notice={notice.id} data-testid={`${moduleId}-${notice.id}`} style:color={notice.tone==='warning'?semanticColors.warning:semanticColors.textMuted} style:gap={spacing[2]} style:margin-top={spacing[2]}><DesignIcon name="info"/>{t(notice.messageKey)}</p>{/each}
<style>p{display:flex;align-items:flex-start;margin-bottom:0;overflow-wrap:anywhere}p :global(svg){flex:none}</style>
