<script lang="ts">
  import ActionButton from "./ActionButton.svelte";
  let {
    label,
    busy = false,
    onclick,
    id,
  }: {
    label: string;
    busy?: boolean;
    onclick: () => void | Promise<void>;
    id?: string;
  } = $props();
  let pending = $state(false);
  async function refresh() {
    if (busy || pending) return;
    pending = true;
    try {
      await onclick();
    } finally {
      pending = false;
    }
  }
</script>

<ActionButton
  {id}
  {label}
  icon="refresh"
  disabled={busy || pending}
  loading={pending}
  onclick={refresh}
/>
