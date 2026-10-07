<script lang="ts">
  import { toastDrag, toastDismissed } from "../lib/toast-gesture.js";
  import Toast from "../lib/design-system/Toast.svelte";
  let {
    message,
    error = false,
    onDismiss,
  }: { message: string; error?: boolean; onDismiss: () => void } = $props();
  let offset = $state(0),
    dragging = $state(false),
    originX = 0,
    originY = 0;
  function down(event: PointerEvent) {
    if (
      event.button !== 0 ||
      (event.target as Element).closest("button,a,input,select")
    )
      return;
    originX = event.clientX;
    originY = event.clientY;
    offset = 0;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - originX,
      dy = event.clientY - originY;
    const next = toastDrag(dx, dy);
    if (next.cancelled) {
      cancel();
      return;
    }
    offset = next.offset;
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    if (toastDismissed(offset)) onDismiss();
    else offset = 0;
  }
  function cancel() {
    dragging = false;
    offset = 0;
  }
</script>

<div
  class="swipe-toast"
  class:dragging
  style:--swipe-x={`${offset}px`}
  style:opacity={Math.max(0.2, 1 - offset / 320)}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={cancel}
  role="group"
  aria-label={message}
>
  <Toast kind={error ? "error" : "info"} {message} urgent={error} {onDismiss} />
</div>

<style>
  .swipe-toast {
    transform: translateX(var(--swipe-x));
    touch-action: pan-y;
    transition:
      transform 160ms ease-out,
      opacity 160ms ease-out;
  }
  .swipe-toast.dragging {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .swipe-toast {
      transition: none;
    }
  }
</style>
