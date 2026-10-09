# Overview cleanup, section skeletons and automatic client permissions

Owner: Studio visuals and Account-module authorization. Date: 2026-10-09. Authorized endpoint: source plus existing private 8464 fixture preview; no native installation. User explicitly selected automatic synchronization of enabled permissions to existing connections.

## Stories

- As an owner reading Overview, I see Runtime, Accounts and Capabilities directly, without a top or bottom task/review banner. Actions and failures stay in their relevant sections. The old Choose capabilities task button and its task classifier are removed, superseding earlier task-entry/smooth-scroll stories.
- As a user viewing the page, I get one compact 44px fixed heading with an 8px following gap. Icons and 44px touch targets stay unchanged, and the top remains opaque while scrolling. The sidebar brand aligns with this row.
- As a user waiting for data, I see layout-specific skeletons: Runtime's four label/value rows and copy slot, Accounts' counts/identity/access rows and right-side actions, and Capabilities' module rows/summary/switch/settings slots. Known labels/descriptions remain; unknown values are placeholders. Skeletons are aria-hidden, noninteractive, token-based and motion-free under reduced motion. Unknown account count/text wrapping can change final height; stale refreshes retain actual content.
- As an owner saving enabled module capabilities, I want existing account-bound client access to synchronize automatically, without another Review/consent step. Account-module sync updates registrations and existing live opaque-token/refresh/consent scope records with additions restricted to declared/current-enabled ceilings. Identity, account binding, token material, lifetime and revocation state remain unchanged. Initial OAuth consent remains explicit; disabled operations remain blocked by runtime policy.
- As an owner encountering a sync failure, I see that settings saved but permissions did not fully synchronize. Connection refresh retries authenticated reconciliation; shared registrations with other users and multi-resource grants are not broadened and are reported as partial when new permissions cannot be safely synchronized. Expired/revoked grants, invalid accounts and other resources/users are never revived or broadened.

## Implementation and acceptance

The iCloud host explicitly opts into automatic permission synchronization; other Account-module consumers retain read-only listing behavior by default. Account sync uses the existing OAuth mutation queue and one atomic audited database transaction. It runs after validated owner capability saves and before authenticated private connection listings, with exact origin/host checks. No anonymous request triggers it. Audit records contain scope changes and identifiers, never token/credential material. Listing reports existingGrantsChanged and permissionSync truthfully. Repeated reconciliation is idempotent.

Verify real opaque-token introspection after synchronization, account/resource/owner isolation, expiry/revocation/session checks, unknown-scope exclusion, audit/idempotence, failure rollback and denied unauthenticated listings. Verify slim/sealed header, banner absence, section skeleton structure and loaded/refresh states on desktop/mobile. Refresh the private fictional preview and record screenshots. Real provider/client tool refresh and physical-device acceptance remain separate.

Status: implemented and self-checked; private fixture preview updated. Production/native installation remains N/A for this milestone.

Runtime order: Version, Folder, Status, Tailscale. Runtime skeleton uses the same field order and places its copy slot on Folder. The private fixture supports network-off/network-on scenarios for visual recovery review without changing the real tailnet service.

## Acceptance evidence

Build/type checks passed with zero UI errors/warnings. Complete backend/account suite: 551 passed; Studio/contract tests: 27 passed. Actual OAuth integration verified existing opaque tokens gain Calendar permissions after authenticated synchronization and retain their account identity; unit/handler tests cover ceilings, other users/accounts/resources, multi-resource/shared skips, expired/revoked/unknown-expiry records, live-session requirements, missing consent, duplicate scopes, idempotence, audit, transaction rollback, origin/confirmation denial and separating persisted settings from failed sync.

Browser checks: Overview layout/scenarios 26; direct task/navigation/form flow 31; requirements 143; account access 23; capability settings 28; recovery 18. Runtime skeleton and loaded card heights match in desktop/touch contexts, known field order matches, controls remain noninteractive placeholders, the heading is sealed and 44px high, and there is no task/review banner. Unknown account count/content wrapping remains a documented limit.

Inspected [desktop skeleton](assets/overview-runtime/skeleton-desktop.png), [mobile skeleton](assets/overview-runtime/skeleton-mobile.png), [capability skeleton](assets/overview-runtime/skeleton-capabilities-mobile.png), [loaded desktop](assets/overview-runtime/loaded-desktop.png), and [not-ready mobile Runtime](assets/overview-runtime/tailscale-not-ready-mobile.png). SSR injection assertions target real event attributes rather than rejecting safely escaped literal text in known module labels.

Private HTTPS 8464 browser readback confirmed header height, removed banner, Version/Folder/Status/Tailscale order and the offline simulation; [capture](assets/overview-runtime/tailscale-live-8464.png). The preview is left in simulated Tailscale not-ready state. Scenario links:
- https://mac-mini.duckbill-ionian.ts.net:8464/fixture/scenarios/tailscale-not-ready
- https://mac-mini.duckbill-ionian.ts.net:8464/fixture/scenarios/normal

These only change fictional fixture diagnostics; the real tailnet and other Serve mappings remain running. Real provider access, installed deployment and external client tool-list refresh are not acceptance claims. Shared/multi-resource or incomplete grants remain explicit exceptions instead of being silently broadened.

## Main integration and deployment candidate (2026-10-09)

The accepted UI is integrated with the current module UI context and Studio-owned
server. Requirements use module registrations and scoped provider services; feature
components do not regain ambient shell state. Existing registration-ceiling sync
remains in Account, with the explicitly authorized live-grant sync following
validated capability saves and owner connection refresh. Initial OAuth consent
remains explicit. Version 0.1.111 is the native deployment candidate; installation
and live verification are recorded separately after immutable-main delivery.

Integration self-checking passed the full checkpoint: 710 unit/archive tests and
13 built HTTP E2E tests, zero final Svelte errors/warnings, and 28 desktop/mobile
module-settings browser checks. No configured remote CI was observed.

## Native deployment verified (2026-10-09)

[PR #153](https://github.com/decompozr/icloud-plugin/pull/153) and the requirement
row alignment correction [PR #154](https://github.com/decompozr/icloud-plugin/pull/154)
are merged. Native 0.1.111 was built from clean remote-main commit
`6f727929173646bb3d793542d1b8dca4d9f397d7`. The platform archive SHA-256 is
`0ae585effe0507c21d0b849b584623b25a4f4f4b073add77a8964e88cc54fcd8`.

The actual packaged launcher passed installation/restart and OAuth persistence
checks (5 tests, 358 assertions). Installation used the existing update/service
commands after graceful shutdown and a consistent protected backup. Installed
payload bytes match the staged artifact, signed HomeKit payload is unchanged,
config/custody and prior protected database rows are preserved, and the new audit
table is empty at deployment. The managed service is running with its existing
login/restart settings. All 13 read-only doctor checks pass. HTTPS private admin
correctly redirects an unauthenticated browser to the owner passkey page, which
renders with no page errors. Existing owner sign-in and physical-device settings
acceptance remain unverified by this deployment check.

The production entry is `https://mac-mini.duckbill-ionian.ts.net:8443/icloud/admin`;
port 8464 remains the separate fictional preview. Native 0.1.110 and the stopped
state backup under the installation's `runtime/backups/pre-0.1.111-*` are retained
for recovery. No other service or Tailscale mapping was changed.
