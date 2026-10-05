# Private owner administration

The locally prepared administration flow has five destinations. The supported
release workflow remains one iCloud account and one custom MCP connection.

| Destination | Private path | Purpose |
| --- | --- | --- |
| Overview | `/` (legacy `/icloud/admin` alias) | Account, client and observation summaries; one next action |
| Accounts | `/icloud/admin/accounts` | Credentials and installation-wide Mail/Calendar capability policy |
| Client connections | `/icloud/admin/connections` | Registration scope ceiling, selected account/client authorization and successful read evidence |
| System & diagnostics | `/icloud/admin/system` | On-demand Tailscale prerequisites, exact Serve/Funnel mappings, versions, process and supervision |
| Setup wizard | `/icloud/setup` | Resume completed prerequisites/owner/account steps; `?mode=account` adds a credential without changing a client grant |

The enrolled private root redirects to `/icloud/admin`, where owner cookies
retain their `/icloud` path scope. All enrolled HTML destinations require an owner session. Missing sessions redirect
to the fixed private sign-in page; other owners are denied. Unenrolled private root
redirects to initial setup. Anonymous setup status retains its existing prerequisite
and enrollment fields, without accounts or credentials. Public listeners do not
expose any of these destinations or their APIs.

Credentials are never prefilled or stored in browser storage. Navigation with a
credential or policy draft asks whether to discard it; cancel retains the draft.
Policy elevation retains explicit confirmation. The new owner-only account add
endpoint rejects saved and revoked duplicates before and after provider validation.
Restoring a revoked credential uses existing generation-guarded maintenance.

Saved policy, stored credentials, registration scopes, authenticated read permission,
and successful provider reads remain distinct. In-memory read evidence expires and
is invalidated by account/client/policy changes when fetched. Browser snapshots
older than one minute stop presenting cached read evidence and request a refresh.
Calendar list evidence alone does not establish event reading. No page silently
runs provider reads, changes permissions or reconnects a client.

System checks run when requested by opening Overview/System or pressing refresh.
Commands are fixed, time bounded and limited to 64 KiB; optional Tailscale snapshots
are bounded and timestamp checked. Only configured origin/path mappings leave the
collector. Funnel configuration is not external reachability. A running process is
not proof of supervision; supervision is verified only when the running LaunchAgent
PID matches this process. Version labels distinguish built source metadata from
matching artifact metadata. This view has no raw logs; logs remain explicitly
unavailable. No live monitoring is installed.

## Private root routing preparation

The current private Serve rule mounts `/icloud` on port 8443. A new application
`/` route alone cannot change that. After separate deployment/routing authorization,
inspect and preserve the existing Serve configuration, then add **only the private
8443 root** mapping to `http://127.0.0.1:4101/`. The scoped proposed command is:

```sh
tailscale serve --bg --https=8443 --set-path=/ http://127.0.0.1:4101/
```

This is a proposed native rule for the observed Mac mini configuration, not an
executed action. Verify port/origin/backend against the reviewed deployment config
first. Keep the existing `/icloud` rule and other services intact. Port 8443 must
remain private, without Funnel. Public 443 must retain only `/icloud` and the two
exact OAuth discovery mounts. Never add a public root catchall. Rollback removes
only the new private root handler after inspecting the effective configuration;
never use a global Serve reset. Neither this rule nor deployment/restart is
performed by the UI or this preparation task.

## Fixture browser verification

`apps/e2e/browser/admin-flow.ts` is optional headless QA against a temporary server,
disposable SQLite owner state and dummy credentials/provider validation. It requires
explicit paths to an **already-installed** Playwright module and Chrome executable,
plus an output directory; it does not install dependencies or use an active browser.

```sh
bun apps/e2e/browser/admin-flow.ts \
  --playwright-module /absolute/path/to/playwright/index.mjs \
  --chrome '/absolute/path/to/Google Chrome' \
  --output /absolute/path/to/qa-output
```

The QA covers five destinations, navigation/back/refresh, policy save/discard/cancel,
provider error display, account-only save, interrupted setup, secret clearing,
keyboard skip navigation, mobile overflow, Traditional Chinese and anonymous
protection. Six screenshots and a JSON check count are produced. Provider behavior,
real Passkeys, live Tailscale routing and external client acceptance remain separate.

## Prepared candidate verification

Final local checks on October 4, 2026 passed:

- Application typecheck, build and **293 tests / 1,872 assertions**.
- Tooling typecheck and **10 tests / 134 assertions**.
- Built E2E typecheck and **11 tests / 259 assertions**.
- Isolated Chrome headless fixture: **51 checks**, six desktop/mobile screenshots.
- Fresh disposable artifact lifecycle: **1 test / 26 assertions**, including fixture
  initialization, custody-preserving restart and shutdown.
- Independent read-only security and implementation reviews: no remaining concrete
  blocker after correcting revoked-only setup resume and modified-link draft handling.
- Whitespace/diff check passed.

These are automated synthetic-provider and fixture checks, not live provider or
real browser Passkey acceptance. Headless fixtures mutate only disposable dummy
accounts. The optional browser workflow uses existing local dependencies without
adding a Playwright dependency to the production package.

Read-only final observation retained the live `releases/0.1.26-darwin-arm64`
selection and the original PID 34332 listening on 4100/4101. This preparation did not
restart, deploy, publish, merge, change Serve/Funnel, install supervision, reconnect,
or mutate live accounts, credentials or provider content. A user-reported connector
reinstallation at 22:38 UTC means previous connection grant/refresh lineage must not
be treated as evidence for that new connection.

Remaining gates are a new distinct release version, explicit artifact installation
and service restart approval, explicit private-root routing approval, and live
single-account acceptance on the selected candidate/new client. No multi-account,
invitations/sharing, recurrence/time zones, provider conflict rejection, uncertain
write recovery or indefinite refresh claim is made. Raw logs, automatic supervision
installation and continuous monitoring remain outside this UI preparation.
