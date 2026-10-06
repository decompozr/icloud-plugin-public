<script lang="ts">
  import { getContext } from "svelte";
  import type { ToastCenter } from "../lib/ui-state.svelte.js";
  import DesignIcon from "./DesignIcon.svelte";
  let { value, label }: { value?: string; label: string } = $props();
  const toast = getContext<ToastCenter>("toast");
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast?.push("copied");
    } catch {
      toast?.push("copyFailed", "error");
    }
  }
</script>

<button
  type="button"
  class="secondary icon-button"
  aria-label={label}
  title={label}
  disabled={!value}
  onclick={() => void copy()}><DesignIcon name="files" /></button
>

<style>
  button {
    min-width: 28px;
    min-height: 28px;
    padding: 5px;
    flex: none;
  }
  @media (pointer: coarse) {
    button {
      min-width: 44px;
      min-height: 44px;
    }
    button :global(svg) {
      width: 24px;
      height: 24px;
    }
  }
</style>
