<script lang="ts">
  import { controlMetrics, type ControlSize } from './controlMetrics.js';
  import { typography, fontFamily } from './typography.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors as role } from './semanticColors.js';
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import type { SelectOption } from './select.js';
  import { radius } from './radius.js';
  const generatedId = $props.id();
  let { size = 'normal', error, label, labelHidden = false, options, value = $bindable(''), element = $bindable<HTMLSelectElement | undefined>(undefined), id = generatedId, hint, showSelectedLabel = false, ...rest }: Omit<HTMLSelectAttributes, 'children' | 'value' | 'multiple' | 'size'> & {
    size?: ControlSize; error?: string; label: string; labelHidden?: boolean; options: readonly SelectOption[]; value?: string; element?: HTMLSelectElement; hint?: string; showSelectedLabel?: boolean;
  } = $props();
  const metrics = $derived(controlMetrics[size]);
  const selectedLabel = $derived(options.find(option => option.value === value)?.label);
  const description = $derived([rest['aria-describedby'], hint ? `${generatedId}-hint` : '', error ? `${generatedId}-error` : '', showSelectedLabel ? `${generatedId}-selected` : ''].filter(Boolean).join(' ') || undefined);
</script>
<div class="field" data-size={size} style:--target={metrics.target} style:--padding-block={metrics.paddingBlock} style:--padding-inline={metrics.paddingInline} style:--font-size={metrics.fontSize} style:--leading={metrics.lineHeight} style:--label-gap={controlMetrics.labelGap} style:--coarse-target={controlMetrics.coarseTarget} style:--font-family={fontFamily.sans} style:--caption-size={typography.caption.fontSize} style:--caption-leading={typography.caption.lineHeight} style:--critical={role.critical} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--ink={role.text} style:--surface={role.surface} style:--edge={role.borderStrong} style:--muted={role.textMuted} style:--soft={role.disabledSurface} style:--focus={role.focus} style:--radius={radius.control}>
  <label for={id} class:visually-hidden={labelHidden}>{label}</label>
  <select {...rest} {id} class:invalid={!!error} aria-invalid={error ? 'true' : rest['aria-invalid']} bind:this={element} bind:value aria-describedby={description} title={rest.title ?? selectedLabel}>
    {#each options as option}<option value={option.value} disabled={option.disabled}>{option.label}</option>{/each}
  </select>
  {#if showSelectedLabel}<p id={`${generatedId}-selected`}>{selectedLabel ?? ''}</p>{/if}
  {#if hint}<p id={`${generatedId}-hint`}>{hint}</p>{/if}
  {#if error}<p class="error" id={`${generatedId}-error`}><strong>Error:</strong> {error}</p>{/if}
</div>
<style>
  .field { min-width:0; font-family:var(--font-family); font-size:var(--font-size); line-height:var(--leading); color:var(--ink); }
  label { display:block; margin-bottom:var(--label-gap); font-weight:500; overflow-wrap:anywhere; }
  select { box-sizing:border-box; width:100%; min-width:0; max-width:100%; height:var(--target); min-height:var(--target); padding:var(--padding-block) var(--padding-inline); border:1px solid var(--edge); border-radius:var(--radius); background:var(--surface); color:var(--ink); font:inherit; text-overflow:ellipsis; }
  select.invalid { border-color:var(--critical); }
  select:disabled { background:var(--soft); color:var(--muted); opacity:1; cursor:not-allowed; }
  select:focus-visible { outline:var(--focus-ring); outline-offset:var(--focus-offset); box-shadow:var(--focus-shadow); }
  p { margin:var(--label-gap) 0 0; font-size:var(--caption-size); line-height:var(--caption-leading); color:var(--muted); overflow-wrap:anywhere; }
  p.error { color:var(--critical); }
  .visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  @media (pointer:coarse) { select { height:var(--coarse-target); min-height:var(--coarse-target); font-size:1rem; line-height:1.25; padding-block:0; } }
</style>
