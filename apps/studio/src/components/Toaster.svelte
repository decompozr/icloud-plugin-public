<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  const { t } = getContext<UiCopy>("copy");
  let {
    center,
    embedded = false,
  }: { center: ToastCenter; embedded?: boolean } = $props();
</script>

<div
  class="toast-stack"
  class:embedded
  hidden={!embedded && center.dialogs > 0}
  aria-label={t("notifications")}
>
  {#each center.items as item (item.id)}<div
      class="toast"
      data-testid="toast"
      class:error={item.tone === "error"}
      role={item.tone === "error" ? "alert" : "status"}
      aria-live={item.tone === "error" ? "assertive" : "polite"}
    >
      <span>{t(item.key)}</span><button
        type="button"
        class="secondary icon-button"
        aria-label={t("dismissNotification")}
        onclick={() => center.dismiss(item.id)}>×</button
      >
    </div>{/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 1000;
    display: grid;
    gap: 0.5rem;
    width: min(25rem, calc(100vw - 2.5rem));
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--ui-background);
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    box-shadow: 0 6px 24px #00000014;
    color: var(--ui-text);
  }
  .toast-stack.embedded {
    position: sticky;
    top: 0;
    right: auto;
    bottom: auto;
    width: 100%;
    margin-bottom: 0.75rem;
  }
  .toast.error {
    background: #f8eeed;
    border-color: var(--ui-critical);
    color: var(--ui-critical);
  }
</style>
