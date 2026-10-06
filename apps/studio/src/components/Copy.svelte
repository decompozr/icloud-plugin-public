<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  let { copyKey }: { copyKey: string } = $props();
  const { richText } = getContext<UiCopy>("copy");
</script>

<span data-copy={copyKey}
  >{#each richText(copyKey) as part}{#if part.strong}<strong>{part.text}</strong
      >{:else}{part.text}{/if}{/each}</span
>
