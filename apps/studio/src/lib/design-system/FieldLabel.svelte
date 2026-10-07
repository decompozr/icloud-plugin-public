<script lang="ts">
  import { controlMetrics, type ControlSize } from './controlMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import type { HTMLLabelAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  let { size = 'normal', for: controlId, required = false, children, ...rest }: HTMLLabelAttributes & {
    size?: ControlSize; for: string; required?: boolean; children: Snippet
  } = $props();
  const metrics = $derived(controlMetrics[size]);
</script>
<label data-size={size} style:--target={metrics.target} style:--control-font-size={metrics.fontSize} style:--control-line-height={metrics.lineHeight} style:--control-gap={controlMetrics.gap} style:--label-gap={controlMetrics.labelGap} style:--coarse-target={controlMetrics.coarseTarget} {...rest} style:--theme-ink={semanticColors.text} for={controlId}>{@render children()}{#if required}<span> (required)</span>{/if}</label>
<style>
  label { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; display: block; margin: 0 0 var(--label-gap); color: var(--theme-ink); font-family: 'DecompozR Inter', system-ui, sans-serif; font-size: var(--control-font-size); font-weight: 500; line-height: var(--control-line-height); overflow-wrap: anywhere; }
  span { font-size: .75rem; font-weight: 400; }
</style>
