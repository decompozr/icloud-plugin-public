<script lang="ts">
  import Admin from "../../components/Admin.svelte";
  import Auth from "@decompozr/account/ui/Auth.svelte";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

{#if data.studio.kind === "admin"}<Admin
    state={{
      ...data.studio.state,
      presentation: data.studio.state.presentation
        ? {
            ...data.studio.state.presentation,
            credentialSection: () =>
              data.studio.kind === "admin"
                ? (data.studio.state.presentation?.credentialHtml ?? "")
                : "",
          }
        : undefined,
    }}
  />{:else}<Auth
    mode={data.studio.mode}
    privateAdmin={data.studio.privateAdmin}
    scopeLabels={data.studio.scopeLabels}
  />{/if}
