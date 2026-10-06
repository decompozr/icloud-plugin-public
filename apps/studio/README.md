# iCloud Agent Studio

Studio is the SvelteKit Web presentation embedded in the existing iCloud service.
It owns hydrated admin/setup, owner login, account selection, OAuth consent and
Photos setup. Svelte owns form drafts, policy confirmation, account selection,
connection impact, bounded diagnostics, credentials and lifecycle cleanup. Native
installation still runs one process with distinct public/private/local listeners.

The trusted outer dispatcher supplies an explicit page model after existing owner
checks. Only serializable presentation metadata reaches the browser. Core owner
sessions, grants, storage, bootstrap proof and provider operations stay in
`apps/icloud`; public ingress cannot select a private page using headers. The
Studio transport forwards protocol APIs unchanged to those authoritative handlers.
APIs bypass SvelteKit page middleware and form CSRF: OAuth code/refresh exchanges
must accept standards-compliant originless forms, while private mutations retain
core exact-Origin and bounded JSON checks.

## Messages and locale

Edit `messages/en.json` and `messages/zh-TW.json`. Paraglide compiles these catalogs
into typed functions; generated sources under `src/lib/paraglide` are ignored and
rebuilt. The message-format plugin is a pinned local dependency, so compiling does
not download executable plugins from a CDN. Both catalogs must have matching keys.
`auth_` keys describe authorization UI; Photos and shared UI use descriptive keys.

Use cookie then English base-locale resolution. Each SSR request has its own
locale; browser locale changes update Svelte and the cookie without losing drafts.
OAuth/MCP URLs have no language prefixes or localization redirects. Core-only
compatibility helpers use i18next backed by these same JSON catalogs; browser UI
uses Paraglide and does not load an i18next DOM controller.

## Build and verification

Install this app's dependencies with `bun install --frozen-lockfile`. From the
repository root, `bun bin/build` builds SvelteKit using adapter-node on Bun 1.4.2,
bundles SSR dependencies, and copies the Kit server/client output into the native
artifact. It imports the generated Kit server instance without starting another
listener. Startup never compiles or installs packages. Only compiled client assets
are served, through a file allowlist; server chunks/configuration are not public.

`bun bin/typecheck`, `bun bin/test` and `bun bin/e2e` cover the corresponding
checks. Studio tests verify concurrent bilingual SSR, nonce CSP, safe serialization,
raw protocol forwarding and catalog parity. The browser fixture uses production
Kit assets and disposable dummy accounts. Navigation uses document reloads to
revalidate owner authority and clear volatile secrets on each page boundary.
No client-side data route bypass is mounted on the public/private listeners.

See [migration phases](../../docs/svelte-migration.md) for rollout and acceptance.
