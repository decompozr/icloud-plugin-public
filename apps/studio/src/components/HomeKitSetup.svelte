<script lang="ts">
  import ActionButton from "./ActionButton.svelte";
  import { getContext, onMount } from "svelte";
  import { z } from "zod";
  import Checkbox from "../lib/design-system/Checkbox.svelte";
  import Select from "../lib/design-system/Select.svelte";
  import { spacing } from "../lib/design-system/spacing.js";
  import type { UiCopy } from "../contracts.js";
  let {
    embedded = false,
    onverified,
  }: { embedded?: boolean; onverified?: (ready: boolean) => void } = $props();
  const { t } = getContext<UiCopy>("copy");
  const schema = z.object({
    helper: z.object({
      ready: z.literal(true),
      authorized: z.literal(true),
      localUserId: z.number(),
      sourceSHA256: z.string(),
    }),
    homes: z.array(z.object({ id: z.string(), name: z.string() })),
    bindings: z.array(
      z.object({ id: z.string(), account: z.string(), home: z.string() }),
    ),
  });
  let status = $state<z.infer<typeof schema>>(),
    accounts = $state<
      { id: string; label?: string; user: string; credentialStored: boolean }[]
    >([]),
    accountId = $state(""),
    homeId = $state(""),
    confirm = $state(false),
    busy = $state(false),
    failed = $state(false);
  async function read() {
    busy = true;
    failed = false;
    try {
      const [a, b] = await Promise.all([
        fetch("/icloud/admin/homekit/status"),
        fetch("/icloud/admin/status"),
      ]);
      if (!a.ok || !b.ok) throw Error();
      status = schema.parse(await a.json());
      accounts = (await b.json()).accounts;
      accountId = accountId || accounts[0]?.id || "";
      homeId = homeId || status.homes[0]?.id || "";
      onverified?.(
        status.bindings.some((b) =>
          accounts.some((a) => a.id === b.account && a.credentialStored),
        ),
      );
    } catch {
      failed = true;
      onverified?.(false);
    } finally {
      busy = false;
    }
  }
  async function enroll() {
    if (!status || !confirm) return;
    busy = true;
    failed = false;
    try {
      const response = await fetch("/icloud/admin/homekit/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          homeId,
          confirm: true,
          expectedSourceSHA256: status.helper.sourceSHA256,
          expectedLocalUserId: status.helper.localUserId,
        }),
      });
      if (!response.ok) throw Error();
      confirm = false;
      await read();
    } catch {
      failed = true;
      busy = false;
    }
  }
  async function revoke(binding: { account: string; home: string }) {
    busy = true;
    failed = false;
    try {
      const response = await fetch("/icloud/admin/homekit/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: binding.account,
          homeId: binding.home,
          confirm: true,
        }),
      });
      if (!response.ok) throw Error();
      await read();
    } catch {
      failed = true;
      busy = false;
    }
  }
  onMount(() => {
    void read();
  });
</script>

<section
  class={embedded ? "homekit-connection" : "card"}
  data-testid="homekit-setup"
  aria-busy={busy}
  style:--section-gap={spacing[4]}
  style:--row-gap={spacing[2]}
>
  <header class="connection-header">
    {#if embedded}<h3>{t("homekitConnectionTitle")}</h3>{:else}<h2>
        {t("homekitTitle")}
      </h2>{/if}<ActionButton
      disabled={busy}
      onclick={() => {
        void read();
      }}
      label={t("homekitRefresh")}
      icon="refresh"
    />
  </header>
  <details>
    <summary>{t("photosPermissionHelpShort")}</summary>
    <p>{t("homekitBackgroundHelp")}</p>
  </details>
  {#if failed}<p class="error" role="alert">{t("homekitUnavailable")}</p>{/if}
  {#if status}<p>{t("homekitReady")}</p>
    <div class="home-fields">
      <Select
        id="homekit-account"
        label={t("homekitAccount")}
        bind:value={accountId}
        disabled={busy}
        options={accounts.map((a) => ({
          value: a.id,
          label: a.label || a.user,
        }))}
      />
      <Select
        id="homekit-home"
        label={t("homekitHome")}
        bind:value={homeId}
        disabled={busy}
        options={status.homes.map((h) => ({ value: h.id, label: h.name }))}
      />
      <Checkbox
        label={t("homekitConfirm")}
        bind:checked={confirm}
        disabled={busy}
      />
      <div class="link-actions">
        <ActionButton
          variant="primary"
          disabled={busy || !confirm || !accountId || !homeId}
          onclick={() => {
            void enroll();
          }}
          label={t("homekitBind")}
          icon="connection"
        />
      </div>
    </div>
    {#if status.bindings.length}<div class="linked-homes">
        <h3>{t("homekitBindings")}</h3>
        {#each status.bindings as binding}<div class="linked-home">
            <span
              >{status.homes.find((h) => h.id === binding.home)?.name ||
                t("homekitHome")}</span
            ><ActionButton
              disabled={busy}
              onclick={() => {
                void revoke(binding);
              }}
              label={t("homekitUnbind")}
              icon="unplug"
            />
          </div>{/each}
      </div>{/if}
    <p class="muted">{t("homekitConsentHelp")}</p>
  {/if}
</section>

<style>
  .homekit-connection {
    display: grid;
    gap: var(--section-gap);
  }
  .connection-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--row-gap);
    flex-wrap: wrap;
  }
  .connection-header h2,
  .connection-header h3,
  .linked-homes h3 {
    margin: 0;
    padding: 0;
    border: 0;
  }
  p {
    margin: 0;
  }
  .home-fields,
  .linked-homes {
    display: grid;
    gap: var(--section-gap);
  }
  .linked-homes {
    border-top: 1px solid var(--ui-border);
    padding-top: var(--section-gap);
  }
  .linked-home,
  .link-actions {
    display: flex;
    align-items: center;
    gap: var(--row-gap);
    flex-wrap: wrap;
  }
  .linked-home span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
