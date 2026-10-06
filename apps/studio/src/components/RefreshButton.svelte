<script lang="ts">
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
  ><svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    class:spinning={busy}
    ><path
      d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"
    /></svg
  ></button
>

<style>
  button {
    min-width: 32px;
    min-height: 32px;
    padding: 6px;
  }
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
</style>
