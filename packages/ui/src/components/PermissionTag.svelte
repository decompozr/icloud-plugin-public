<script lang="ts">
  import Tag from '../design-system/Tag.svelte';
  import {permissionTagColors} from '../permission-tag-colors.js';
  let {label,scope}:{label:string;scope:string}=$props();
  const colors=$derived(permissionTagColors(scope));
</script>
<span class="permission-tag" data-permission-kind={colors.kind} style:--permission-surface={colors.surface} style:--permission-ink={colors.ink}><Tag {label}/></span>
<style>
  .permission-tag { display: contents; }
  .permission-tag :global(.tag) { color: var(--permission-ink); }
  .permission-tag :global(.tag::before) { background: var(--permission-surface); }
</style>
