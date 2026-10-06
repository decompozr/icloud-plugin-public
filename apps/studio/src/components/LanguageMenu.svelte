<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { LocaleControl } from "../lib/ui-state.svelte.js";
  import Menu from "../lib/design-system/Menu.svelte";
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

<div class="language-menu" role="group" aria-label={t("language")}>
  <Menu
    label={locale?.current === "zh-TW" ? "繁中" : "EN"}
    {items}
    compact
  />
</div>

<style>
  .language-menu {
    margin-left: auto;
    flex: none;
    align-self: center;
  }
</style>
