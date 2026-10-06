<script lang="ts">
  import { getContext, onMount, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import Toaster from "./Toaster.svelte";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
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
  oncancel={(e) => {
    e.preventDefault();
    if (!busy) onclose();
  }}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button
      type="button"
      class="secondary icon-button"
      aria-label={t("closeModal")}
      disabled={busy}
      onclick={onclose}>×</button
    >
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
  dialog::backdrop {
    background: #17181b55;
  }
  header {
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
    padding: 1.25rem;
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
