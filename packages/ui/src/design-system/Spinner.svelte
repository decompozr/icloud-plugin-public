<script lang="ts">
  import type { IconSize } from './icons.js';
  import { controlMetrics } from './controlMetrics.js';
  let { label, size = controlMetrics.icon }: { label?: string; size?: IconSize } = $props();
</script>
<svg class="spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
  <circle class="track" cx="12" cy="12" r="9" />
  <path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round" />
</svg>
<style>
  .spinner { display: inline-block; flex-shrink: 0; vertical-align: middle; animation: turn .8s linear infinite; }
  .track { opacity: .2; }
  @keyframes turn { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
