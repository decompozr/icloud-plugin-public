<script lang="ts">
  let { rows = 3 }: { rows?: number } = $props();
</script>

<div class="skeleton" aria-hidden="true">
  {#each Array(rows) as _, index}<div
      style:width={index === rows - 1 ? "65%" : "100%"}
    ></div>{/each}
</div>

<style>
  .skeleton {
    display: grid;
    gap: 0.75rem;
    padding: 0.5rem 0;
  }
  .skeleton div {
    height: 1rem;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--ui-soft),
      var(--ui-border),
      var(--ui-soft)
    );
    background-size: 200% 100%;
    animation: pulse 1.5s ease infinite;
  }
  @keyframes pulse {
    to {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton div {
      animation: none;
    }
  }
</style>
