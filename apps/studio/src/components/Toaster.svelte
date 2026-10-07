<script lang="ts">
  import { getContext, onMount, tick } from "svelte";
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import ToastRegion from "../lib/design-system/ToastRegion.svelte";
  import { spacing } from "../lib/design-system/spacing.js";
  import SwipeToast from "./SwipeToast.svelte";
  import type { UiCopy } from "../contracts.js";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  const { t } = getContext<UiCopy>("copy");
  let {
    center,
    embedded = false,
  }: { center: ToastCenter; embedded?: boolean } = $props();
  let host: HTMLDivElement;
  async function dismiss(id: number) {
    const focused = document.activeElement;
    const item =
      focused instanceof Element ? focused.closest("[data-toast-id]") : null;
    const restore = item?.getAttribute("data-toast-id") === String(id);
    center.dismiss(id);
    await tick();
    if (restore) {
      const candidates = Array.from(
        host.querySelectorAll<HTMLElement>("[data-toast-id]"),
      ).filter((node) => node.getAttribute("data-toast-id") !== String(id));
      const target =
        candidates.at(-1)?.querySelector<HTMLElement>("button") ??
        host.querySelector<HTMLElement>('[role="region"]');
      target?.focus({ preventScroll: true });
    }
  }
  let viewportBottom = $state(0),
    reducedMotion = $state(false);
  onMount(() => {
    const viewport = window.visualViewport,
      media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      viewportBottom = Math.max(
        0,
        window.innerHeight -
          (viewport?.height ?? window.innerHeight) -
          (viewport?.offsetTop ?? 0),
      );
    };
    const motion = () => {
      reducedMotion = media.matches;
    };
    update();
    motion();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    media.addEventListener("change", motion);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      media.removeEventListener("change", motion);
    };
  });
</script>

<div
  bind:this={host}
  style:--toast-region-bottom={`calc(${viewportBottom}px + ${spacing[4]})`}
>
  <ToastRegion
    label={t("notifications")}
    open={embedded || center.dialogs === 0}
  >
    {#each center.items as item (item.id)}<div
        data-testid="toast"
        data-toast-id={item.id}
        animate:flip={{ duration: reducedMotion ? 0 : 180 }}
        in:fly={{
          y: reducedMotion ? 0 : 16,
          duration: reducedMotion ? 0 : 180,
        }}
        out:fly={{
          x: reducedMotion ? 0 : 48,
          duration: reducedMotion ? 0 : 120,
        }}
      >
        <SwipeToast
          message={t(item.key)}
          error={item.tone === "error"}
          onDismiss={() => {
            void dismiss(item.id);
          }}
        />
      </div>{/each}
  </ToastRegion>
</div>
