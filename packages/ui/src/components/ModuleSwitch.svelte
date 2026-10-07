<script lang="ts">
  import { tick } from "svelte";
  import Switch from "../design-system/Switch.svelte";
  let {
    label,
    enabled,
    disabled,
    onchange,
  }: {
    label: string;
    enabled: boolean;
    disabled: boolean;
    onchange: (enabled: boolean) => void;
  } = $props();
  let checked = $state(false);
  $effect(() => {
    checked = enabled;
  });
  async function propose(event: Event) {
    onchange((event.currentTarget as HTMLInputElement).checked);
    await tick();
    checked = enabled;
  }
</script>

<span class="module-switch" title={label}>
  <Switch
    label=""
    aria-label={label}
    size="compact"
    {disabled}
    bind:checked
    onchange={propose}
  />
</span>
