<script lang="ts">
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { buttonColors, type ButtonColorName } from './colorUsage.js';
  import { radius } from './radius.js';
  import Spinner from './Spinner.svelte';
  import { controlMetrics } from './controlMetrics.js';
  let { variant = 'secondary', appearance = 'default', size = 'normal', touchAppearance = 'default', loading = false, loadingLabel = 'Working…',
    disabled = false, type = 'button', children, onclick, onkeydown, onkeyup, class: className = '', ...rest
  }: HTMLButtonAttributes & { variant?: ButtonColorName; appearance?: 'default' | 'quiet'; size?: 'normal' | 'compact'; loading?: boolean;
    touchAppearance?: 'default' | 'compact'; loadingLabel?: string; children?: Snippet } = $props();
  const recipe = $derived(buttonColors[variant]);
  const metrics = $derived(controlMetrics[size]);
  const instanceId = $props.id();
  const busyId = `${instanceId}-busy`;
  function click(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    if (loading || disabled) { event.preventDefault(); event.stopPropagation(); return; }
    onclick?.(event);
  }
  function key(event: KeyboardEvent & { currentTarget: EventTarget & HTMLButtonElement }, handler: typeof onkeydown) {
    if (loading && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); return; }
    handler?.(event);
  }
</script>

<button {...rest} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--theme-strong={semanticColors.focus} {type} {disabled} aria-disabled={loading || rest['aria-disabled']} aria-busy={loading || undefined}
  aria-describedby={[rest['aria-describedby'], loading ? busyId : undefined].filter(Boolean).join(' ') || undefined}
  onclick={click} onkeydown={(event) => key(event, onkeydown)} onkeyup={(event) => key(event, onkeyup)} data-dz-action
  style:--control-font-size={metrics.fontSize} style:--control-line-height={metrics.lineHeight} style:--control-icon={metrics.icon} style:--target={metrics.target} style:--padding-block={metrics.paddingBlock} style:--padding-inline={metrics.paddingInline} style:--icon-padding={metrics.iconPadding}
  style:--coarse-target={`var(--dz-action-coarse-target, ${controlMetrics.coarseTarget})`} style:--coarse-icon={touchAppearance === 'compact' ? metrics.icon : controlMetrics.coarseIcon} style:--touch-face={controlMetrics.compactTouchSurface} style:--control-gap={controlMetrics.gap}
  class={`dz-button ${className}`} data-size={size} data-touch-appearance={touchAppearance} data-appearance={appearance}
  style:--radius={radius.control}
  style:--quiet-ink={semanticColors.text} style:--quiet-hover={semanticColors.active} style:--quiet-active={semanticColors.selected}
  style:--bg={recipe.default.background} style:--ink={recipe.default.foreground} style:--edge={recipe.default.border}
  style:--hover={recipe.hover.background} style:--hover-ink={recipe.hover.foreground} style:--hover-edge={recipe.hover.border}
  style:--active={recipe.pressed.background} style:--active-ink={recipe.pressed.foreground} style:--active-edge={recipe.pressed.border}
  style:--disabled-bg={recipe.disabled.background} style:--disabled-ink={recipe.disabled.foreground} style:--disabled-edge={recipe.disabled.border}>
  <span class="button-content" class:busy={loading}>{@render children?.()}</span>
  {#if loading}<span class="busy-indicator" aria-hidden="true"><Spinner size={metrics.icon} /></span>{/if}
</button>
{#if loading}<span id={busyId} class="sr-only">{loadingLabel}</span>{/if}

<style>
  .dz-button { --face-border-style:solid; --face-bg:var(--bg); --face-ink:var(--ink); --face-edge:var(--edge); -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; position: relative; box-sizing: border-box; display: inline-flex; justify-content: center; align-items: center; gap: var(--control-gap); min-width: var(--target); min-height: var(--target); max-width: 100%; padding: var(--padding-block) var(--padding-inline); border: 1px var(--face-border-style) var(--face-edge); border-radius: var(--radius); background: var(--face-bg); color: var(--face-ink); font-family: 'DecompozR Inter', system-ui, sans-serif; font-size: var(--control-font-size); font-weight: 500; line-height: var(--control-line-height); text-align: center; overflow-wrap: anywhere; cursor: pointer; }
  .button-content { position:relative; z-index:1; display: inline-flex; justify-content: center; align-items: center; gap: var(--control-gap); min-width: 0; }
  .button-content.busy { opacity: 0; }
  .busy-indicator { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .dz-button[aria-busy='true'] { cursor: wait; }
  @media (hover: hover) and (pointer: fine) { .dz-button:hover:not(:disabled):not([aria-disabled='true']) { --face-bg: var(--hover); --face-ink: var(--hover-ink); --face-edge: var(--hover-edge); } }
  .dz-button:active:not(:disabled):not([aria-disabled='true']) { --face-bg: var(--active); --face-ink: var(--active-ink); --face-edge: var(--active-edge); }
  .dz-button[data-appearance='quiet'] { --face-edge: transparent; --face-bg: transparent; --face-ink: var(--quiet-ink); }
  @media (hover: hover) and (pointer: fine) { .dz-button[data-appearance='quiet']:hover:not(:disabled):not([aria-disabled='true']) { --face-bg: var(--quiet-hover); --face-ink: var(--quiet-ink); --face-edge: transparent; } }
  .dz-button[data-appearance='quiet']:active:not(:disabled):not([aria-disabled='true']) { --face-bg: var(--quiet-active); --face-ink: var(--quiet-ink); --face-edge: transparent; }
  .dz-button:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  .dz-button:disabled { --face-bg: var(--disabled-bg); --face-ink: var(--disabled-ink); --face-edge: var(--disabled-edge); cursor: not-allowed; opacity: 1; }
  .dz-button[data-appearance='quiet']:disabled { --face-bg: transparent; --face-edge: transparent; --face-ink: var(--disabled-ink); }
  @media (pointer: coarse) {
    .dz-button[data-touch-appearance='compact'] { background:transparent; border-color:transparent; }
    .dz-button[data-touch-appearance='compact']::before { content:''; pointer-events:none; position:absolute; inset:calc((var(--coarse-target) - var(--touch-face)) / 2 - 1px); border:1px var(--face-border-style) var(--face-edge); border-radius:var(--radius); background:var(--face-bg); }
  }
  @media (forced-colors: active) {
    .dz-button[data-appearance='quiet']:disabled { color: GrayText; }
    .dz-button:focus-visible { outline-color: Highlight; }
  }
  @media (pointer: coarse) { .dz-button { min-width: var(--coarse-target); min-height: var(--coarse-target); } .busy-indicator :global(.spinner) { width: var(--coarse-icon); height: var(--coarse-icon); } }
</style>
