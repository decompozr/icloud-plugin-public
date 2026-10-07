<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  const { t } = getContext<UiCopy>("copy");
  let {
    center,
    embedded = false,
  }: { center: ToastCenter; embedded?: boolean } = $props();
  let viewportBottom=$state(0),viewportRight=$state(0);
  onMount(()=>{const viewport=window.visualViewport;const update=()=>{viewportBottom=Math.max(0,window.innerHeight-(viewport?.height??window.innerHeight)-(viewport?.offsetTop??0));viewportRight=Math.max(0,window.innerWidth-(viewport?.width??window.innerWidth)-(viewport?.offsetLeft??0));};update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};});
</script>

<div
  class="toast-stack"
  class:embedded
  style:bottom={`calc(${viewportBottom}px + max(.75rem, env(safe-area-inset-bottom)))`}
  style:right={`calc(${viewportRight}px + max(.75rem, env(safe-area-inset-right)))`}
  hidden={center.items.length === 0 || (!embedded && center.dialogs > 0)}
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
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    z-index: 1000;
    display: grid;
    gap: 0.5rem;
    width: min(18rem, calc(100vw - 2rem));
    justify-items: end;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    width: fit-content;
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    background: var(--ui-background);
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    box-shadow: 0 6px 24px #00000014;
    color: var(--ui-text);
  }
  .toast span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .toast button {
    flex-shrink: 0;
  }
  .toast.error {
    background: #f8eeed;
    border-color: var(--ui-critical);
    color: var(--ui-critical);
  }
</style>
