<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  let { children }: { children: Snippet } = $props();
</script>

<div class="brand"><Icon name="brand" />{@render children()}</div>
