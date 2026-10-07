<script lang="ts">
  import { controlMetrics } from './controlMetrics.js';
  import { focus } from './visualMetrics.js';
  import { semanticColors } from './semanticColors.js';
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import MenuSurface from './internal/MenuSurface.svelte';
  import type { IconName } from './icons.js';
  import type { MenuItem } from './menu.js';
  import { radius } from './radius.js';
  import { focusColors } from './colorUsage.js';
  let { label, icon, items, compact = false, disabled = false }: {
    label: string; icon?: IconName; items: MenuItem[]; compact?: boolean; disabled?: boolean;
  } = $props();
  const metrics = $derived(controlMetrics[compact ? 'compact' : 'normal']);
  const instanceId = $props.id();
  const id = `${instanceId}-menu`;
  let trigger: HTMLButtonElement;
  let menu = $state<HTMLDivElement>(undefined!);
  let open = $state(false);
  let left = $state(0);
  let top = $state(0);
  let search = '';
  let searchTimer: ReturnType<typeof setTimeout>;
  const enabled = () => menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')) : [];
  function position() {
    if (!open || !trigger || !menu) return;
    const t = trigger.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    left = Math.max(8, Math.min(t.right - m.width, window.innerWidth - m.width - 8));
    const preferredTop = t.bottom + m.height + 12 <= window.innerHeight ? t.bottom + 4 : t.top - m.height - 4;
    top = Math.max(8, Math.min(preferredTop, window.innerHeight - m.height - 8));
  }
  async function show(last = false) {
    if (disabled) return;
    open = true; search = '';
    await tick();
    if (!open || !menu?.isConnected) return;
    position();
    const buttons = enabled();
    (last ? buttons.at(-1) : buttons[0])?.focus();
    if (!buttons.length) menu.focus();
  }
  function close(returnFocus = false) {
    open = false; search = ''; clearTimeout(searchTimer);
    if (returnFocus) trigger.focus();
  }
  function triggerKey(event: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(event.key === 'ArrowUp'); }
  }
  function activate(item: MenuItem) {
    if (item.disabled) return;
    close(true); item.onSelect();
  }
  function menuKey(event: KeyboardEvent) {
    const buttons = enabled();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') {
      // Move to the composite's tab stop, then let the browser traverse normally.
      // Native traversal preserves summary, radio-group and positive-tabindex rules.
      close(true);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      event.preventDefault();
      clearTimeout(searchTimer); search += event.key.toLocaleLowerCase();
      const query = [...search].every(char => char === search[0]) ? search[0] : search;
      const ordered = [...buttons.slice(current + 1), ...buttons.slice(0, current + 1)];
      ordered.find(button => button.textContent?.trim().toLocaleLowerCase().startsWith(query))?.focus();
      searchTimer = setTimeout(() => search = '', 700);
    }
  }
  function outside(event: PointerEvent) {
    if (!open || !(event.target instanceof Node) || trigger.contains(event.target) || menu?.contains(event.target)) return;
    // Preserve an outside control's natural focus; don't leave focus in removed menu on inert page areas.
    const target = event.target instanceof Element ? event.target.closest('button,a[href],input,select,textarea,[tabindex]') : null;
    close(!target);
  }
  function focusOutside(event: FocusEvent) {
    if (open && event.target instanceof Node && !menu?.contains(event.target) && !trigger.contains(event.target)) close();
  }
  $effect.pre(() => {
    // Read identities/availability before Svelte removes or disables the focused node.
    items.map(item => [item.id, item.disabled]);
    if (!open || !menu) return;
    const focused = document.activeElement;
    const owned = !!focused && menu.contains(focused);
    let active = true;
    tick().then(() => {
      if (!active || !owned || !open || !menu?.isConnected) return;
      if (document.activeElement !== focused && document.activeElement !== document.body) return;
      if (!focused.isConnected || focused.matches(':disabled')) (enabled()[0] ?? menu).focus();
    });
    return () => { active = false; };
  });
  $effect(() => { if (disabled && open) close(); });
  $effect(() => () => clearTimeout(searchTimer));
  $effect(() => {
    if (!open) return;
    let active = true;
    let frame = 0;
    function track() { if (!active) return; position(); frame = requestAnimationFrame(track); }
    tick().then(() => { if (active) track(); });
    return () => { active = false; cancelAnimationFrame(frame); };
  });
</script>

<svelte:window onpointerdown={outside} onfocusin={focusOutside} onresize={position} />
<span class="menu-anchor" style:--icon-padding={metrics.iconPadding} style:--target={metrics.target} style:--padding-block={metrics.paddingBlock} style:--padding-inline={metrics.paddingInline} style:--control-font-size={metrics.fontSize} style:--control-line-height={metrics.lineHeight} style:--control-gap={controlMetrics.gap} style:--coarse-target={controlMetrics.coarseTarget} style:--coarse-icon={controlMetrics.coarseIcon} style:--focus-ring={focus.outline} style:--focus-offset={focus.offset} style:--focus-shadow={focus.shadow} style:--ink={semanticColors.text} style:--white={semanticColors.surface} style:--muted={semanticColors.textMuted} style:--edge={semanticColors.borderStrong} style:--focus={focusColors.outline} style:--pale={semanticColors.selected} style:--pressed={semanticColors.selectedActive} style:--soft={semanticColors.surfaceSubtle} style:--line={semanticColors.border}>
  <button bind:this={trigger} type="button" class="trigger" class:compact class:icon-only={!!icon}
    {disabled} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
    style:border-radius={radius.control} onclick={() => open ? close() : show()} onkeydown={triggerKey}>
    {#if icon}<Icon name={icon} size={metrics.icon} />{:else}<span>{label}</span><Icon name="chevron-down" size="1rem" />{/if}
  </button>
  {#if open}
    <MenuSurface size={compact ? 'compact' : 'normal'} bind:node={menu} {id} {label} {items} interactive {left} {top} onkeydown={menuKey} onActivate={activate} />
  {/if}
</span>

<style>
  .menu-anchor { display: inline-flex; vertical-align: middle; }
  button { font-family: 'DecompozR Inter', Inter, system-ui, sans-serif; font-size: var(--control-font-size); font-weight: 500; line-height: var(--control-line-height); color: var(--ink); cursor: pointer; }
  .trigger { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; box-sizing: border-box; display: inline-flex; gap: var(--control-gap); align-items: center; justify-content: center; min-height: var(--target); min-width: var(--target); padding: var(--padding-block) var(--padding-inline); border: 1px solid var(--edge); background: var(--white); }
  .trigger.icon-only { padding: var(--icon-padding); }
  .trigger:hover:not(:disabled) { background: var(--soft); }
  .trigger:active:not(:disabled), .trigger[aria-expanded="true"] { background: var(--pale); }
  button:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); box-shadow: var(--focus-shadow); }
  button:disabled { color: var(--muted); background: var(--soft); cursor: not-allowed; }
  @media (pointer: coarse) { .trigger { min-height: var(--coarse-target); min-width: var(--coarse-target); } .trigger.icon-only :global(.icon) { width: var(--coarse-icon); height: var(--coarse-icon); } }
</style>
