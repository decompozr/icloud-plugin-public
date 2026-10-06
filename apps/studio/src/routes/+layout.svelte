<script lang="ts">
  import { setContext, onMount } from "svelte";
  import type { Snippet } from "svelte";
  import {ToastCenter,DialogCenter} from '../lib/ui-state.svelte.js';
  import Toaster from '../components/Toaster.svelte';
  import CredentialModals from '../components/CredentialModals.svelte';
  const toast=new ToastCenter(),dialogs=new DialogCenter();
  setContext('toast',toast);setContext('dialogs',dialogs);
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
  onMount(()=>{
    // Browser transitions may be cancelled by navigation to a non-opted-in page.
    const settle=(event:Event)=>{const transition=(event as Event&{viewTransition?:ViewTransition}).viewTransition;void transition?.ready.catch(()=>{});void transition?.finished.catch(()=>{});};
    window.addEventListener('pageswap',settle);window.addEventListener('pagereveal',settle);
    return()=>{window.removeEventListener('pageswap',settle);window.removeEventListener('pagereveal',settle);};
  });
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
