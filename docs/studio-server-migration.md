# Studio server and backend module migration

## Accepted outcome

Studio becomes the single server application: SvelteKit UI/Web routes, HTTP/MCP
ingress, composition and process lifecycle. No separate server app is introduced.
Feature ownership lives in `modules/account`, `mail`, `calendar`, `photos`
and `homekit`, each with separate backend and UI entry points. Feature-specific
Svelte components belong to their module; routes, shell and composition remain in
Studio. Shared visual controls and UI host contracts belong to `packages/ui`. Independently
executed native helpers remain apps. There is one installed service and one MCP
endpoint. Retire `apps/icloud` only when all consumers and packaging move.

The earlier [Svelte migration](svelte-migration.md) delivered the Web layer and
Fetch transport; it did not move the complete server into Studio. The remaining
gap is composition/lifecycle and backend source ownership, not missing UI.

## Constraints and acceptance

Preserve existing route URLs, public/private/local ingress isolation, owner/Passkey
identity, OAuth clients/grants, configured scopes, account IDs, SQLite schemas,
credential/session encryption and master-key custody. Accepted work must drain
before resource disposal; a disconnected caller must not cancel or retry an
accepted write. New source placement never grants a capability or Apple permission.
No real reset, provider write, native permission request or new connection is
needed for this migration. Retain compatible installed rollback and stopped-state
backup before each deployment. Remote-client/physical-device acceptance remains
separate from fixture, build, health and local asset readback.

Each phase must pass relevant source tests, built listener/integration checks,
artifact lifecycle and native upgrade/state readback; merge and deploy from clean
verified main. The owner tests each delivered phase. Advance only after `pass`; the owner explicitly
authorized the bundled-module UI revision after phase 1 delivery, so that bounded
revision proceeds now. Further backend phases still wait for owner acceptance.
The root task owner implements and self-checks; independent review is required
when security/lifecycle contracts change. Source-only extraction does not invent
new lifecycle behavior or a second module registry.

## Phases

| Phase | Gap and delivered slice | Exit gate |
| --- | --- | --- |
| 1 | Extract the account backend and its public service interfaces; reuse existing runtime contracts | Synthetic owner/Passkey/OAuth/revocation and custody/reopen tests, full build/tests/E2E, deployed preserved state; owner pass |
| 2 | Extract Mail, Calendar, Photos and HomeKit sequentially using existing module contracts | Tools, account isolation, scopes and disposal tests for each module; deployed read acceptance; owner pass |
| 3 | Studio assumes server/API/MCP composition, listeners and process lifecycle | Ingress/security, streaming, accepted-operation drain, startup/shutdown/restart; deployed owner/client acceptance; owner pass |
| 4 | Update release/install/doctor paths and remove the old app and transition adapters | Complete build/distribution/upgrade/rollback with no old app consumers; deployed final acceptance |

Later implementation details remain provisional; the agreed ownership and
observable acceptance do not. Existing `RuntimeModule`, scope/resource/tool and
invocation contracts are the source baseline for phase 2; move their ownership
with their consumers rather than creating a competing registry in phase 1.

## Phase 1 executable slice

Observed baseline: authentication factories and connection/grant logic are in the
old application's auth subtree; encrypted owner/account/session storage is in its
storage subtree. Authentication already returns handlers and receives caller-owned
SQLite, scope policy, owner lookup and credential-validation callbacks. UI rendering
adapters are separate but some backend types/helpers import admin/observability.

Move backend auth, local-owner custody and encrypted store into a server-only
account module; replace reverse imports with owned account contracts and pure
error helpers. Keep auth presentation/browser adapters in the existing application
until Studio composition moves. Existing application integration tests stay with
the application; standalone module tests follow their implementation. Expose a
public account facade. The host retains database/key provisioning and shutdown
ownership. Preserve all factory behavior and database identifiers.

Build the backend independently, consume its built facade from the transition
application and package its output into the same installed app. Reuse the existing
pinned Bun/dependencies; no global install, runtime or new persistent process.
Source dependencies, build output and artifacts remain distinguishable. Source
and fixture changes are verified before release; native trust checks are read-only.

No new prototype is required. Keep task evidence in ignored runtime storage until
verification/deployment outcomes are preserved here, then remove owned raw logs
and disposable build checkouts. Preserve the active checkout, standard releases,
protected stopped-state backups and concurrent work.

## Status

Phase 1 merged and deployed as 0.1.91; awaiting owner acceptance.
Phase 2 has not started. No owner pass for phase 1 yet.

### Phase 1 verification

- Full module/Studio/application/tooling runner: 561 tests, 5,041 assertions, zero
  failures. The extracted account suite contributes 39 tests / 358 assertions.
- Built HTTP/listener integration: 11 tests / 245 assertions passed.
- Packaged native lifecycle plus persisted synthetic OAuth scope upgrade:
  2 tests / 151 assertions passed. No new client registration or real provider
  write was used; these are fixture identities, not live owner acceptance.
- Account/application/Studio builds and typechecks pass; Svelte has zero errors
  or warnings. Account source has no app/UI reverse imports; changed docs resolve.
- Independent review identified a split-chunk facade path defect. Source-relative
  external imports were replaced with linking relative to each emitted file.
  Independent recheck verified all ten emitted references, built HTTP/application
  loading and shared OAuth mutation-queue identity; no remaining scoped blocker.
- The native helper code/build-input manifest matches the retained signed 0.1.90
  payload. Artifact staging performs signature/fingerprint preflight and reuses
  that exact bundle; this migration does not request native permissions or rebuild
  the helper. Deployment readback is recorded after the clean-main upgrade.

The review finding confirms why source build success is not installed-runtime
acceptance. The original failed built import/E2E attempt is superseded by the
corrected built integration and packaged lifecycle checks, not silently counted
as a passing run.

### Phase 1 deployment readback

PR #115 merged the implementation. Version 0.1.91 was built from clean remote
main `b4dde100df1ad53b2c0f60cba2b515c9b44284f6`, which was verified as the tip
immediately before release and installation. Frozen dependencies, final builds
and packaged lifecycle/OAuth-upgrade checks (2 / 151 assertions) passed again.
The native bundle retains the signed 0.1.90 fingerprint; artifact staging verified
its signature and source identity. No helper or permission migration was required.

The supported updater installed the exact artifact without initialization after
graceful shutdown and a protected stopped-state backup. Installed payload hashes
match. Configuration/custody bytes, account and owner records, Passkeys, grants,
capability settings and other non-transient database rows are unchanged; SQLite
integrity checks pass. The existing OAuth resource timestamp refresh and rate-limit
diagnostics are excluded from that comparison. Version 0.1.90, its canonical
archive and the protected pre-0.1.91 stopped backup remain for rollback. A private
upgrade receipt in that backup records payload/state/health checks.

Local and private sign-in return 200; private CSS matches the installed output and
retains no-store, no-referrer and CSP. All 13 read-only doctor checks pass from this
Mac. The existing main MCP connection's profile and actual mailbox listing succeed
(9 mailboxes). No new client registration, consent/grant or provider write was
introduced. This read verifies the existing Mail client path, not all module tools,
a fresh physical Passkey ceremony or off-tailnet acceptance.

Owner gate remains pending: verify normal owner login, account display and existing
client access in the delivered installation, then report pass. Phase 2 is not
started until that report. Studio becoming the complete server and removal of the
old app remain planned later phases; this release only extracts account backend
ownership and its build/distribution interface.

## Bundled module UI revision

Accepted on 2026-10-07: Studio composes **bundled** modules, not only enabled
modules. A disabled bundled module must retain its settings/requirements UI;
enabled policy controls backend operations/scopes, not whether a UI component
exists in the distribution. This is a static trusted bundle, not arbitrary plugin
loading or a new permission mechanism.

Gap: feature components currently import the entire Studio AdminModel, shared
controls and credential/toast controller classes through host paths. That makes
module-owned UI a folder rename rather than an independent interface.

This revision moves account cards/credential/login UI and HomeKit/Photos setup
panels to module UI entry points; Mail/Calendar own credential requirement panels.
Shared pinned controls, project adapters and explicit UI context contracts move to
one shared UI package. Studio keeps routes, navigation/layout, generic module
policy modal and composition registry. Modules receive narrow account view/edit
ports instead of the global AdminModel; account dialog state belongs to account UI.
No UI entry may import account backend, credential stores, native clients or an
application source module. All Svelte consumers use one pinned runtime instance.

Acceptance: builds/typechecks for every UI owner, source/client-bundle boundary
checks, disabled module settings, credential clearing, shared navigation/modal/toast
browser checks, full tests, packaged lifecycle and deployed state/asset/read checks.
Visual controls remain byte-identical to the pinned catalog; no layout redesign or
new native permission/provider write. Known Apple web-session availability and
HomeKit/app-password coupling are separate requirement corrections, not silently
changed by this extraction. Remaining backend/module/server phases stay explicit.

### Bundled UI verification

Account UI now receives explicit card data/actions and narrow compatibility edit
ports. Mail/Calendar own their app-password prerequisite panels; HomeKit/Photos
own native requirements and field descriptions. Studio's trusted registry composes
all four bundled feature panels regardless of saved enabled policy. The generic
settings shell no longer selects Photos/HomeKit implementation or field hints.
Universal wire schemas are built independently; browser code does not traverse
the account server facade. Pinned visual catalog source is byte-identical.

Verification: 563 formal tests / 5,028 assertions, 11 built HTTP E2E tests / 245
assertions, packaged lifecycle/OAuth upgrade 2 / 151, and seven UI owner typechecks
with zero Svelte diagnostics. Browser checks pass: 58 persistent-shell checks,
142 requirement/credential/locale/consent checks, four disabled bundled panels,
late Photos-to-Home readiness rejection and 13 compiled client files without
backend/SQLite/crypto code. Desktop/mobile fixture screenshots were captured;
the desktop overview was visually inspected. Physical devices remain untested.

Independent review found callback retargeting and non-portable declaration paths.
The keyed requirements mount now captures a stable callback and ignores reports
after destruction; the delayed-response browser regression passes. Public
declarations embed their universal contracts and retain compiled branding types;
all 17 public files resolve within compiled outputs. Independent recheck passed
7 SSR tests / 360 assertions and inspected all 13 client files, with no remaining
scoped blocker. Legacy browser fixtures were updated for current account cards,
Apple Home, switch role/visible label interaction, compact labels and left rail;
persistent fixture notifications are explicitly dismissed between interactions.

Version 0.1.93 is merged and deployed; owner acceptance is pending.
The requested Flow runtime migration is complete in the active checkout: ignored
`.decompozr/flow/run/` replaces the legacy directory after writers stopped; byte
preservation was checked before compact-record path reconciliation. Installed
service state/key custody and other checkouts were not moved.

### Bundled UI deployment readback

PR #120 is merged. Release 0.1.93 was built from clean remote main
`136a85019f2763eafaed8febffbbe21aaec82a98`, verified as the tip immediately before
release/install. All frozen installs and final UI/account/application checks pass;
final packaged lifecycle/OAuth upgrade passes again (2 tests / 151 assertions).
The unchanged signed 0.1.92 helper is reused after source/signature preflight.

The supported updater ran after graceful shutdown and a protected stopped-state
backup. Installed payload hashes match; config/custody bytes, protected non-transient
SQLite rows and integrity match the backup. Existing startup OAuth-resource and
rate-limit timestamps are excluded. This is upgrade-time preservation; subsequent
authorized client activity is separate. Prior release 0.1.92 and its archive remain
for rollback. The protected pre-0.1.93 backup contains the private upgrade receipt.

Local/private sign-in returns 200, two private CSS assets match, CSP/no-store/
no-referrer remain, and all 13 installed client files exclude backend code markers.
All 13 read-only doctor checks pass from this Mac. The existing main MCP profile
and actual 9-mailbox listing succeed without new registration, consent or provider
write. This establishes the existing Mail path, not all module/provider tools or
a physical owner Passkey/device walkthrough.

The owner tests delivered account/login, bundled settings and normal client access
then reports pass. Further backend extraction and Studio's final server ownership
remain planned phases. Known Apple web-session availability and HomeKit's credential
coupling remain explicitly deferred requirement corrections; this UI extraction
did not claim to enable those backend paths.

## Installed, independently versioned module packages

Accepted after bundled UI delivery: each feature has one package and independent
SemVer release identity, with explicit server/UI subpath exports. Studio installs
packages through declared dependencies rather than repository-relative imports.
Modules ship in one service; publishing a module does not upgrade the running
installation. Studio's dependency lock, verification and service release remain
the activation boundary.

The local executable slice introduces Bun workspaces, module/package versions,
public exports and installable tarballs. Account exports its existing backend and
UI; Mail/Calendar/Photos/HomeKit currently export UI only until their backend
extraction phases. Shared UI/universal contracts are versioned packages too.
Packed metadata resolves workspace dependencies to exact versions, excludes tests/
state/secrets and records checksums. Verify isolated consumer installation, package
exports, Svelte composition, client/server boundaries and native artifact upgrade.

No new runtime or global installer. Preserve provider/state/scope/native behavior.
Registry publication awaits an explicitly selected private destination and access;
no public npm publish is authorized. Local package artifacts and installed service
are deliverable independently of that missing destination. Remaining source/server
migration phases and owner acceptance still remain visible.

### Versioned package checkpoint

Seven package identities start at 0.1.0 independently of service 0.1.98. Public
imports use package exports; account backend is installed once and the temporary
built-test facade forwards to that same instance. Standalone consumers install
exact local TGZs, not source-folder links. Workspace ranges become exact packed
dependencies, with license/notices, checksums and filtered contents. Private flags
remain until an explicitly selected private registry is configured; no registry
publish has run. Other feature server exports remain deferred, not fabricated.

Self-checking: 583 tests / 5,136 assertions, built HTTP E2E 13 / 258, package
consumer test 1 / 9 outside the repo, 58 persistent-shell browser checks, four
disabled-module/race checks and 13 client files without backend code. Candidate
packaged lifecycle/OAuth upgrade passes (2 / 151). The initial successful staged
install omitted a lockfile; independent review caught it before release. Consumer
installation now runs in an isolated temporary directory, explicitly generates
and validates its own lock, and performs frozen production installation. All seven
module packages are installed, not merely copied as tarballs. A nested SDK metadata
resolution returned no version; the generator now requires exact authored versions
instead of silently deleting that dependency. Existing SDK versions are preserved.

Fresh-checkout/root-lock verification, clean-main release/install and live readback
remain pending. Registry selection/publication and owner acceptance remain separate
from local package delivery.

Fresh-checkout verification caught an absolute-path filtering defect: a build
checkout beneath the canonical Flow runtime was itself classified as excluded
state, leaving package exports missing. Filters now inspect paths relative to the
package owner, and the isolated consumer probe loads every real export in a fresh
process. The corrected test passes from the fresh checkout without source fallbacks.
