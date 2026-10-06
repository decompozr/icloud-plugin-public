# iCloud Agent Studio

Studio owns the Svelte presentation for the existing iCloud service: owner setup,
Overview, Accounts, Connections, System, public owner login, account selection,
OAuth consent and Photos setup panels. Components render real markup through
Svelte 5 server rendering; they do not wrap the previous whole-page HTML strings.
Shared copy is supplied by the host, so existing locale selection remains authoritative.

Phase one is a presentation app embedded in the existing runtime. It has no
independent listener. Browser assets keep the existing same-origin controllers as
compatibility adapters over the component output. There is no client hydration yet;
reactive browser ownership and SvelteKit routing belong to the next accepted phase.
Provider clients, grants, credentials, owner sessions and database access stay in
`apps/icloud`. Only trusted module-owned credential markup crosses the HTML extension
boundary; user labels and URLs are escaped by Svelte.

Install this app's dependencies with `bun install --frozen-lockfile`. From the
repository root, `bun bin/build` builds Studio before the server, bundles the
server renderer into the runtime and copies browser assets into the existing asset
paths. Native artifacts contain compiled output and licenses; they do not need a
Svelte compiler, Studio sources or dependency installation at startup.

`bun bin/typecheck`, `bun bin/test` and `bun bin/e2e` include the corresponding
checks. `bun run --cwd apps/studio typecheck` checks components and browser adapters.
The existing optional headless browser fixture exercises the production assets
with disposable dummy accounts, without live provider mutations.

See [migration phases](../../docs/svelte-migration.md) for the rollout contract.
