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

## Phase 1 deployed and owner accepted

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
The owner reported `pass` on October 6, 2026; phase two is authorized.

## Phase 2 implementation and verification

The second-phase candidate is 0.1.60. Studio now serves hydrated SvelteKit pages
using adapter-node embedded in the existing Bun service. Admin/setup, owner login,
account choice, consent and Photos permissions/cloud setup have reactive Svelte
state. Whole-page DOM controllers and their legacy browser assets are retired.

Paraglide compiles `messages/en.json` and `messages/zh-TW.json`; both catalogs have
matching keys. The message-format compiler plugin is pinned locally. Cookie-first,
English-fallback locale resolution is request-scoped on the server and reactive
in the browser. Language selection persists across document navigation without
rewriting OAuth/MCP URLs or adding language prefixes. Core compatibility helpers
retain i18next over the same catalogs; browser presentation uses Paraglide.

The trusted listener/Host/source dispatcher remains outside SvelteKit. Page models
are supplied only after authoritative owner checks; module functions, stores and
credentials are not serialized. Protocol APIs transparently retain core handlers,
exact private Origin/JSON checks, body limits and OAuth policy. They bypass Kit page
CSRF/i18n processing: a default Kit CSRF check was observed rejecting originless
OAuth token forms, so protocol forwarding was kept outside that page pipeline.
This is an explicit architecture decision, not a grant to weaken private checks.

Pages use nonce CSP, no-store and no-referrer. Compiled client assets have an exact
file allowlist; unknown assets, non-read methods and server assets are rejected.
Public/private routing and both local/remote owner pairing remain isolated.
Navigation performs document reloads to recheck owner authority and clear volatile
credentials. Diagnostic polling remains bounded, pauses for drafts/hidden pages,
and preserves dated historical evidence separately from fresh authorization/read
claims. No provider write or native permission prompt runs automatically.

Verification before final native delivery: component checking has zero diagnostics;
Studio 10 tests / 932 assertions, application 426 tests / 2,906 assertions, tooling
11 tests / 141 assertions, built E2E 11 tests / 257 assertions and isolated Chrome
86 checks passed. Real synthetic OAuth code/refresh forms omit Origin. Independent
read-only review found and rechecked two corrected regressions: originless token
forms and remote-owner page hydration. Its focused transport check passed 5 tests /
878 assertions, including concurrent bilingual SSR and cookie preservation.
The disposable native candidate passed 1 lifecycle test / 30 assertions, including
actual Kit bootstrap and hashed-asset delivery. Installed/live evidence is recorded
after deployment; synthetic results do not establish physical Passkeys, live
remote-client OAuth or provider acceptance. A Linux image was not executed.

The owner will test the deployed second-phase candidate before phase three starts.

## Phase 2 deployed; owner acceptance pending

Native 0.1.60 was built from clean remote main commit
`9f23054de781b11520c44de79b6c55183d9ebfaf` (merged PR #66). The source was the
remote main tip immediately before installation. The installed payload matches
that immutable main-built artifact. Its disposable lifecycle check passed
1 test / 30 assertions, including real Kit bootstrap and compiled asset delivery.

The existing installation now selects `releases/0.1.60-darwin-arm64`, using its
existing configuration without initialization or route changes. Restart took
4.87 seconds from stopping the old owned launcher to new listener readiness.
The prior 0.1.59 release and a protected stopped-state backup are retained;
no rollback was required. The finalized receipt is under
`runtime/backups/pre-0.1.60-20261006T143208Z/` in the existing installation.
The primary checkout retains `releases/icloud-plugin-0.1.60-darwin-arm64.tar.gz`.

Live self-checks passed: 13 read-only doctor checks and 30 page/locale/header,
asset-byte, root redirect, ingress and protocol rejection checks. Local, private
Tailscale and public sign-in pages render both English and Traditional Chinese
with nonce CSP, no-store and no-referrer. Served client assets match installed
bytes. Private anonymous admin requests redirect with 303; public admin/setup
paths remain 404. The local RP rejects a forged Host. A malformed originless
OAuth token form reaches core validation and returns 400, rather than page-CSRF
403. This rejection check does not establish a real remote-client token exchange.

Configuration/custody bytes and permissions, account/owner, Passkey and grant
records are preserved. Both SQLite integrity checks pass. Transient OAuth resource
seed timestamps and rate-limit records change during startup and live checks;
these are not manual credential/grant changes. Physical Passkeys and authenticated
owner interactions remain owner acceptance; provider mutations were not performed.

Refresh the existing private admin URL (or `http://localhost:4102/icloud/admin`).
Check login, language switching and persistence, navigation, account drafts and
permission confirmation. Advance to phase three only after owner `pass`.

## Owner acceptance and visual feedback

The owner accepted phase two's overall functionality on October 6, 2026 and
requested Surface design styling plus an original icon. Candidate 0.1.61 fixes a
reproduced CSP omission that blocked same-origin Kit stylesheets, adopts the
selected design reference's typography/quiet controls/open sections, and replaces
the cloud silhouette with a modular-link SVG/PNG. It also restores explicit spacing
between diagnostic labels and values. No auth, scope or provider behavior changes.

Before the fix, the new browser CSP check and stylesheet-policy regression failed.
After correction, Studio 11 tests / 936 assertions and page 24 tests / 224 assertions
pass; the browser fixture passes 89 checks, including computed checkbox gap,
fieldset border, font weight and absence of blocked stylesheet errors. Desktop and
mobile screenshots were inspected. Third-phase work is already authorized by the
owner's overall pass and follows this requested visual delivery without another gate.

### Requirement-based setup follow-up

The owner requested separate Overview cards, reusable credential modals, toasts,
refresh icons and requirement-based setup instead of the wizard. Fresh operator
policies now default disabled for every module; saved choices and grants are kept.
Mail/Calendar elevation requires a stored app password, while Photos elevation
rechecks native permission readiness. No permission prompt runs automatically.
Apple Account status and sign-in reuse the existing Shared Album web session only.

Self-checking: 434 application/Studio tests (3,875 assertions), 11 built HTTP E2E
tests (245 assertions), 11 tooling tests (141 assertions), Studio typecheck and
compiled build pass. Browser requirement and consent acceptance is tracked in the
release verification entry once complete. Evidence is synthetic and does not
claim a new Apple, Photos, Passkey or external client authorization.

Follow-up verification after integrating current main: 446 application/Studio/tooling
tests (4,017 assertions), 11 built HTTP E2E tests (245 assertions) and 35 isolated
browser checks pass, including consent computed styling, public signed continuation,
blank optional labels, missing requirements, cancellation and failed refresh.
Independent review found no remaining scoped blocker after corrections. This
follow-up uses version 0.1.62 because 0.1.61 was released by the parallel native
Photos work; installed releases are never overwritten.

### Overview usability refinements (0.1.63)

Language is in the navigation bar. Tabs have no gap and the active marker uses
native cross-document transitions on Studio admin routes, respecting reduced
motion. Account credential status is a pair of compact modal-entry controls,
with account creation at the header. Refresh retains loaded snapshots and card
geometry; skeletons only appear before the first snapshot. Refresh/settings/add
icons use the pinned DecompozR catalog, with the Lucide notice included. Service
status exposes the private runtime folder. Build/typecheck, 25 scoped tests
(1,180 assertions) and 40 isolated browser checks pass. No reset is executed;
connection reset and factory reset with key rotation are the accepted next slice.

0.1.62 running delivery was read back from current main 3e9a9890525590b4c2e89141f7adcbc6bef06ddf.
The concurrent native workflow installed it before the Studio installer; all
payload files match the clean-main build except verified SvelteKit build identity
metadata. Live readback checked 544 conditions and doctor passed 13 checks from
this Mac, without claiming off-tailnet or new provider acceptance.

### Confirmed reset and language Menu (0.1.64)

System & diagnostics gains connection reset and factory reset with key rotation;
see system-reset.md for scope, confirmation, drain/restart and protected recovery.
No live reset was executed. The admin language control consumes the actual pinned
DecompozR Menu/Icon sources and dependencies, verified byte-identical to upstream.
456 application/Studio/tooling tests (4,155 assertions), 11 built HTTP E2E tests
(245 assertions), 45 isolated browser checks and native artifact lifecycle
(1 test / 30 assertions) pass. Independent scoped reset review has no remaining
blocker. UI/reset follow-ups do not remove the authorization for transport phase 3.

The 0.1.63 release from 13ee81c0ff78f06f0ff4a4a1c409830fa3f71048 was installed
through the supported updater. Payload hashes matched the clean-main artifact;
configuration/custody and account/Passkey/grant/policy rows were preserved. Native
readback checked 541 conditions and doctor passed 13 from this Mac. Protected
rollback retains 0.1.62 and the pre-0.1.63 backup. No off-tailnet claim is made.

0.1.64 was released and installed from clean main
349d2ce6754fb11147b40f844eb53bb36fef0c53. Installed payload matches the artifact,
configuration/master-key custody and account/Passkey/grant/policy records remain
unchanged, and both databases pass integrity checks. Native readback checked 550
conditions and doctor passed 13 from this Mac. Backup is the private runtime
pre-0.1.64-20261006T180611Z snapshot; 0.1.63 remains installed for rollback.
No production reset was performed. Third-phase transport work now proceeds.

### Transport phase implementation boundary

Replace Express listeners and the Node-only MCP transport with typed Fetch
handlers and the SDK's WebStandard streamable transport. Keep the three listeners,
fixed configured origins, exact local Host/socket checks, direct OAuth form
forwarding, cookie multiplicity, bounded decoded bodies and stateless JSON MCP.
Accepted provider work remains tracked independently of disconnected callers;
shutdown may cut incomplete HTTP only after accepted tasks finish. Reconnect
capture retains its literal-route/enum-only privacy boundary and finish semantics.

The next slice implements a Node HTTP-to-Fetch listener, separates header admission
from body parsing so incomplete bodies do not become immortal application tasks,
and forwards complete bounded bodies to existing Fetch controllers. Validation
includes body/encoding bounds, OAuth originless forms, Host/Origin/listener
isolation, disconnect/drain behavior, existing HTTP E2E and the installed artifact.
Express is removed only after these checks pass. No new scopes, owners, credentials,
Tailscale mappings or reset execution are authorized by this transport slice.

### Transport phase verification (0.1.65)

Ingress now uses a typed fixed-origin Node HTTP-to-Fetch adapter. Public MCP uses
SDK WebStandardStreamableHTTPServerTransport with stateless JSON responses; other
protocol routes go directly to their existing authoritative Fetch handlers.
Private/local listener socket/Host boundaries, multiple Set-Cookie fields and
2 MiB MCP / 256 KiB other decoded-body limits are preserved. Gzip, deflate and
Brotli remain supported. Only complete bodies enter application task tracking;
partial HTTP bodies remain subject to shutdown grace. Accepted provider work is
not aborted when its caller disconnects. Reconnect capture still persists only
finished allowlisted routes, fixed statuses and enumerated errors.

Own Express imports, middleware/bridge and direct dependencies are removed. The
pinned MCP SDK still declares Express transitively for its unused Node helpers;
this is not a claim that no Express package exists in the artifact.

459 application/Studio/tooling tests (4,176 assertions), 11 built HTTP E2E tests
(245 assertions), compiled build/typecheck and independent transport review pass.
Independent review additionally tested all three compressed-body decoders and
oversized decoded-body rejection. Existing main MCP profile and mailbox listing
succeeded on the 0.1.64 baseline (9 mailboxes); post-deployment readback will reuse
that connection without new registration, grants or provider writes.

The 0.1.65 candidate also passes the 45 browser checks and native artifact
lifecycle (1 test / 30 assertions). Existing main-connection baseline read was
correlated with the 0.1.64 server's successful mailbox-list operation log; only
mailbox count and account continuity are used for deployment acceptance.

### Shared-shell navigation correction

0.1.70 keeps one Svelte admin shell and left icon rail mounted while content
changes. The marker has fixed 44px height and ordinary CSS position movement.
Each navigation revalidates owner status, handles expiry, guards drafts/modals
and fences delayed JSON bodies before changing the view. Overview cards are rows,
module order is Mail, Calendar, Photos, and path copy uses full values.
459 tests (4238 assertions), 58 browser checks, build/typecheck and focused
independent review pass. Upstream Photos changes through 0.1.69 are preserved.

0.1.65 was installed from b272fd1669ef3a886cb760e17c8492a25e9f8f5a with protected
state readback. Existing main MCP profile stayed on the same account and mailbox
listing succeeded (9). Concurrent native Photos work later restarted that release
and advanced main. No new registration or provider write was needed. Preservation
is an upgrade-time claim; later authorized configuration changes are separate.

### Final delivery readback

The three migration phases are implemented and delivered. Running 0.1.71 from
cf05683f72bacb5e785bdeb0132a3f22bfa852c4 includes the requested shared icon shell
and single-column overview. Its payload matches the clean-main rebuild except
verified Kit build identity metadata. 13 actual HTTPS assets and 13 doctor checks
pass. Existing main MCP retains the same account and reads 9 mailboxes. No new
registration/grant, provider write or live reset was introduced for acceptance.
Concurrent native Photos changes and current operator configuration are preserved.
