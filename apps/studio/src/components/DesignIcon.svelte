<script lang="ts">
  import Icon from "../lib/design-system/Icon.svelte";
  import type { IconName, IconSize } from "../lib/design-system/icons.js";
  let { name, size = "1rem" }: { name: IconName; size?: IconSize } = $props();
</script>

<Icon {name} {size} />
