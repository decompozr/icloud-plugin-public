# Svelte / SvelteKit migration

The destination is `apps/studio`. Preserve one installed service and the existing
public/private listener boundary while migrating the Web layer. Mail, Calendar,
Photos, storage and native helpers remain independent TypeScript/native modules.
Each phase is implemented, verified and deployed to the existing native installation.
Advance only after the owner reports `pass` for the deployed phase.

## Phase 1: component presentation

Replace whole-page HTML templates with Svelte components for admin/setup, owner
login, account selection, OAuth consent, shared copy/icons and Photos setup. Bundle
the renderer and browser assets into the existing runtime and preserve same-origin
API calls. Keep existing browser workflows as compatibility adapters for this first
rollout; this phase is server-rendered Svelte, without hydration or SvelteKit routing.
No database schema, permission policy or public/private transport changes are needed.

Acceptance: all five admin destinations, transient credential clearing, policy
save/discard/confirmation, account choice, explicit consent, owner protection,
English/Traditional Chinese, keyboard navigation and mobile overflow retain their
behavior. Automated fixtures establish synthetic behavior; the owner checks real
Passkey login and the existing installation's pages before advancing.

## Phase 2: SvelteKit Web application

Add SvelteKit routing and reactive browser state to Studio. Move admin API and
OAuth HTTP entry points incrementally, using existing authentication and service
functions. Remove compatibility controllers as their flows gain Svelte ownership.
Keep a trusted outer listener dispatcher: public ingress must not mount private
pages or APIs, irrespective of forwarded headers, path aliases or login status.

Acceptance: route/security regressions, real Passkey and same-client OAuth
continuation, cookie/origin behavior, credential clearing, stale diagnostics and
policy confirmation; build/install/restart on the existing Bun runtime. Select and
verify the deployment adapter before committing to the runtime integration.

## Phase 3: MCP and lifecycle integration

Migrate MCP HTTP transport only after checking SDK/runtime compatibility. Preserve
host/origin checks, token scopes, error/status/header contracts, body limits and
request tracking. Keep startup/teardown in an explicit composition root with shared
runtime/database ownership. Remove Express after all ingress contracts are covered.

Acceptance: authenticated MCP discovery/read, anonymous and private-path rejection,
client disconnect behavior, delayed-operation draining and restart/state preservation.
Use provider reads for live acceptance; synthetic checks alone do not establish
provider access or remote-client tool discovery. An accepted write must not be
cancelled or silently retried because its HTTP client disconnects.

## Verification and deployment

The first-phase candidate is version 0.1.59. Verified before deployment: Studio
component checking with zero diagnostics, 5 renderer tests / 53 assertions,
426 application tests / 2,903 assertions, 11 tooling tests / 141 assertions,
11 built E2E tests / 259 assertions and 85 isolated Chrome fixture checks.
These are self-checks, not independent review or live owner acceptance.
A disposable native artifact also passed 1 lifecycle test / 26 assertions,
including initialization, restart, custody preservation and shutdown. Deployment
is recorded separately after verification. Retain the previous installed release and a protected stopped-state
backup for recovery. No automatic second-phase activation precedes owner acceptance.

## Phase 1 deployed; owner acceptance pending

Native 0.1.59 was built from clean remote main commit
`03ae50d7350e52cfb0e4229126e3ce9b19410a4a` and installed on October 6, 2026.
The source was the remote main tip immediately before installation. PR #63 is
merged. Subsequent main changes at the deployment checkpoint were documentation
only; the installed application payload retains its recorded source identity.

The existing installation selects `releases/0.1.59-darwin-arm64`. The native
installer performed the update without initialization. Installed payload hashes
match the tested artifact. The final main-built artifact passed the disposable
lifecycle test (1 test / 26 assertions). A retained archive is at the primary
checkout's `releases/icloud-plugin-0.1.59-darwin-arm64.tar.gz`.

Live self-checks passed: 13 read-only doctor checks and 18 page/asset/ingress checks
across localhost, private Tailscale and public origins. Sign-in HTML is rendered
by Svelte; browser asset hashes match the installed payload. Anonymous private
admin requests redirect to sign-in with 303. Public admin/setup paths and the
private admin browser asset return 404. These checks establish reachability from
this Mac, not an independent external client or authenticated owner walkthrough.

Configuration/custody bytes and permissions match the stopped backup. Both
SQLite integrity checks pass. Owner/account, Passkey and grant records are
preserved. The only observed database differences are existing transient timestamps:
OAuth resource seed merge refreshes `updatedAt` at startup, and read-only checks
refresh the rate limiter's `lastRequest`. No private metadata was manually patched.

The protected stopped backup and finalized receipt are under the existing
installation's `runtime/backups/pre-0.1.59-20261006T130805Z/`. Version 0.1.58 remains
installed for rollback. Do not initialize or delete custody during recovery;
stop the verified owned process before restoring a compatible stopped snapshot
and selecting the prior release. No rollback was required.

Owner testing uses `http://localhost:4102/icloud/admin` or the existing private
Tailscale admin URL on port 8443. Check real Passkey login, all five destinations,
English/Traditional Chinese, mobile layout and normal account/policy interactions.
Phase two remains unstarted until the owner reports `pass` for this deployment.
