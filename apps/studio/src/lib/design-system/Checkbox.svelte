<script lang="ts">
  import { controlMetrics, type ControlSize } from './controlMetrics.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { untrack } from 'svelte';
  import { radius } from './radius.js';
  let { size = 'normal', label, defaultChecked, checked = $bindable(defaultChecked ?? false), indeterminate = $bindable(false), disabled = false, class: className = '', ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'role' | 'children' | 'size'> & { size?: ControlSize | HTMLInputAttributes['size']; label: string; indeterminate?: boolean; } = $props();
  const initialChecked = untrack(() => defaultChecked ?? checked);
  const initialMixed = untrack(() => indeterminate);
  function resetMixed(node: HTMLInputElement) {
    const form = node.form;
    const reset = (event: Event) => queueMicrotask(() => {
      if (!event.defaultPrevented) { indeterminate = initialMixed; node.indeterminate = initialMixed; }
    });
    form?.addEventListener('reset', reset);
    return { destroy() { form?.removeEventListener('reset', reset); } };
  }
  const density = $derived(size === 'compact' ? 'compact' : 'normal');
  const metrics = $derived(controlMetrics[density]);
</script>
<label data-size={density} style:--target={metrics.target} style:--control-font-size={metrics.fontSize} style:--control-line-height={metrics.lineHeight} style:--control-gap={controlMetrics.gap} style:--label-gap={controlMetrics.labelGap} style:--coarse-target={controlMetrics.coarseTarget} class={`control ${className}`} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--theme-ink={semanticColors.text} style:--theme-muted={semanticColors.textMuted} style:--theme-strong={semanticColors.focus} class:disabled style:--radius={radius.control}>
  <input {...rest} size={typeof size === 'number' ? size : undefined} type="checkbox" use:resetMixed bind:indeterminate {disabled} defaultChecked={initialChecked} bind:checked />
  
  <span>{label}</span>
</label>
<style>
  .control { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; position: relative; display: flex; align-items: center; gap: var(--control-gap); min-height: var(--target); width: fit-content; max-width: 100%; margin: 0; padding: .25rem 0; box-sizing: border-box; color: var(--theme-ink); font-family: 'DecompozR Inter', system-ui, sans-serif; font-size: var(--control-font-size); font-weight: 400; line-height: var(--control-line-height); cursor: pointer; }
  .control > span:last-child { overflow-wrap: anywhere; }
  .control.disabled, .control:has(input:disabled) { color: var(--theme-muted); cursor: not-allowed; }
  input { margin: 0; flex-shrink: 0; accent-color: var(--theme-strong); cursor: inherit; }
  input { appearance: auto; display: inline-block; width: 1.125rem; height: 1.125rem; min-height: 0; padding: 0; border: revert; border-radius: var(--radius); background: revert; }
  input:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  @media (pointer: coarse) { .control { min-height: var(--coarse-target); } }
</style>
