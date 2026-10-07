<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Button from "../lib/design-system/Button.svelte";
  import DesignIcon from "./DesignIcon.svelte";
  import ProjectIcon from "./Icon.svelte";
  import type { IconName } from "../lib/design-system/icons.js";
  let {
    label,
    icon,
    class: className = "",
    variant,
    size = "compact",
    loading = false,
    ...rest
  }: Omit<HTMLButtonAttributes, "class" | "children"> & {
    class?: string;
    label: string;
    icon: IconName | "passkey";
    variant?: "primary" | "secondary";
    size?: "normal" | "compact";
    loading?: boolean;
  } = $props();
  const primary = $derived(
    variant ??
      (className.split(" ").includes("primary") ? "primary" : "secondary"),
  );
  const danger = $derived(className.split(" ").includes("danger"));
  const layoutClass = $derived(
    className
      .split(" ")
      .filter(
        (name) =>
          ![
            "primary",
            "secondary",
            "danger",
            "icon-button",
            "button-icon",
          ].includes(name),
      )
      .join(" "),
  );
</script>

<span class="action-explanation" title={label}>
  <Button
    {...rest}
    class={`dz-icon-action ${layoutClass}`}
    variant={primary}
    {size}
    {loading}
    loadingLabel={label}
    aria-label={label}
    title={label}
    data-danger={danger || undefined}
  >
    {#if icon === "passkey"}<ProjectIcon name="passkey" />{:else}<DesignIcon name={icon} size={size === "compact" ? "1rem" : "1.25rem"} />{/if}
  </Button>
  <span class="action-hint" aria-hidden="true">{label}</span>
</span>
