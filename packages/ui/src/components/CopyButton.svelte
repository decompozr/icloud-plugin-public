<script lang="ts">
  import { getContext } from "svelte";
  import type { ToastCenter } from "../toast-state.svelte.js";
  import ActionButton from "./ActionButton.svelte";
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

<ActionButton
  {label}
  icon="files"
  disabled={!value}
  onclick={() => void copy()}
/>
