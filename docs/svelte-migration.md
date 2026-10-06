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
