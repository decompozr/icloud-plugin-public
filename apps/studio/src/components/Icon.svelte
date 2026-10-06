<script lang="ts">
  import { brandLinks, brandNodes } from "../branding.js";
  let { name }: { name: "brand" | "passkey" } = $props();
</script>

{#if name === "brand"}
  <svg
    class="ui-icon"
    data-ui-icon="brand"
    aria-hidden="true"
    viewBox="0 0 256 256"
    width="32"
    height="32"
  >
    <rect width="256" height="256" fill="#FFFFFF" /><g
      stroke="currentColor"
      stroke-width="12"
      stroke-linecap="round"
      ><path d={brandLinks} />{#each brandNodes as node}<rect
          x={node.x}
          y={node.y}
          width="52"
          height="52"
          rx="10"
          fill="#FFFFFF"
        />{/each}</g
    ></svg
  >
{:else}
  <svg
    class="ui-icon"
    data-ui-icon="passkey"
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    ><circle cx="8" cy="9" r="4" /><path
      d="m11 12 9 9m-4-4 3-3m-6 0 3-3"
    /></svg
  >
{/if}
