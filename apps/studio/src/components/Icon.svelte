<script lang="ts">
 import DesignIcon from './DesignIcon.svelte';
  import { brandMark } from "../branding.js";
  let { name }: { name: "brand" | "passkey" | "settings" } = $props();
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
    {@html brandMark}
  </svg>
{:else if name === "settings"}<DesignIcon name="settings"/>
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
