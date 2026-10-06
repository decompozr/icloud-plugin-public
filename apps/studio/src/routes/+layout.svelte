<script lang="ts">
  import { setContext } from "svelte";
  import type { Snippet } from "svelte";
  import { pageStyles } from "../styles.js";
  import { createCopy } from "../lib/copy.js";
  import { setLocale, type Locale } from "../lib/paraglide/runtime.js";
  let { data, children }: { data: { locale: Locale }; children: Snippet } =
    $props();
  // svelte-ignore state_referenced_locally
  let locale = $state(data.locale);
  setContext(
    "copy",
    createCopy(() => locale),
  );
  setContext("locale", {
    get current() {
      return locale;
    },
    set(value: Locale) {
      locale = value;
      setLocale(value, { reload: false });
      document.documentElement.lang = value;
    },
  });
</script>

<svelte:head>{@html "<style>" + pageStyles + "</style>"}</svelte:head>
{@render children()}
