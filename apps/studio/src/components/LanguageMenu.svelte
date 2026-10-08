<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { LocaleControl } from "../lib/ui-state.svelte.js";
  import Menu from "@decompozr/ui/design-system/Menu.svelte";
  let { rail = false }: { rail?: boolean } = $props();
  const { t } = getContext<UiCopy>("copy"),
    locale = getContext<LocaleControl>("locale");
  const items = $derived([
    {
      id: "en",
      label: (locale?.current === "en" ? "✓ " : "") + "English",
      onSelect: () => locale?.set("en"),
    },
    {
      id: "zh-TW",
      label: (locale?.current === "zh-TW" ? "✓ " : "") + "繁體中文",
      onSelect: () => locale?.set("zh-TW"),
    },
  ]);
</script>

<div
  class="language-menu"
  class:rail
  role="group"
  aria-label={t("language")}
  title={t("language")}
>
  <Menu label={rail ? (locale?.current === "zh-TW" ? "繁" : "EN") : t("language")} {items} compact />
</div>

<style>
  .rail {
    margin: 0.5rem 0 0;
    width: 44px;
  }
  .rail :global(.trigger) {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
  }
  .language-menu {
    margin-left: auto;
    flex: none;
    align-self: center;
  }
</style>
