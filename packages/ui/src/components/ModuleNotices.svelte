<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy,BundledModuleUi} from '../contracts.js';
 import DesignIcon from './DesignIcon.svelte';
 import {spacing} from '../design-system/spacing.js';
 import {semanticColors} from '../design-system/semanticColors.js';
 let {moduleId,notices=[]}:{moduleId:string;notices?:BundledModuleUi['notices']}=$props();
 const {t}=getContext<UiCopy>('copy');
</script>
{#if notices.length}<div class="module-notices" style:gap={spacing[2]}>{#each notices as notice}<p role="note" data-module-notice={notice.id} data-testid={`${moduleId}-${notice.id}`} style:color={notice.tone==='warning'?semanticColors.warning:semanticColors.textMuted} style:gap={spacing[2]}><DesignIcon name="info"/>{t(notice.messageKey)}</p>{/each}</div>{/if}
<style>.module-notices{flex-basis:100%;min-width:0;display:flex;flex-direction:column}p{display:flex;align-items:flex-start;margin:0;overflow-wrap:anywhere}p :global(svg){flex:none}</style>
