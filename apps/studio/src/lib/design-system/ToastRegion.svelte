<script lang="ts">
  import { radius } from './radius.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import { onMount, tick, type Snippet } from 'svelte';
  import Button from './Button.svelte';
  let { children, label = 'Notifications', id, open = true, onAtLatestChange }: {
    children: Snippet; label?: string; id?: string; open?: boolean;
    onAtLatestChange?: (latest: boolean) => void;
  } = $props();
  let scrollport: HTMLDivElement;
  let content: HTMLDivElement;
  let hasMessages = $state(false);
  let atLatest = $state(true);
  let following = true;
  let savedTop = 0;
  let mounted = false;
  let previousOpen = true;
  function report(latest: boolean) {
    atLatest = latest;
    onAtLatestChange?.(latest);
  }
  function olderControlFocused() {
    const focused = document.activeElement;
    return !!focused && content.contains(focused) && !content.lastElementChild?.contains(focused);
  }
  function atBottom() { return scrollport.scrollHeight - scrollport.clientHeight - scrollport.scrollTop <= 4; }
  function rememberScroll() {
    if (!open) return;
    savedTop = scrollport.scrollTop;
    following = atBottom() && !olderControlFocused();
    report(following);
  }
  function latest() {
    following = true;
    scrollport.scrollTop = scrollport.scrollHeight;
    savedTop = scrollport.scrollTop;
    report(true);
  }
  function chooseLatest() {
    scrollport.focus({ preventScroll: true });
    latest();
  }
  function contentChanged() {
    hasMessages = content.children.length > 0;
    if (!hasMessages) { following = true; savedTop = 0; report(true); return; }
    if (!open) return;
    if (following && !olderControlFocused()) latest();
    else { following = false; report(false); }
  }
  function focusChanged() {
    if (olderControlFocused()) { following = false; report(false); }
  }
  onMount(() => {
    mounted = true;
    previousOpen = open;
    const resize = new ResizeObserver(contentChanged);
    const mutation = new MutationObserver(contentChanged);
    resize.observe(content);
    resize.observe(scrollport);
    mutation.observe(content, { childList: true, subtree: true, characterData: true });
    contentChanged();
    return () => { mounted = false; resize.disconnect(); mutation.disconnect(); };
  });
  $effect(() => {
    const visible = open;
    if (!mounted || visible === previousOpen) return;
    previousOpen = visible;
    if (visible) {
      tick().then(() => {
        if (!open) return;
        if (following) latest();
        else { scrollport.scrollTop = savedTop; report(false); }
      });
    }
  });
</script>

<section class="toast-region" style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--control-radius={radius.control} style:--surface-radius={radius.surface} style:--surface={semanticColors.surface} style:--theme-soft={semanticColors.border} style:--theme-strong={semanticColors.focus} {id} aria-label={label} hidden={!open || !hasMessages}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The named nonempty scrollport needs a tab stop for native keyboard history scrolling.) -->
  <div class="toast-stack" bind:this={scrollport} tabindex={hasMessages ? 0 : undefined} role="region" aria-label={`${label} history`} onscroll={rememberScroll} onfocusin={focusChanged}>
    <div class="toast-content" bind:this={content}>{@render children()}</div>
  </div>
  {#if !atLatest}<div class="latest"><Button appearance="quiet" onclick={chooseLatest}>Latest messages</Button></div>{/if}
</section>

<style>
  .toast-region { box-sizing: border-box; position: fixed; z-index: 1000; inset-block-end: max(var(--toast-region-bottom, 1rem), env(safe-area-inset-bottom)); inset-inline-end: max(1rem, env(safe-area-inset-right)); width: min(24rem, calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right))); max-height: min(60dvh, 32rem, calc(100dvh - var(--toast-region-bottom, 1rem) - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))); display: flex; flex-direction: column; pointer-events: auto; }
  .toast-region[hidden] { display: none; }
  .toast-stack { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: .375rem; overflow-anchor: none; }
  .toast-stack:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); border-radius: var(--surface-radius); }
  .toast-content { display: grid; gap: .5rem; }
  .toast-content :global(> *) { min-width: 0; }
  .latest { flex-shrink: 0; align-self: end; background: var(--surface); border: 1px solid var(--theme-soft); border-radius: var(--control-radius); margin: .25rem .375rem 0; }
</style>
