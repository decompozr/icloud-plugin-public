<script lang="ts">
  import { getContext, onMount, tick } from "svelte";
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import ToastRegion from "../design-system/ToastRegion.svelte";
  import { spacing } from "../design-system/spacing.js";
  import SwipeToast from "./SwipeToast.svelte";
  import type { UiCopy } from "../contracts.js";
  import type { ToastCenter } from "../toast-state.svelte.js";
  const { t } = getContext<UiCopy>("copy");
  let { center }: { center: ToastCenter } = $props();
  let mounted = $state(false);
  let originalParent: Node | null = null;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const paused = new Set<number>();
  function pause(id:number) { clearTimeout(timers.get(id)); timers.delete(id); paused.add(id); }
  function resume(id:number) { paused.delete(id); schedule(id); }
  function schedule(id:number) { if(!timers.has(id) && !paused.has(id)) timers.set(id,setTimeout(()=>{timers.delete(id);void dismiss(id);},5000)); }
  $effect(()=>{if(!mounted)return;const ids=center.items.map(item=>item.id);for(const id of ids)schedule(id);for(const [id,timer] of timers)if(!ids.includes(id)){clearTimeout(timer);timers.delete(id);paused.delete(id);}});
  $effect(()=>{const dialogs=center.dialogs;if(!mounted)return;void tick().then(()=>{if(!mounted)return;host.hidePopover();
      // Native modal inertness requires a descendant host. The popover itself
      // stays in the browser top layer, outside every layout and scrollport.
      const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1);
      (dialog ?? originalParent)?.appendChild(host);
      host.showPopover();});});
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
    originalParent = host.parentNode;
    mounted = true;
    host.showPopover();
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
      mounted = false;
      for(const timer of timers.values())clearTimeout(timer);timers.clear();
      host.hidePopover();
      originalParent?.appendChild(host);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      media.removeEventListener("change", motion);
    };
  });
</script>

<div
  bind:this={host}
  popover="manual"
  class="toast-layer"
  style:--toast-region-bottom={`calc(${viewportBottom}px + ${spacing[4]})`}
>
  <ToastRegion
    label={t("notifications")}
    open={true}
  >
    {#each center.items as item (item.id)}<div
        role="group"
        data-testid="toast"
        data-toast-id={item.id}
        onpointerenter={()=>pause(item.id)}
        onpointerleave={()=>resume(item.id)}
        onfocusin={()=>pause(item.id)}
        onfocusout={()=>resume(item.id)}
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
