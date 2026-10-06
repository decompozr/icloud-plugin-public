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
    onclick: () => void;
    id?: string;
  } = $props();
</script>

<button
  {id}
  type="button"
  class="secondary icon-button"
  aria-label={label}
  title={label}
  disabled={busy}
  {onclick}
  ><span class:spinning={busy}><DesignIcon name="refresh"/></span>
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
