<script lang="ts">
  import { typography, fontFamily } from './typography.js';
  import { spacing } from './spacing.js';
  import { controlMetrics } from './controlMetrics.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import { radius } from './radius.js';
  import Icon from './Icon.svelte';
  let { label, tone = 'neutral', onDismiss }: { label: string; tone?: 'neutral' | 'sage'; onDismiss?: (event: MouseEvent) => void } = $props();
</script>
<span class="tag" style:--font-family={fontFamily.sans} style:--font-size={typography.bodyCompact.fontSize} style:--leading={typography.bodyCompact.lineHeight} style:--small-gap={spacing[1]} style:--inset={spacing[2]} style:--dismiss-size={controlMetrics.coarseTarget} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--theme-ink={semanticColors.text} style:--theme-selected={semanticColors.selected} style:--theme-strong={semanticColors.selectedText} style:--theme-hover={semanticColors.selectedHover} style:--theme-surface={semanticColors.surfaceSubtle} class:removable={!!onDismiss} data-tone={tone} style:--radius={radius.control}>
  <span>{label}</span>
  {#if onDismiss}<button type="button" aria-label={`Remove ${label}`} onclick={onDismiss}><Icon name="close" size="1rem" /></button>{/if}
</span>
<style>
  .tag { position: relative; isolation: isolate; display: inline-flex; align-items: center; width: fit-content; min-width: 0; max-width: 100%; min-height: calc(var(--dismiss-size) - 2 * var(--inset)); padding: var(--small-gap) var(--inset); box-sizing: border-box; color: var(--theme-ink); font-family: var(--font-family); font-size: var(--font-size); line-height: var(--leading); }
  .tag::before { content: ''; position: absolute; z-index: -1; inset: 0; border-radius: var(--radius); background: var(--theme-surface); }
  .tag[data-tone='sage'] { color: var(--theme-strong); }
  .tag[data-tone='sage']::before { background: var(--theme-selected); }
  .tag.removable { min-height: var(--dismiss-size); padding-block: var(--inset); padding-inline-end: 0; }
  .tag.removable::before { inset-block: var(--inset); }
  .tag > span { overflow-wrap: anywhere; min-width: 0; }
  button { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: var(--dismiss-size); min-height: var(--dismiss-size); margin-block: calc(-1 * var(--inset)); padding: 0; border: 0; border-radius: var(--radius); color: inherit; background: transparent; cursor: pointer; }
  button::before { content: ''; position: absolute; z-index: -1; inset: var(--inset) var(--small-gap); border-radius: var(--radius); }
  button:hover::before { background: var(--theme-selected); }
  button:active::before { background: var(--theme-hover); }
  button:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  @media (forced-colors: active) {
    .tag::before { border: 1px solid CanvasText; }
    button:focus-visible { outline-color: Highlight; }
  }
</style>
