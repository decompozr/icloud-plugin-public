<script lang="ts">
  import ActionButton from "./ActionButton.svelte";
  import { getContext, onMount, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { ToastCenter } from "../toast-state.svelte.js";
  let {
    open,
    title,
    onclose,
    onclosed = () => {},
    children,
    busy = false,
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    onclosed?: () => void;
    children: Snippet;
    busy?: boolean;
  } = $props();
  const { t } = getContext<UiCopy>("copy");
  const titleId = $props.id();
  const toast = getContext<ToastCenter>("toast");
  let counted = false;
  let element: HTMLDialogElement;
  let previous: HTMLElement | null = null;
  let backdropPointer: number | null = null;
  function outside(event: PointerEvent) {
    const bounds = element.getBoundingClientRect();
    return event.target === element && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  }
  let closing = $state(false);
  let motionRevision = 0;
  let exitAnimation: Animation | undefined;
  async function finishClose(revision: number) {
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (mobile && !reduced) {
      exitAnimation = element.animate([
        { transform: getComputedStyle(element).transform },
        { transform: 'translateY(100%)' },
      ], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      try { await exitAnimation.finished; } catch { return; }
    }
    if (revision !== motionRevision || open) return;
    element.close();
    exitAnimation?.cancel(); exitAnimation = undefined;
    closing = false;
    if (counted) { if (toast) toast.dialogs--; counted = false; }
    previous?.focus();
    onclosed();
  }
  $effect(() => {
    const visible = open;
    if (!element) return;
    untrack(async () => {
      const revision = ++motionRevision;
      exitAnimation?.cancel(); exitAnimation = undefined;
      if (visible) {
        closing = false;
        if (!counted) { if (toast) toast.dialogs++; counted = true; }
        if (!element.open) {
          previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          element.showModal();
        }
        await tick();
        if (revision !== motionRevision || !open) return;
        element.querySelector<HTMLElement>('.modal-content input:not([disabled]),.modal-content select:not([disabled]),.modal-content button:not([disabled])')?.focus();
      } else if (element.open) {
        closing = true;
        void finishClose(revision);
      }
    });
  });
  onMount(() => () => {
    motionRevision++; exitAnimation?.cancel();
    element?.close();
    if (counted) { if (toast) toast.dialogs--; counted = false; }
    previous?.focus();
  });
</script>

<dialog
  bind:this={element}
  data-dz-modal
  data-closing={closing || undefined}
  onpointerdown={(event) => { backdropPointer = event.button === 0 && outside(event) ? event.pointerId : null; }}
  onpointercancel={() => { backdropPointer = null; }}
  onpointerup={(event) => {
    const dismiss = backdropPointer === event.pointerId && outside(event);
    backdropPointer = null;
    if (dismiss && !busy && !closing) onclose();
  }}
  aria-labelledby={titleId}
  oncancel={(e) => {
    e.preventDefault();
    if (!busy && !closing) onclose();
  }}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <ActionButton
      type="button"
      appearance="quiet"
      disabled={busy || closing}
      onclick={onclose}
      label={t("closeModal")}
      icon="close"
    />
  </header>
  <div class="modal-content">
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    width: min(36rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    background: var(--ui-background);
    color: var(--ui-text);
    box-shadow: 0 12px 48px #0002;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  dialog::backdrop {
    background: #17181b55;
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--ui-border);
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .modal-content {
    flex: 1;
    min-height: 0;
    padding: 1.25rem;
    padding-bottom: 1.25rem;
    overflow: auto;
  }
  dialog :global(.card) {
    border: 0;
    margin: 0;
    padding: 0;
  }
  dialog :global(h3) {
    font-size: 0.875rem;
  }
</style>
