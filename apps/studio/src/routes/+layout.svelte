<script lang="ts">
  import { setContext } from "svelte";
  import{pushState,replaceState}from'$app/navigation';
  import type { Snippet } from "svelte";
  import {ToastCenter,DialogCenter} from '../lib/ui-state.svelte.js';
  import Toaster from '../../../../packages/ui/src/components/Toaster.svelte';
  import CredentialModals from '../../../../modules/account/ui/CredentialModals.svelte';
  const toast=new ToastCenter(),dialogs=new DialogCenter();
  setContext('toast',toast);setContext('dialogs',dialogs);
  import { pageStyles } from "../styles.js";
  import { createCopy } from "../lib/copy.js";
  import { setLocale, type Locale } from "../lib/paraglide/runtime.js";
  let { data, children }: { data: { locale: Locale }; children: Snippet } =
    $props();
  // svelte-ignore state_referenced_locally
  let locale = $state(data.locale);
  setContext('navigation',{push:(href:string)=>pushState(href,{}),replace:(href:string)=>replaceState(href,{})});
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
<CredentialModals center={dialogs}/><Toaster center={toast}/>
