<script lang="ts">
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
    ><rect width="256" height="256" fill="#fff" /><path
      d="M76 180 C51 180 34 163 34 142 C34 122 48 105 67 102 C71 76 93 58 119 58 C147 58 169 77 173 103 C199 103 222 120 222 143 C222 165 204 180 181 180 Z"
      fill="#000"
    /></svg
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
