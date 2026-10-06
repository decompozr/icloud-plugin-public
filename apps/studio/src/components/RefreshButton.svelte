<script lang="ts">
 import DesignIcon from './DesignIcon.svelte';
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
    try { await onclick(); } finally { pending = false; }
  }
</script>

<button
  {id}
  type="button"
  class="secondary icon-button"
  aria-label={label}
  title={label}
  disabled={busy || pending}
  aria-busy={pending}
  onclick={refresh}
  >{#if pending}<span class="spinning"><DesignIcon name="refresh"/></span>{:else}<span><DesignIcon name="refresh"/></span>{/if}
  </button>

<style>
  button {
    min-width: 28px;
    min-height: 28px;
    padding: 5px;
  }
  span{display:inline-flex}
  .spinning {
    animation: turn 1s linear infinite;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinning {
      animation: none;
    }
  }
  @media(pointer:coarse){button{min-width:44px;min-height:44px}button :global(svg){width:24px;height:24px}}
</style>
