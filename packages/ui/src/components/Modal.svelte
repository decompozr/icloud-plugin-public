<script lang="ts">
  import ActionButton from "./ActionButton.svelte";
  import { getContext, onMount, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import Toaster from "./Toaster.svelte";
  import type { ToastCenter } from "../toast-state.svelte.js";
  let {
    open,
    title,
    onclose,
    children,
    busy = false,
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
    busy?: boolean;
  } = $props();
  const { t } = getContext<UiCopy>("copy");
  const titleId = $props.id();
  const toast = getContext<ToastCenter>("toast");
  let counted = false;
  let element: HTMLDialogElement;
  let previous: HTMLElement | null = null;
  let notificationSpace = $state(0);
  $effect(() => {
    const visible = open;
    const messages = toast?.items.length ?? 0;
    if (!visible || !messages) {
      notificationSpace = 0;
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    tick().then(() => {
      if (cancelled) return;
      const region = element?.querySelector<HTMLElement>('.toast-region');
      if (!region) return;
      const measure = () => {
        notificationSpace = region.offsetHeight;
        tick().then(() => {
          if (cancelled) return;
          const content = element.querySelector<HTMLElement>('.modal-content');
          const actions = content?.querySelectorAll<HTMLElement>('.actions');
          const footer = actions?.[actions.length - 1];
          if (!content || !footer) return;
          const notification = region.getBoundingClientRect();
          const controls = footer.getBoundingClientRect();
          if (controls.bottom > notification.top && controls.top < notification.bottom) {
            content.scrollTop += controls.bottom - notification.top + parseFloat(getComputedStyle(content).paddingTop);
          }
        });
      };
      observer = new ResizeObserver(measure);
      observer.observe(region);
      measure();
    });
    return () => { cancelled = true; observer?.disconnect(); };
  });
  $effect(() => {
    if (open && element)
      untrack(async () => {
        if (!counted) {
          if (toast) toast.dialogs++;
          counted = true;
        }
        previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        if (!element.open) element.showModal();
        await tick();
        element
          .querySelector<HTMLElement>(
            ".modal-content input:not([disabled]),.modal-content select:not([disabled]),.modal-content button:not([disabled])",
          )
          ?.focus();
      });
    else if (element?.open) {
      element.close();
      if (counted) {
        if (toast) toast.dialogs--;
        counted = false;
      }
      previous?.focus();
    }
  });
  onMount(() => () => {
    element?.close();
    if (counted) {
      if (toast) toast.dialogs--;
      counted = false;
    }
    previous?.focus();
  });
</script>

<dialog
  bind:this={element}
  aria-labelledby={titleId}
  style:--modal-notification-space={`${notificationSpace}px`}
  oncancel={(e) => {
    e.preventDefault();
    if (!busy) onclose();
  }}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <ActionButton
      type="button"
      class="secondary icon-button"
      disabled={busy}
      onclick={onclose}
      label={t("closeModal")}
      icon="close"
    />
  </header>
  <div class="modal-content">
    {#if toast && open}<Toaster
        center={toast}
        embedded
      />{/if}{@render children()}
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
    padding-bottom: calc(1.25rem + var(--modal-notification-space, 0px));
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
