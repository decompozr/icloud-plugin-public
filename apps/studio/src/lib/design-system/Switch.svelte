<script lang="ts">
  import { controlMetrics, type ControlSize } from './controlMetrics.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { untrack } from 'svelte';
  import { radius } from './radius.js';
  let { size = 'normal', label, defaultChecked, checked = $bindable(defaultChecked ?? false), disabled = false, class: className = '', ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'role' | 'children' | 'size'> & { size?: ControlSize | HTMLInputAttributes['size']; label: string; } = $props();
  const initialChecked = untrack(() => defaultChecked ?? checked);
  const density = $derived(size === 'compact' ? 'compact' : 'normal');
  const metrics = $derived(controlMetrics[density]);
</script>
<label data-size={density} style:--target={metrics.target} style:--control-font-size={metrics.fontSize} style:--control-line-height={metrics.lineHeight} style:--control-gap={controlMetrics.gap} style:--label-gap={controlMetrics.labelGap} style:--coarse-target={controlMetrics.coarseTarget} class={`control ${className}`} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--switch-surface={semanticColors.surface} style:--theme-ink={semanticColors.text} style:--theme-muted={semanticColors.textMuted} style:--theme-soft={semanticColors.disabledSurface} style:--theme-selected={semanticColors.selected} style:--theme-strong={semanticColors.focus} style:--theme-edge={semanticColors.borderStrong} class:disabled style:--radius={radius.full}>
  <input {...rest} size={typeof size === 'number' ? size : undefined} type="checkbox" role="switch" {disabled} defaultChecked={initialChecked} bind:checked />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span>{label}</span>
</label>
<style>
  .control { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; position: relative; display: flex; align-items: center; gap: var(--control-gap); min-height: var(--target); width: fit-content; max-width: 100%; margin: 0; padding: .25rem 0; box-sizing: border-box; color: var(--theme-ink); font-family: 'DecompozR Inter', system-ui, sans-serif; font-size: var(--control-font-size); font-weight: 400; line-height: var(--control-line-height); cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .control[data-size='compact'] { padding-block: 0; }
  .control > span:last-child { overflow-wrap: anywhere; }
  .control.disabled, .control:has(input:disabled) { color: var(--theme-muted); cursor: not-allowed; }
  input { margin: 0; flex-shrink: 0; accent-color: var(--theme-strong); cursor: inherit; }
  input { position: absolute; width: 2.75rem; height: 1.75rem; opacity: 0; }
  .track { display: inline-flex; align-items: center; flex: 0 0 auto; width: 2.75rem; height: 1.75rem; box-sizing: border-box; padding: .1875rem; border: 1px solid var(--theme-edge); border-radius: var(--radius); background: var(--switch-surface); transition: background-color 160ms ease-out, border-color 160ms ease-out; }
  .thumb { width: 1.25rem; height: 1.25rem; background: var(--theme-muted); border-radius: var(--radius); transform: translateX(0); transition: transform 160ms ease-out, background-color 160ms ease-out; }
  input:checked + .track { background: var(--theme-selected); border-color: var(--theme-strong); }
  input:checked + .track .thumb { transform: translateX(1rem); background: var(--theme-strong); }
  input:disabled + .track { background: var(--theme-soft); }
  input:focus-visible + .track { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  input:disabled + .track, input:disabled + .track .thumb { transition: none; }
  @media (prefers-reduced-motion: reduce) { .track, .thumb { transition: none; } }
  @media (forced-colors: active) { .track { border-color: ButtonText; } .thumb, input:checked + .track .thumb { background: ButtonText; } input:checked + .track { border-color: Highlight; } input:focus-visible + .track { outline-color: Highlight; } }
  @media (pointer: coarse) { .control { min-height: var(--coarse-target); } }
</style>
