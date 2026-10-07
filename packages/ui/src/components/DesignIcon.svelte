<script lang="ts">
  import Icon from "../design-system/Icon.svelte";
  import type { IconName, IconSize } from "../design-system/icons.js";
  let { name, size = "1rem" }: { name: IconName; size?: IconSize } = $props();
</script>

<Icon {name} {size} />
