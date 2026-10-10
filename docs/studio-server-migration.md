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
The owner selected local package artifacts and existing Git remote source/version
management for this stage. Registry selection/publication is out of scope, not a
delivery blocker. Keep package private flags and do not publish to public npm.
The canonical local service archive includes all installed versioned package TGZs;
Git preserves source and version metadata. No hosted binary upload is claimed. Remaining source/server
migration phases and owner acceptance still remain visible.

### Versioned package checkpoint

Seven package identities start at 0.1.0 independently of service 0.1.98. Public
imports use package exports; account backend is installed once and the temporary
built-test facade forwards to that same instance. Standalone consumers install
exact local TGZs, not source-folder links. Workspace ranges become exact packed
dependencies, with license/notices, checksums and filtered contents. Private flags
remain for local/Git delivery; registry publication is not required. Other feature server exports remain deferred, not fabricated.

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

Fresh-checkout root frozen install, complete build and all 583 tests / 5,136
assertions pass after the package-relative filtering fix. Clean-main release/install
and live readback remain pending. Registry publication is out of scope; owner acceptance remains separate
from local package delivery.

Fresh-checkout verification caught an absolute-path filtering defect: a build
checkout beneath the canonical Flow runtime was itself classified as excluded
state, leaving package exports missing. Filters now inspect paths relative to the
package owner, and the isolated consumer probe loads every real export in a fresh
process. The corrected test passes from the fresh checkout without source fallbacks.

### Installed package delivery

PR #130 merged the package revision. Service 0.1.98 was built from clean remote
main `99a39afa4fd4f52316ee7a3f91b9bd473b37314f`, verified as the tip immediately
before release/install. Final root frozen install, UI/account/app build and
packaged lifecycle/OAuth checks (2 / 151) pass. The source and signed 0.1.97 native
helper fingerprint match, so the same bundle is reused without native permission
changes. Seven independently versioned 0.1.0 packages are actually installed in
the release's application node_modules. Exact TGZ checksums, installed versions
and standalone consumer lock are verified, and recorded in the protected upgrade
receipt. Nothing was uploaded to a registry.

The supported updater ran after graceful drain and a protected stopped-state
backup. Installed payload matches the tested artifact. Configuration, key custody,
protected non-transient SQLite rows and integrity are preserved; expected resource
seed/rate-limit timestamps are excluded. Prior service 0.1.97, its archive and
pre-0.1.98 backup remain for recovery. Later authorized client activity is separate
from upgrade-time preservation.

Local/private sign-in returns 200, two CSS assets match, 13 installed client files
exclude backend markers, and 13 doctor checks pass from this Mac. Existing main
MCP profile and actual 9-mailbox read succeed without new registration/consent or
provider writes. Physical owner/device walkthrough remains pending. The owner accepted local
package installation and existing Git remote source/version delivery without a
registry. No registry or hosted binary publication is claimed. Owner pass still gates the next backend
extraction phase.

### Accepted delivery scope

The owner confirmed that a registry is not needed for now. Local workspaces and
installed versioned TGZs, the canonical service release archive, and existing Git
remote source/version history satisfy this package-delivery phase. Registry work
is removed from pending requirements. Package versions remain independent; future
module changes still require dependency verification and a service upgrade before
activation. Owner pass continues to gate the next backend/server migration phase.

### Release-first module runtime direction

The owner clarified the durable delivery model: assemble local module bundles and
ship one complete service release, including future iterations. Independent module
versions are composition/compatibility identities; they do not require a registry
or separate deployed services. The current install upgrades the complete release.

Dynamic module upgrade is a later stage after backend extraction and Studio server
ownership. Studio/runtime becomes the thin MCP/control-plane shell: listeners,
authentication/authorization enforcement, route/UI composition and module lifecycle
hosting. Module packages own feature logic, tools, requirements and UI. No feature
implementation should be pulled back into the shell for convenience.

Later dynamic upgrades must explicitly design compatibility validation, blocking
new work, draining accepted operations, resource disposal, atomic activation and
rollback. Owner identity/key custody, grants and OS permissions remain independent
of code replacement. This direction does not claim hot upgrade is implemented now,
select an update distribution transport or authorize unattended activation.

## Module declaration ownership correction

Each module declares and exports its own public data/API contracts. The account
wire schema moves to `@decompozr/account/contracts`, a browser-safe subpath separate
from its backend entry. No feature depends on a central package containing other
features' declarations or readiness/business decisions.

Current connection/read-evidence interpretation belongs to Studio composition,
not a generic contracts package; the transitional server consumes its compiled
host helper. Existing module/runtime registration and lifecycle interfaces remain
in their current host until the shell migration, without introducing another
central framework. Remove the superseded contracts package and its dependencies.
Validate client purity, module isolation, packed consumer install, host/server
build, OAuth/custody/lifecycle preservation and deployed readback.

UI remains a three-layer decision: the pinned design-system owns visual primitives;
shared project UI owns composite adapters; feature modules own domain UI. The local
design-system checkout has a library export but still declares private 0.0.0, so
this correction does not replace pinned vendor controls with an unversioned live
checkout. A later independently versioned design-system package can replace those
pinned copies while retaining the thin UI adapter package. No visual redesign.

### Shell provider and extension UI boundary

The owner clarified two supported mechanisms: a module ships and owns its complete
UI (component/state/interactions) and the shell mounts its contribution, or the
module invokes shell-owned standard UI through `ctx` services. Modules never
import shell component implementations or the global shell model. A module may
use a versioned design-system dependency for its own UI without knowing the shell's
component catalog. The current directly shared project UI package is transitional;
its shell services/adapters must move behind `ctx` in the subsequent UI boundary
slice. This contract cleanup does not claim that provider/contribution mechanism
has been fully implemented.

### Current feature UI audit

No module currently declares a navbar/standalone page registration. Account owns
full authentication page components, but Studio hardcodes their route mounting.
Mail and Calendar each have only a wrapper around the account app-password
requirement; these should become declarative requirements with no feature renderer.
Photos exposes library/authorization status, open-library/privacy actions and
recheck controls: generic requirements become declarations, while any special
permission interaction may use an optional modal section. HomeKit exposes account/
Home selection, explicit linking, binding list and unlink; linking is a legitimate
custom section (or optional standalone page). Account exposes cards, app-password
modal, Passkey/OAuth pages and the parked web-session form; other modules should
request account operations through ctx, not import those component implementations.

The next UI slice uses module-owned declarations for scopes, capabilities, generic
requirements and settings. Shell renders those standardized controls consistently.
Optional module renderers are limited to registered navbar pages, standalone pages
and custom configuration sections. Shell injects ctx on mount; global actions and
shared dialogs/notifications/account operations are provider functions. A module
is not required to own a Svelte wrapper for every configuration item. Current
wrappers/direct shared adapters are transitional, not the accepted final interface.

Contract correction verification: 583 tests / 5,136 assertions, E2E 13 / 258 and
packaged lifecycle/OAuth 2 / 151 pass. Independent review confirms unchanged owner
schemas, isolated browser contracts and 13 clean client files. A host declaration
initially referenced an unshipped Studio directory; emitted declarations are now
embedded at the artifact-local admin path and independent recheck is clear.

### Owned contract delivery

PR #133 is merged and service 0.1.99 was built from clean remote main
`f8314f75d54c10687ba37078e9150d6282e5e21b`, verified as the tip before release/install.
Final frozen build, all UI type checks and artifact lifecycle/OAuth checks (2 / 151)
pass. Account/Mail/Calendar package versions are 0.1.1; account declares its own
browser-pure contracts, and the central package is absent. Other package versions
remain unchanged. The native helper bundle is unchanged and staging verifies it.

After graceful drain and protected stopped-state backup, the supported updater
installed the exact payload without initialization. Config/custody bytes, protected
non-transient database rows and integrity are preserved; expected resource/rate-limit
timestamps are excluded. Prior release 0.1.98 and the pre-0.1.99 backup remain for
rollback. A private upgrade receipt records these checks. Sign-in returns 200,
13 client files exclude backend markers, and 13 doctor checks pass from this Mac.
The existing main MCP reads 9 mailboxes without new registration/consent or writes.
These checks do not establish physical owner/device acceptance.

The feature UI audit and revised ctx/registration boundary are accepted direction,
not an implemented new renderer protocol. Mail/Calendar wrappers, self-owned page
contributions, standard declarative popup fields and Home linking ctx integration
remain the next UI boundary slice.

## Declarative extension UI and injected provider implementation

This slice replaces mandatory UI wrappers with module requirements declarations.
Shell owns common app-password rendering. Optional custom configuration sections
receive a mount-scoped ctx with translation, notifications, account operations,
readiness reporting and explicitly declared API operations. No module imports a
shell model/controller to perform global actions. Ordinary visual primitives stay
pinned; native/provider policy and permissions do not change.

Optional module pages register metadata/renderer through the same UI contribution
interface, with safe unique paths under the private admin module namespace. Navbar
participation is optional. No empty feature page is invented just to exercise the
API. Tests use synthetic contributions to validate registration and mounting.

Acceptance: Mail/Calendar have no requirement Svelte wrapper; Home/Photos custom
sections use injected ctx rather than shell copy/toast/dialog internals; unknown
API operations and expired mounts fail closed; late responses cannot target new
dialogs; registrations validate identity/paths/conflicts; full build/tests, compiled
consumer/client purity, private ingress and deployment/state preservation pass.

### Declarative ctx implementation checkpoint

Mail/Calendar no longer ship requirement components or depend on account UI; their
requirement arrays are rendered by shell. Home/Photos expose optional custom
sections receiving a lease-scoped ctx; API operations are declared and namespace
validated, account/global notification/confirmation services are injected.
Optional page metadata/renderer registration validates unique safe private paths;
navbar participation is optional. Host route gating recognizes only registered
pages and retains owner checks; default feature bundles deliberately add no empty
product pages. Back/cancel recovery retains exact modulePath, including standalone
non-navbar contributions. Existing auth UI remains a dedicated account provider
route rather than a fabricated feature page. Further thin-shell/server extraction
remains phased.

589 tests / 5,185 assertions, E2E 13 / 258, packaged lifecycle/OAuth 2 / 151 pass.
Browser fixtures pass 58 shell and 142 requirements/credential/locale/consent checks,
four disabled bundled panels, late-response fencing and 13 clean client files.
Mobile credential modal screenshot was visually inspected. No real provider/native
action or physical device acceptance was performed. Independent review found and
verified early page allowlist, inherited operation lookup and module-page URL
restoration fixes: anonymous303/foreign403/owner200/unknown404, ctx3/19 and public
ingress/client purity pass. No remaining scoped blocker. Service candidate0.1.101
and affected package0.2.0 versions were delivered as described below.

### Declarative ctx deployment (0.1.101)

PR136 merged at `32f01a89fef477014ec7d6f4c6a97710d7573a35`. Release 0.1.101
was built from a clean detached checkout of that remote main, using frozen workspace
and standalone consumer locks and all six local package artifacts at 0.2.0. The
existing signed HomeKit Release helper remains unchanged; staging verified its
signature, team, protocol and source pin without launching it or requesting native
permissions. No registry publication or dynamic module loading was added.

Post-integration checks: 589 tests / 5,185 assertions, E2E13/258 and final packaged
lifecycle/OAuth2/151 pass. Browser fixtures pass 58 shell and 142 requirements checks,
four disabled module panels, late-response fencing and 13 clean client files.
Independent security review additionally passed 8 synthetic tests / 239 assertions
at the integrated source, with no remaining scoped blocker. No remote CI checks
are configured for PR136; local and independent checks are the recorded evidence.

After graceful drain and protected stopped-state backup, the supported updater
installed the exact payload without initialization. Configuration/custody bytes,
all non-transient SQLite rows and database integrity are preserved. Only resource
and rate-limit diagnostic tables are excluded from that row comparison. Local
sign-in uses the configured `localhost` host and returns200; the private Tailscale
sign-in returns200 with security headers and byte-identical client CSS. All 13
read-only doctor checks pass. Existing main MCP profile and nine mailboxes read
successfully after deployment. No provider write, reset or permission request was
performed; physical device, real Passkey and owner UI acceptance remain pending.

The canonical release archive and installed0.1.100/0.1.101 remain for rollback.
The protected receipt is in
`runtime/backups/pre-0.1.101-20261008T155636Z/upgrade-receipt.json`. Task-owned
build/install/browser/test scratch is removed after this record is committed;
the active checkout, runtime checkpoint and unrelated records remain. This UI
boundary slice is delivered; full backend/server extraction remains phased and
awaits owner pass before the next slice.

## Phase 2 Mail backend extraction execution contract

Owner accepted the declarative UI delivery and explicitly requested the next Mail
slice. Existing module packages are retained; this moves the backend currently in
`apps/icloud/src/mail` into the existing `modules/mail` package, not a new registry.

1. Move Mail domain, services, provider adapters, storage, tool/scope declarations
   and configuration into its server entry; independently build and install it.
2. Inject verified invocation lookup and operation monitoring as narrow dependency
   ports. Mail declares its registration; the existing host owns the shared runtime,
   AsyncLocalStorage, ingress, UI presentation and process lifecycle. Do not copy
   the runtime implementation or import shell source into the package.
3. Retain only transitional host composition/presentation adapters, update their
   consumers to public package exports and move pure tests with their backend.
4. Verify account isolation/revocation, tool scopes, unknown outbound outcomes and
   drain/disposal, built outside-repo consumption, full application tests/E2E and
   unchanged client boundary. Obtain independent security review.
5. Merge, build from clean remote main, release and deploy to the established native
   prefix with graceful drain, protected backup and exact payload/data checks;
   verify doctor, private UI and existing MCP profile/mailboxes reads. No provider
   write, new permission request or automation mutation is part of this slice.

Acceptance is installed Mail module ownership with unchanged names, persisted
policies/replay history and authorization behavior. Keep the currently installed
HomeKit signed helper and automation setup intact. Owner pass gates Calendar,
then Photos/HomeKit extraction and final Studio server composition/removal of the
old application. Version allocation is provisional until release reconciliation.

### Mail backend source verification checkpoint

Mail0.3.0 now builds its domain, services, IMAP/SMTP/unsubscribe adapters, policy,
replay ledger, scope/tool declarations and factory independently. Its public server
entry is separate from UI. Only declaration ports describe the injected verified
invocation lookup and monitor; no host runtime/AsyncLocalStorage implementation
is copied or reverse-imported. The transitional host supplies the original lookup,
presentation and HTTP/MCP fixture composition. Existing account, tool, scope,
provider endpoint and table/ledger semantics are unchanged.

590 tests / 5,197 assertions and built E2E13/258 pass. An outside-repository install
loads all six exact local bundles plus Mail backend/provider exports, verifies
resolution inside the consumer and typechecks actual API usage. Public nodemailer
declaration types ship as an exact dependency. Source/workers/tests are excluded
from package backend output. Independent review passed46/157 on account isolation,
revocation, scopes, unknown/replay outcomes, wire behavior and drain/disposal;20
Mail declaration files resolve inside the package and13 client files have no
backend markers. No remaining scoped blocker. Service0.1.107 was delivered below.

### Mail backend deployment (0.1.107)

PR145 merged at `f6a53432f934546e5ace07ef0557a87c829df252`. Release0.1.107
was built from a clean detached checkout of that remote main with frozen workspace
and standalone consumer locks. Six exact local bundles ship together; Mail0.3.0
contains the backend and UI entries. Installed host output contains no old Mail
service implementation. No registry or dynamic module loading was introduced.

Final packaged checks passed18 tests, including runtime restart/OAuth persistence
and module-owned draft/attachment/replay fixtures (151 Bun expect calls; Node assert
checks also run in the Mail fixtures). Native staging verified the existing0.1.106
Release signature/team/protocol/source pin without building or launching a helper.
HomeKit payload bytes are identical and its ledger files are preserved; no Home
scene, thermostat, automation, policy or permission was mutated by this slice.

The supported updater ran after graceful drain and a protected stopped-state
backup. All installed payload file/symlink hashes/modes match the artifact;
configuration/custody bytes, non-transient SQLite rows and integrity are preserved.
Resource/rate-limit diagnostic tables alone are excluded from row comparison.
Local/private sign-in return200; private CSS matches installed bytes, security
headers remain,13 client files contain no backend markers, and all13 doctor checks
pass. Existing main MCP profile and nine mailboxes read successfully through the
installed Mail package. No real mail send/edit/delete or new consent was performed.

The immutable canonical archive and installed0.1.106/0.1.107 remain for rollback.
The protected upgrade receipt is
`runtime/backups/pre-0.1.107-20261008T211824Z/upgrade-receipt.json`. Task-owned
scratch/build checkout will be removed after committed preservation; active
checkout, checkpoint and unrelated records remain. Independent source checks are
recorded above; PR145 has no configured remote CI. Physical-device/real Passkey
acceptance is not claimed. Mail is deployed awaiting owner pass; Calendar is next,
then Photos/HomeKit backend ownership and final Studio server composition.

## Phase 2 Calendar backend extraction execution contract

Owner passed the deployed Mail slice and requested continuation. Move the existing
Calendar domain/codec, CalDAV gateway, services, encrypted ledger, tool/scopes and
capability declarations into the existing Calendar package. Keep its UI entry
separate. The host injects the original verified invocation lookup and monitor;
retain a thin host factory adapter and host account/transport integration tests.
No parallel registry, listener or authorization mechanism is introduced.

Acceptance: independent build and outside-repository package/API type consumption;
account isolation, credential/policy races, scope escalation, conditional provider
operations, recurrence/availability and unknown/replay tests; full build/tests and
built E2E; independent review; clean-main packaging/lifecycle and deployed preserved
state. The established native prefix, current signed HomeKit helper and automation
ledgers remain unchanged. Live verification is read-only through existing MCP; no
real Calendar create/edit/delete/invite/share or new consent. Preserve current
Mail/auth behavior and database names. Calendar0.3.0/service0.1.108 are provisional
until release reconciliation. Owner pass gates the following Photos slice.

### Calendar backend source verification checkpoint

Calendar0.3.0 independently builds the existing codec/domain, CalDAV client/gateway,
services, encrypted policy/operation/sync ledger, tool schemas/scopes and capability
fields. The host's thin factory injects its existing verified invocation lookup;
structural dependency ports expose only required context/monitor behavior. Provider
implementations and persistence/authorization logic are unchanged; no duplicate
runtime or shell reverse import is introduced. Browser UI remains a separate entry.

Complete590 tests / 5,197 expect calls and builtE2E13/258 pass, including Calendar's
39/157 owned suite. Outside-repo installation resolves Calendar backend/gateway/
ledger exports inside the consumer and typechecks their API. Independent review
passed47/228 for isolation, credential races, scopes, conditional dispatch, unknown
outcomes and replay;12 declarations resolve within the package and13 client files
contain no backend markers. No scoped blocker. Release0.1.108 was delivered below.

### Calendar backend deployment (0.1.108)

PR147 merged at `fbda7dbb84b9d1f5ff3eec7454162caf233510dd`. Release0.1.108
was built from a clean detached checkout of remote main, frozen workspace and
standalone consumer locks, and six exact local bundles. Calendar0.3.0 and Mail0.3.0
ship their server/UI entries; installed host output has no old Calendar service.
Native staging verified the existing signed HomeKit payload without a native build,
launch or permission request. Its bytes are identical to installed0.1.107.

The final packaged Calendar fixtures pass39/157 against absolute installed-package
imports; the codec fixture also resolves the artifact's own pinned ICAL dependency.
The first harness attempt missed that dependency path; the corrected complete39
fixtures pass. Packaged restart/OAuth persistence checks independently pass2/151
against the same immutable artifact. No Calendar provider behavior was modified.

After graceful drain and protected stopped-state backup, the supported updater
installed the exact payload without initialization. File/symlink hashes/modes,
config/custody bytes, non-transient SQLite rows and integrity are preserved. Only
resource/rate-limit diagnostic tables are excluded from the row comparison.
HomeKit ledger files and helper bytes are unchanged. Local/private sign-in200,
byte-exact private CSS, security headers,13 clean client files and doctor13 pass.
The existing main MCP reads four actual calendars, the profile and nine mailboxes
through the installed packages. No event/calendar create/edit/delete, invitation,
sharing, mail/native write, reset or new consent was performed.

Source/independent checks are recorded above; PR147 has no configured remote CI.
Physical-device/real Passkey and broader provider/recipient acceptance are not
claimed. The immutable canonical archive, installed0.1.107/0.1.108 and protected
receipt in `runtime/backups/pre-0.1.108-20261009T034226Z/upgrade-receipt.json`
remain for recovery. Task-owned scratch/build checkout will be removed after
committed preservation; checkpoints, active checkout and unrelated state remain.
Calendar is deployed awaiting owner pass; Photos backend extraction is next.

## Remaining migration completion authorization and execution contract

Owner passed Calendar and explicitly authorized all remaining phases without
per-phase pass waits. Finish Photos/HomeKit backend ownership, then Studio server/
API/MCP/listener/process composition, release/install/doctor path updates and
removal of the old app. Keep static trusted local bundles and one service release;
dynamic upgrades/registry remain out of scope. Existing URLs, OAuth/account/custody,
SQLite/ledger namespaces, native identities and policies remain unchanged.

1. Extract Photos/HomeKit backend packages, inject original host context including
   abort/authorize and subscription restoration, preserve provider/default sidecar
   lookup and native assets. Archived Shared Album paths remain excluded from
   production; do not revive them while moving ownership.
2. Independently build/install/check packages and relevant source/packaged tests;
   obtain independent security/lifecycle review and deploy from clean main with
   protected backup and read-only installed acceptance.
3. Move the remaining host into Studio, adjust tooling/artifact entry paths, preserve
   legacy artifact inspection/rollback and external identities, then remove old
   app and adapters without changing UI or introducing a second runtime.
4. Verify full build/tests/E2E, native/helper exclusions and private/public ingress,
   drain/restart, outside-repo bundles, distribution/upgrade and live actual reads;
   independently review, merge, clean-main release/deploy and preserve results.

No real mail/calendar/Photos/Home write, reset, new grant or native permission
request is authorized by migration. Reuse the installed signed helper unchanged.
Later physical/recipient acceptance remains separate. Task-owned scratch stays
under ignored .decompozr/flow/run; accepted source/deployment evidence is tracked.

### Final source ownership and background service verification

Photos/HomeKit backends now have independent server/UI entries and package-adjacent
allowlisted native/sidecar assets. Archived Shared Album implementations/tests are
source-only and excluded from production. Studio owns the remaining host in server/;
UI/host build outputs are distinct (dist/ui, dist/server), preserving build/test
isolation. Artifact/runtime/install/doctor/container tooling targets Studio; only
explicit historical artifact inspection keeps a legacy entry fallback. Native
helper bytes, URL/OAuth/database identities and provider logic remain unchanged.

The owner requested reboot recovery and explicitly selected both automatic defaults.
The deployed0.1.108 was restored without initialization after reboot; its private
sign-in returned200. The new per-user LaunchAgent starts after login and a persistent
CLI supervises server-child failures independently. No launchd KeepAlive key is used
because it implicitly forces RunAtLoad. Kernel advisory locks prevent duplicate
runtime/control admission and release on exit/reboot; per-UUID receipts preserve
coalesced/superseded requests. Control validates actual loaded arguments/PID plus
owned prefix/plist before graceful drain and unload. Reset queues the same service
control; one-shot utilities preserve its record. UI uses pinned Switch/Modal/Icon/
Toast controls and a shared token-based section adapter. No actual reset is tested.

Source checks currently pass599 tests/5,278 expect calls, E2E13/258 and targeted
service/reset/CLI12/67, including concurrent runtime admission. Independent extracted
backend checks93/498 pass; final host/service review, browser and immutable clean-main
package/deployment acceptance remain pending. Container client exists but its engine
is stopped; no unrelated VM/service was started. Native deployment remains the task
target. Runtime configuration, master key, grants and native permission requests were
not changed while implementing. Existing service0.1.108 remains running until the
verified upgrade. Dynamic module upgrade/registry and pre-login native availability
remain outside this delivery.

Final local checks: Studio/application/module builds and typechecks pass; full599/
5,278 and E2E13/258 pass. Browser fixtures pass58 shell and142 requirement checks,
plus independent service toggles/readback, restart confirmation, mobile wrapping
and Traditional Chinese. The new mobile service screenshot was visually inspected.
Final independent service review12/67 passes concurrent admission/kernel release,
UUID supersession and async failure isolation, reset supervision and one-shot record
preservation; no scoped blocker remains. UI declaration closure includes the generated
Paraglide dependency; the transitional built account facade is removed. Container
source/context paths use the root frozen workspace; actual container build was not
run because its engine is stopped and native deployment is the requested target.
Clean-main packaging/lifecycle and deployed LaunchAgent/live reads remain pending.

### Native rollout and exited-process correction

Clean-main source1eb147f packages0.1.109; final lifecycle/OAuth/Mail fixtures18/151
pass. Exact payload, config/custody, non-transient SQLite rows/integrity and Home
ledgers are preserved. LaunchAgent defaults selected by owner are enabled. Initial
manual-to-managed apply retained SERVICE_DRAIN_TIMEOUT: the CLI had exited but its
Python deployment parent had not reaped it, so kill(pid,0) still saw a zombie. No
force termination or provider replay occurred. After parent cleanup, the supported
explicit service start registered a managed/running job; private sign-in200.

The109 protected receipt is in
runtime/backups/pre-0.1.109-20261009T172031Z/upgrade-receipt.json. Correction110
recognizes exited/zombie state during graceful drain while retaining owner/PID checks
and refusal to unload a live/replaced job. Six bounded service tests/33 assertions
pass, including the zombie-parent regression. Review and clean-main repair rollout
remain pending; this is not final migration delivery yet. Parallel UI work at8464
and its uncommitted checkout remain untouched, with a scoped coordination packet.

The110 repair was deployed from clean main a9b00ce. Readback confirms the job is
managed and running with both selected defaults enabled; its protected receipt is
runtime/backups/pre-0.1.110-20261009T173125Z/upgrade-receipt.json.
The initially failed package lifecycle check omitted the disposable installation
prefix, so it attempted admission against the running home installation. Supplying
the fixture prefix isolates custody and locks: all18 package lifecycle/OAuth/Mail
tests pass with151 assertions against the unchanged110 artifact. Independent
disposable two-start/stop verification also passes. This does not establish a
production lock-release defect; no production locking change was needed. Final
managed restart completed through the supported CLI and its matching operation receipt;
private sign-in returned200 afterward. Remaining live acceptance and cleanup are pending.

### Migration and daemon acceptance (2026-10-09)

Backend/module ownership and the sole Studio host migration are delivered through
PR149-152. The parallel UI owner subsequently integrated main and deployed0.1.111
from6f727929173646bb3d793542d1b8dca4d9f397d7; this task retained that deployment
and its active UI checkout. The installed111 payload matches all17,662 archive
payload files (AppleDouble metadata excluded), and14 served sign-in JS/CSS assets
match installed bytes. All13 read-only doctor checks pass. The signed HomeKit
payload remains byte-identical to retained108 and its signature verifies.

Existing MCP credentials successfully read the account profile, nine mailboxes
and four calendars. Earlier connector internal errors no longer reproduce.
Photos health returns the explicit photos_permission_required rejection; its
reader reports that when the OS denies a read. No native permission was granted,
TCC state edited, or provider write performed. Photos library access and actual
HomeKit/Photos device operations are not accepted by this verification. Existing
module requirement controls remain the owner's permission setup path. Login
startup is enabled and managed restart was observed, but a physical reboot was
not performed.

Source and fixture checks, independent reviews and protected deployment receipts
are recorded above. No remote CI is configured. The110 historical package is
retained alongside111 and protected backups; its archive SHA-256 is
1b9cbe5c559f40996d3711798656ce502286031b466f2a13ab112ea86006ed44.
After preserving this summary and verifying no active writer, the task-owned
detached build checkout, extraction/build logs and scratch outputs were removed.
Obsolete ignored apps/icloud build/dependency output in the migration and primary
checkouts was removed; it contained no tracked source. The active UI checkout,
managed installation, releases, backups and compact recovery records remain.
