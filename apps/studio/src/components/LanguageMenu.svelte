<script lang="ts">
  import { getContext } from "svelte";
  import type { UiCopy } from "../contracts.js";
  import type { LocaleControl } from "../lib/ui-state.svelte.js";
  import GlobeMenu from "@decompozr/ui/components/GlobeMenu.svelte";
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
  <GlobeMenu label={t("language")} {items} />
</div>

<style>
  .rail {
    margin: 0.5rem 0 0;
    width: 44px;
  }
  .language-menu {
    margin-left: auto;
    flex: none;
    align-self: center;
  }
</style>
