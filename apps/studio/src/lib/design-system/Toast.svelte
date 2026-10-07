<script lang="ts">
  import { typography, fontFamily } from './typography.js';
  import { controlMetrics } from './controlMetrics.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { radius } from './radius.js';
  import { spacing } from './spacing.js';
  import { feedbackColors, focusColors, type FeedbackKind } from './colorUsage.js';

  let { kind = 'info', title, message, children, actions, announcement, announce = true, urgent = false, onDismiss }: {
    kind?: FeedbackKind;
    title?: string;
    message?: string;
    children?: Snippet;
    actions?: Snippet;
    /** Required when children provide the only meaningful content; update for meaningful changes. */
    announcement?: string;
    announce?: boolean;
    urgent?: boolean;
    onDismiss: () => void;
  } = $props();
  const id = $props.id();
  const labels = { info: 'Info', warning: 'Warning', error: 'Error' } as const;
  const palette = $derived(feedbackColors[kind]);
  const label = $derived(labels[kind]);
  const dismissName = $derived(title || message || announcement || `${label.toLowerCase()} notification`);
  let liveMessage = $state('');
  $effect(() => {
    const content = [label, announcement ?? [title, message].filter(Boolean).join('. ')].filter(Boolean).join('. ');
    liveMessage = '';
    if (!announce) return;
    // Insert into one already-mounted live node; snippets and actions are not live regions.
    const timer = setTimeout(() => liveMessage = content, 50);
    return () => clearTimeout(timer);
  });
</script>

<div class="toast" role="group" aria-label={title ? `${label}: ${title}` : `${label} notification`}
  style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--control-radius={radius.control} style:--surface-radius={radius.surface} style:--ink={semanticColors.text} style:--white={semanticColors.surface}
  style:--muted={semanticColors.textMuted} style:--line={semanticColors.border}
  style:--focus={focusColors.outline} style:--cue-ink={palette.foreground} style:--cue-fill={palette.background}
  style:--inset={spacing[4]} style:--column-gap={spacing[3]}
  style:--text-gap={spacing[1]} style:--section-gap={spacing[2]}
  style:--font-family={fontFamily.sans} style:--body-size={typography.bodyCompact.fontSize} style:--body-leading={typography.bodyCompact.lineHeight}
  style:--title-size={typography.label.fontSize} style:--title-leading={typography.label.lineHeight} style:--title-weight={typography.label.fontWeight}
  style:--glyph-size={controlMetrics.normal.icon} style:--dismiss-size={controlMetrics.coarseTarget}
  style:--first-line-height={`calc(${title ? typography.label.fontSize : typography.bodyCompact.fontSize} * ${title ? typography.label.lineHeight : typography.bodyCompact.lineHeight})`}
  style:border-radius={radius.surface}>
  <span class="status-icon" aria-hidden="true"><Icon name={kind} /></span>
  <div class="content">
    {#if title}<p id={`${id}-title`} class="title">{title}</p>{/if}
    {#if message}<p class="message">{message}</p>{/if}
    {#if children}<div class="custom-content">{@render children()}</div>{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  <button type="button" class="dismiss" aria-label={`Dismiss ${dismissName}`} onclick={onDismiss}><Icon name="close" /></button>
  {#if announce}<span class="sr-only" role={urgent ? 'alert' : 'status'} aria-atomic="true">{liveMessage}</span>{/if}
</div>

<style>
  .toast { --target-overhang: calc((var(--dismiss-size) - var(--glyph-size)) / 2); box-sizing: border-box; display: flex; align-items: start; gap: var(--column-gap); padding: var(--inset); border: 1px solid var(--line); background: var(--white); color: var(--ink); font-family: var(--font-family); font-size: var(--body-size); line-height: var(--body-leading);  overflow-wrap: anywhere; }
  /* Center both default Icon glyphs on the first text line. Untitled/custom-only
     content uses the body line box; arbitrary children retain their own layout.
     The larger dismiss target extends equally around its glyph, within the inset,
     without adding false column gaps or making a one-line toast taller. */
  .status-icon { display: flex; flex: 0 0 var(--glyph-size); margin-block-start: calc((var(--first-line-height) - var(--glyph-size)) / 2); color: var(--cue-ink); }
  .content { flex: 1; min-width: 0; }
  p { margin: 0; }
  .title { font-size: var(--title-size); line-height: var(--title-leading); font-weight: var(--title-weight); }
  .message { margin-top: 0; }
  .title + .message { margin-top: var(--text-gap); }
  .custom-content { min-width: 0; margin-top: var(--section-gap); }
  .custom-content:first-child { margin-top: 0; }
  .custom-content :global(> *) { max-inline-size: 100%; box-sizing: border-box; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--text-gap); margin-top: var(--section-gap); margin-inline-start: calc(-1 * var(--section-gap)); }
  .actions :global(> *) { max-inline-size: 100%; }
  .dismiss { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: var(--dismiss-size); height: var(--dismiss-size); margin-block: calc((var(--first-line-height) - var(--dismiss-size)) / 2); margin-inline: calc(-1 * var(--target-overhang)); padding: var(--section-gap); border: 0; border-radius: var(--control-radius); background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
  .dismiss:hover { background: var(--line); color: var(--ink); }
  .dismiss:active { background: var(--cue-fill); }
  .dismiss:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  @media (forced-colors: active) { .toast { border-color: CanvasText; box-shadow: none; } .status-icon { color: CanvasText; } }
</style>
