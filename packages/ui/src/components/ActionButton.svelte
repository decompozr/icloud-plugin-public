<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Button from "../design-system/Button.svelte";
  import DesignIcon from "./DesignIcon.svelte";
  import SaveIcon from "./SaveIcon.svelte";
  import ProjectIcon from "./Icon.svelte";
  import type { IconName } from "../design-system/icons.js";
  let {
    label,
    icon,
    class: className = "",
    variant,
    appearance = "default",
    showLabel = false,
    size = "normal",
    loading = false,
    ...rest
  }: Omit<HTMLButtonAttributes, "class" | "children"> & {
    class?: string;
    label: string;
    icon: IconName | "passkey" | "save";
    variant?: "primary" | "secondary";
    appearance?: "default" | "quiet";
    size?: "normal" | "compact";
    loading?: boolean;
    showLabel?: boolean;
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
    class={`${showLabel ? "dz-labeled-action" : "dz-icon-action"} ${layoutClass}`}
    variant={primary}
    appearance={showLabel ? appearance : "quiet"}
    {size}
    touchAppearance={size === "compact" && !showLabel ? "compact" : "default"}
    {loading}
    loadingLabel={label}
    aria-label={label}
    title={label}
    data-danger={danger || undefined}
  >
    {#if icon === "save"}<SaveIcon />{:else if icon === "passkey"}<ProjectIcon name="passkey" />{:else}<DesignIcon name={icon} size={size === "compact" ? "1rem" : "1.25rem"} />{/if}
    {#if showLabel}<span>{label}</span>{/if}
  </Button>
  {#if !showLabel}<span class="action-hint" aria-hidden="true">{label}</span>{/if}
</span>
