<script lang="ts">
  import { viewportSurface } from './viewportSurface.js';
  import { controlMetrics, type ControlSize } from '../controlMetrics.js';
  import { fontFamily } from '../typography.js';
  import { spacing } from '../spacing.js';
  import { elevation } from '../visualMetrics.js';
  import { focus } from '../visualMetrics.js';
  import { semanticColors } from '../semanticColors.js';
  import type { MenuItem } from '../menu.js';
  import { radius } from '../radius.js';
  import { focusColors } from '../colorUsage.js';
  let { size = 'normal', items, label, interactive = false, node = $bindable(), id, left = 0, top = 0, onkeydown, onActivate }: {
    size?: ControlSize; items: MenuItem[]; label: string; interactive?: boolean; node?: HTMLDivElement; id?: string;
    left?: number; top?: number; onkeydown?: (event: KeyboardEvent) => void; onActivate?: (item: MenuItem) => void;
  } = $props();
  const metrics = $derived(controlMetrics[size]);
</script>

<!-- Only the interactive role="menu" surface receives tabindex=-1; the passive specimen has no tabindex. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div bind:this={node} use:viewportSurface={{floating:interactive,open:true}} data-size={size} {id} role={interactive ? 'menu' : 'group'} aria-label={label} aria-describedby={interactive && !items.length && id ? `${id}-empty` : undefined} tabindex={interactive ? -1 : undefined}
  class="menu" class:floating={interactive} {onkeydown}
  style:left={interactive ? `${left}px` : undefined} style:top={interactive ? `${top}px` : undefined}
  style:--target={metrics.target} style:--font-size={metrics.fontSize} style:--leading={metrics.lineHeight} style:--padding-inline={metrics.paddingInline} style:--coarse-target={controlMetrics.coarseTarget} style:--surface-inset={spacing[1]} style:--font-family={fontFamily.sans}
  style:border-radius={radius.surface} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--control-radius={radius.control} style:--surface-radius={radius.surface} style:--elevation={elevation.floating} style:--ink={semanticColors.text} style:--white={semanticColors.surface}
  style:--muted={semanticColors.textMuted} style:--edge={semanticColors.borderStrong} style:--focus={focusColors.outline}
  style:--pale={semanticColors.selected} style:--pressed={semanticColors.selectedActive} style:--line={semanticColors.border}>
  {#if !items.length}<p class="empty" id={id ? `${id}-empty` : undefined}>No actions available</p>{/if}
  {#each items as item (item.id)}
    {#if item.separatorBefore}<div role={interactive ? 'separator' : undefined} class="separator"></div>{/if}
    {#if interactive}
      <button class="item" role="menuitem" type="button" tabindex="-1" disabled={item.disabled} onclick={() => onActivate?.(item)}>{item.label}</button>
    {:else}
      <div class="item" class:disabled={item.disabled}>{item.label}{#if item.disabled}<span class="sr-only"> (unavailable)</span>{/if}</div>
    {/if}
  {/each}
</div>

<style>
  .menu { box-sizing: border-box; min-width: min(12rem, 100%); max-width: 100%; padding: var(--surface-inset); border: 1px solid var(--edge); background: var(--white); box-shadow: var(--elevation); font-family: var(--font-family); color: var(--ink); }
  .floating { position: fixed; inset: auto; margin: 0; width: max-content; z-index: 1050; min-width: min(12rem, calc(100vw - 16px)); max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; overscroll-behavior: contain; }
  .item { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; box-sizing: border-box; display: flex; align-items: center; text-align: start; width: 100%; min-height: var(--target); padding: calc((var(--target) - var(--font-size) * var(--leading)) / 2) var(--padding-inline); border: 0; border-radius: var(--control-radius); background: transparent; color: inherit; font: inherit; font-size: var(--font-size); line-height: var(--leading); overflow-wrap: anywhere; }
  button { cursor: pointer; }
  button:hover:not(:disabled), button:focus { background: var(--pale); }
  button:active:not(:disabled) { background: var(--pressed); }
  button:disabled, .item.disabled { color: var(--muted); cursor: not-allowed; }
  button:focus-visible, .menu:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  .empty { margin:0; padding:var(--surface-inset) var(--padding-inline); color:var(--muted); font-size:var(--font-size); line-height:var(--leading); }
  .separator { height: 1px; background: var(--line); margin: var(--surface-inset); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (pointer: coarse) { .item { min-height: var(--coarse-target); } }
</style>
