# HomeKit integration into the current runtime

Status (2026-10-07): deployed locally in 0.1.96 from main commit
`46ccf77941b94d2953e3d0c2d68a66bc552f1b3d`. **The complete HomeKit roadmap is not
accepted.** The retained `plan-homekit-end-to-end` branch preserves the original
roadmap and experimental evidence. Later dated sections below record delivery and
acceptance; earlier implementation checkpoints are historical.

## Acceptance boundary

| Capability | Current production state | Remaining acceptance |
| --- | --- | --- |
| Native physical control | Distinct control policy/consent, exact reviewed targets/revisions and durable once-only outcomes deployed; owner-approved Office Light ON/OFF and SDK readback accepted | Other physical targets and app-owned scene/automation effects require concrete owner-approved acceptance |
| Home reads and binding | Owner/account/Home binding, connected-client discovery/health and exact-ID fresh reads accepted; formal native identity authorized | Broader definition/client acceptance remains separate; no implicit new client grants |
| Scene/automation definitions | App-owned scenes and supported disabled triggers have bounded local acceptance | Physical app-owned scene execution and automation enable/trigger acceptance remain open; existing household definitions are excluded |
| Events | Genuine owner-consented official v2 client received four natural Office Light callbacks over modern HTTPS MCP subscriptions and read exact session/cursor pages | Other agent-host subscription behavior and conversation wake are unverified; Nerve is outside this milestone |
| Packaging | Signed formal helper installed; old Probe registration/permission cleanup and owner visual confirmation accepted | Sleep/logout/login testing excluded by owner; journal retention policy acceptance remains separate |

M1 rich reads and bounded M2 definition slices have local acceptance. Production
control and the exact natural-event-to-MCP-client path now have real acceptance.
This does not establish broader scene/automation effects or agent-host wake behavior.

## Owner-selected always-on deployment scope

The owner explicitly removed sleep/wake and logout/login restoration testing from
this task: the Mac runs continuously and the owner uses power-up with automatic
login. Treat this as the selected operating assumption, not a passed lifecycle test.
No sleep, logout, reboot, power cycle or automatic-login setting change is authorized
by that statement or performed for this acceptance. These checks are excluded,
not remaining blockers. Preserve durable operation outcomes, explicit event gaps,
revocation/disconnect cleanup and no blind retry. Prior lifecycle checklist entries
below are historical and superseded by this scope decision.

## Next implementation slice: production controls

The separate `homekit.control` capability is implemented, disabled by default and
requires fresh client consent before activation. Bind every command to the verified owner/account/enrolled
Home and exact accessory/service/characteristic or scene/trigger ID. Add bounded
write, scene execution and automation enable-state contracts, preview/revision
checks where applicable, and persist intent before dispatch. Preserve unknown and
readback-mismatch outcomes without automatic replay or retry. Controls must not
inherit definition-management permission.

Source/fixture authorization and reconciliation passed without operating a device. Live physical acceptance requires a concrete owner-approved
target/effect; prior experiment authority is not blanket household control authority.
Keep Shortcuts, relationship graph service and outbound notification delivery deferred.

## Native presentation

The signed v0.14 helper runs without a diagnostic main window by default. Catalyst
ignored LSUIElement/orderOut alone on this Mac, so a narrow bridge uses documented
NSApplication selectors for accessory activation and application hiding after Home
authorization. `--show-window` remains an explicit diagnostic escape hatch. System
permission UI is not hidden before authorization. Actual read-only acceptance
verified Home ready/authorized, accessory policy, zero visible owned windows,
zero physical writes and exact owned-process cleanup. Task build windows auto-close.

## Current-host integration

Optional `[homekit]` settings register the existing account/Home-scoped module.
Policy starts disabled; the Apple Home module settings panel checks helper readiness and
links a Home to a connected account. Linking changes no Home objects or OAuth scopes.
Enable read capability and review client consent separately. Automation capability
has a configuration ceiling and only permits reviewed app-owned definitions and
disabled triggers; physical control/scene execution requires the separate disabled-by-default control capability and is not included in definition permission.

The current HTTP ingress now streams SSE rather than buffering it to completion.
Owner/account/scope-bound resource sessions use the Web-standard SDK transport and
close owned subscriptions on disconnect/revocation/expiry. Re-enrollment invalidates
readiness observations. Catalog read, fresh characteristic read and helper health
remain distinct evidence.

Typed output still represents real Home information. No claim of anonymization,
synthetic data or contractual permission follows from type conversion. The owner explicitly enabled Home reads and bounded definition management after
Home/account enrollment. This does not establish anonymization or a general public
data contract. Fresh client consent must not be bypassed.

## Verification and remaining gates

Self-checking: 120 affected tests/1,835 assertions passed, plus current application
build, Studio checks and TypeScript checks. Five exact native presentation policy
checks passed. Signed v0.14 direct and compiled HTTP fixture acceptance verified
actual Home/characteristic/resource reads, subscribe/unsubscribe, changed session
on explicit read-only reconnect, old-session denial and owned-PID cleanup. No
natural push was observed; fixture push is not actual native push proof. Fixture
principals are not installed OAuth accounts or client acceptance.

Private receipts are retained under `.flow-runtime/homekit-background` (ignored,
owner-only): `builds/build-a15s77m6/result.json`, `acceptance-4mau0z2j/summary.json`,
`m3-http-native-svQgHI/summary.json`, `integration-build.log` and
`integration-tests.log`. The earlier `/tmp` evidence root became unavailable during
retry; Git source/history is retained and no recovery claims are made for missing
private mappings or operation receipts.

## Local deployment and UI verification

PR #98 installed the optional signed helper/module in 0.1.81; PR #99 placed Home
linking inside module settings in 0.1.82. The owner linked a Home and explicitly
requested read and bounded definition-management capability activation. Existing
OAuth client grants were preserved; capability enablement does not grant client access.

PR #100 deployed 0.1.83: separate HomeKit consent category, short aligned approval,
wrapping granted-action tags, Review inside its warning and per-event catalog toasts
with upward stacking and right-swipe adapters. Production build/typechecks passed;
531 tests passed. The signed Release build verified source/version/team and closed
its own finished Terminal window. Live service health, discovery, doctor, installed
payload and protected-file readbacks passed. Database comparison preserved binding,
policy, owner and client-grant rows; only registration timestamp and rate limits
changed. Physical writes: zero. Browser connection was unavailable, so physical iOS
Safari layout/animation/touch acceptance remains unverified.

Private recovery: `.flow-runtime/homekit-background/ui-deployment/summary.json`,
`pre-0.1.83`, `ui-release-builds/build-wvli_rj7/result.json`. Retain installed rollback
releases and uncertain old experimental resources. No existing Home automation was
changed. The incomplete acceptance gates above remain required.

## Production control implementation plan (active)

Owner: sole replacement native root, same assigned worktree, branch
`implement-homekit-production-controls`. Existing publication, merge and signed
local deployment authority persists; no physical acceptance target is authorized.

1. Add a default-false configuration ceiling and migrated default-false owner
   `control` policy. Declare independent `homekit.control` OAuth consent; preserve
   existing read/definition policy and client grants on upgrade.
2. Add exact-ID bounded prepare/apply/cancel/outcome contracts. Store reviewed
   target/revision and intent before native dispatch; reserve each operation once
   across reconnect/restart. Cancellation, revocation, expiry or changed binding
   before dispatch denies execution; after possible dispatch retain unknown state.
3. Extend the scoped signed helper mode with revision checks, metadata/type checks,
   shared app-owned resource ledger, supported scene/trigger restrictions and
   durable control outcomes. Unknown/mismatch results retain provider evidence and
   never retry or imply physical completion. Read reconciliation adds observation
   only; it cannot prove the original operation caused the observed state.
4. Self-check with realistic denial, stale target, duplicate/concurrent apply,
   crash-reservation, cancellation, revocation/re-enrollment and mismatch fixtures;
   build/sign, publish/merge and deploy from verified clean remote main. Preserve
   rollback/custody/grants and verify installed default-disabled controls/read health.

Whole-task external gates remain fresh same-client consent/read/push, explicit
owner-approved target/effect for physical control, and sleep/logout/login checks.
No fixture or deployment health result closes those gates. Shortcuts and graph
service remain deferred; unsupported/opaque trigger bodies stay explicit.

### Control slice verification and upgrade boundary

Implemented for 0.1.84 with signed helper v0.15: separate control consent and
configuration/owner policy; exact-target reviewed plans; native revision, ownership
and supported-definition restrictions; persistent once-only reservations; cancellation
and final pre-dispatch authorization checks; original unknown/mismatch retention;
read-only journal/current-target reconciliation. No control permission derives from
definition-management permission. Existing household resources are not adopted by name.

Self-checking: 546 combined application, Studio and tooling tests passed; application
and tooling typechecks, full application build and Studio diagnostics passed (zero
Svelte errors/warnings). Twenty exact Foundation-only production policy/journal checks
passed, including retained mismatch, crash reservation, conflict, large streaming
history and partial-journal denial. Signed Release v0.15 development build verified
source SHA/embedded pin/team and closed its task window. Actual native read/preview
accepted the exact approved characteristic, denied an unowned scene and found no
operation reservation; control apply calls and physical writes were zero. Compiled
shared-HTTP native reads, resource subscribe/unsubscribe and read-only reconnect passed
with fixture principals; natural push and installed-client acceptance remain unverified.

Private receipts: `control-development-builds/build-ejt_wpyu/result.json`,
`control-read-preview-HCikHU/summary.json`, `m3-http-native-xk9Ppz/summary.json`, and
`reincarnation-20261007/final-tests.log` beneath the ignored HomeKit evidence root.
Review was same-agent self-review; no independent review is claimed.

The upgrade stages the new helper but keeps the current enrolled v0.14 helper's
immutable retained-release path and source pin for established read/definition use.
Default-disabled controls, Home binding rows and OAuth grants remain unchanged.
Explicit owner helper-pin/enrollment reconciliation is needed before v0.15 controls
can be enabled, followed by fresh client consent and a concrete target/effect approval.
This upgrade does not perform those actions. Retained v0.14 payloads remain valid
for signed read/definition rollback. No sleep/logout/login or disk-deletion policy
acceptance is claimed; histories and uncertain resources remain retained.

## Production control deployment and final hardening

PR #103 merged the control slice; signed Release 0.1.84 installed from verified
clean remote main. All 14,698 installed artifact files/symlinks matched the staged
payload, live process version/health/discovery and doctor passed. Existing owner,
Home bindings, read/definition policy and OAuth grants were preserved. Schema adds
only default-false control and empty plan/observation tables; expected resource
registration/rate-limit rows changed. Custody bytes/modes remained unchanged.
The only configuration change pins the same enrolled signed v0.14 helper to its
retained 0.1.83 release path; the installed v0.15 helper remains inactive for controls.
Actual installed-module/owner-store/native read readiness passed, with one owned
verification helper stopped. This is local owner/read evidence, not client consent.

Private recovery: `control-deployment/summary.json`, `control-deployment/pre-0.1.84`,
`control-release-builds/build-1k8t9ndb/result.json`, and
`installed-control-read-3UXYtG/summary.json` under the ignored HomeKit evidence root.
Production launcher and existing rollback releases remain retained; physical writes
and existing household automation mutations were zero.

Post-deployment self-review reproduced an oversized current-readback observation
with a 128 KiB fixture. The 0.1.85 hardening caps that readback at 64 KiB before
persistence, records an unavailable observation and preserves the original outcome.
The failed reproduction and passing regression are retained privately. New local
production rollout proceeds from clean merged main; no added consent or Home action
is included. Full-module external acceptance gates remain unchanged.

## 0.1.85 rollout and actual connected-client acceptance

PR #104 bounded retained current readbacks after a reproduced 128 KiB observation
fixture. The final 547 application/Studio/tooling tests and full build/typechecks
passed (zero Svelte errors/warnings). Signed Release built from clean verified
remote main `32ff16909d69a8f841e0863090cbe9c4b5d63e63` and installed 0.1.85 using
the existing prefix and launcher. Artifact file/symlink hashes matched installation;
health, running release path and doctor passed. Configuration, custody, Home bindings,
owner policy and client grants remained unchanged; only expected resource-registration
and rate-limit records changed. Retained 0.1.83/0.1.84 releases and private backups
provide recovery. The active enrolled helper still uses its approved v0.14 source
pin; installed v0.15 physical controls remain disabled.

The actual connected iCloud plugin tools (not fixture principals) passed enrolled
Home discovery, native health, exact-ID fresh characteristic read and raw event-page
read before and after rollout. The production restart changed the native session
and denied the prior session. Actual same-client read-only reconnect also changed
session and denied its predecessor, with automaticRetry=false and no mutation plan
replay. No grants changed and no new/control consent is claimed. No natural event
push was observed; raw event read does not establish client notification delivery.
Physical writes, scene execution and existing household automation changes: zero.

Private final receipts: `control-hardening-deployment/summary.json`,
`actual-client-acceptance.json` within that directory, `pre-0.1.85`, and
`control-hardening-release-builds/build-x775qzle/result.json` under the ignored
HomeKit evidence root. The main and task checkouts/histories remain retained.

External acceptance still required: explicit owner helper-pin/enrollment
reconciliation and control policy activation; fresh same-client control consent;
concrete owner-approved physical target/effect; a real client resource subscription
capable of natural push; supervised sleep/logout/login; and an explicit durable
journal retention policy that preserves unknown outcomes. No histories are deleted
or automatically archived. Shortcuts and graph service remain deferred. Whole-module
acceptance remains incomplete until those gates have concrete evidence.


The 0.1.86 connection-visual update (PR #106) leaves the accepted 0.1.85 HomeKit
runtime behavior, approved v0.14 enrollment pin, policies and grants unchanged.
Actual connected-client Home health still passes with physicalControlEnabled=false.
The whole-module external acceptance gates above remain open.


## Owner-requested production control activation

The owner requested working local production control and approved the exact Office
Light on/off acceptance sequence. The supported module enrollment and capability
handlers now use the installed signed v0.15 helper, preserve the same approved
owner/account/Home/UID, create a new binding generation and enable control policy
and configuration ceiling. Existing access/refresh/consent grant rows were unchanged;
physical writes remain zero pending actual client tool execution. A fresh control
consent and matching control access/refresh grants are now observed.
MCP discovery now advertises `homekit.control`. Private activation/rollback records:
`.flow-runtime/homekit-background/control-activation`.

Health selects the actual control helper when both policy and the invoking client's
explicit control consent allow it; physicalControlEnabled then reflects the real
control transport. Read-only clients retain false and receive separate capability/
consent fields, avoiding a misleading whole-service disabled interpretation.
The Office Light test will use reviewed once-only commands through the actual
consented MCP connection; no fabricated scopes/tokens or direct native writes
substitute for that client acceptance. Broader scene/trigger, push and session-lifecycle
acceptance remain separate gates.


## Production helper architecture rebuild (active)

Observed gap: native source remains a single Probe coordinator with experimental
normal-mode controls and historical product/server naming. Signed packaging and
host authorization do not complete the requested native architecture rebuild.
The user requested proper production architecture; Office Light on/off remains
approved. Fresh control consent is observed, and installed 0.1.89 now reports actual
control transport readiness true through the existing connected MCP.

The sole task owner will:
1. Replace the monolithic experiment app with composed native services: launch
   configuration, private JSON-RPC transport, Home runtime/catalog, events,
   app-owned definitions, physical controls and durable journals/ownership policy.
2. Ship HomeKitHelper as the product/server identity, preserve the existing signed
   bundle identifier/team for Home authorization continuity, and hash the full native
   source manifest. Retain legacy signed payload support for rollback only.
3. Remove experimental public control routes and implicit control-enabled startup.
   Mutating modes require an explicit enrolled Home and private scoped ledger;
   default launch is idle/denied, enrollment is owner-only read inventory.
4. Preserve exact identities, supported/opaque restrictions, reservations before
   dispatch, unknown/mismatch retention and no automatic retry. Reuse the existing
   signed build and supported local install/supervisor; no new global service.
5. Verify changed native policy/transport/journal boundaries, signed build and
   actual read/preview; merge and deploy clean main, reconcile only the existing
   approved Home/account binding, preserve client grants, then execute the approved
   light sequence through freshly loaded actual control tools.

Prototype history and rollback artifacts remain retained; no adoption by name,
credential export, deletion, archive, graph service or Shortcuts work is included.
Source/file separation alone is not acceptance. Actual client control execution,
physical readback, natural push and broader session lifecycle remain separately
reported. Current agent tool declarations still lack control command tools despite
fresh consent; client tool-catalog refresh is an external execution prerequisite,
not permission to fabricate scopes or substitute direct native writes.


Architecture self-checking: 84 affected host/tooling checks passed, plus exact native
launch/framing (19), control/journal (20) and presentation (5) checks. Signed Release
HomeKitHelper v1.0 builds with complete native-source manifest. Actual native
read/preview passed on the approved Home, unowned scene denial passed and no control
apply/device writes occurred. Initial private FIFO input exposed a Foundation read
buffering timeout; switching the bounded transport reader to POSIX partial reads
repaired it. Failed receipts are retained, not counted as accepted builds.
Actual signed background readiness/zero-window and compiled shared-HTTP native
read/resource/reconnect checks passed with fixture principals; client physical
acceptance is not inferred from these. Verification is same-agent self-review.

## Production helper acceptance and identity retirement (2026-10-07)

Release 0.1.90 (PR #113, commit 356bea1) is installed locally with the composed
HomeKitHelper v1.0 runtime. The genuine connected MCP client prepared/applied the
owner-approved Office Light ON, independently read ON, prepared/applied OFF and
independently read OFF. Both durable operations are acknowledged with matching
SDK readback; final state is OFF. No retry occurred. This establishes this exact
client/device sequence, not human visual observation, scene/automation execution,
natural push or sleep/login/retention acceptance. Private receipts remain retained.

The owner subsequently requested removal of the retired Probe from all settings.
Release 0.1.92 changes the signed bundle identity to
`com.decompozr.homekit-helper`, displayed as **iCloud HomeKit Helper**. Existing
OAuth grants and exact owner/account/Home binding remain preserved. The new native
identity requires genuine macOS Home approval; old authorization is never copied.
After new identity readiness, targeted LaunchServices unregistration and supported
`tccutil reset All com.decompozr.homekit-probe` retire only the old app identity.
Old source and operation evidence remain retained. Identity migration and visible
settings cleanup must be verified separately before being reported complete.

Identity retirement initially encountered the signed-build prerequisite: Xcode
reports “No Accounts” and no Mac Catalyst App Development provisioning profile for
`com.decompozr.homekit-helper` (Release build exit 65). Team 74NBML8KJB must be
available through genuine Xcode account login/provisioning before migration. The
working 0.1.90 installation and its native permission have not been removed. A
bounded LaunchServices inventory found 47 old identity registrations, 22 with
existing bundles; cleanup remains pending successful new-identity readiness.

The owner completed developer-account login and enabled the capability. CLI
validation subsequently produced a successful signed Release for the formal App ID:
its dedicated Mac Catalyst provisioning profile and signed app both contain
`com.apple.developer.homekit=true`, Team 74NBML8KJB, and the displayed production
name. The project now records HomeKit capability explicitly and uses generated
LSUIElement=true consistently. OS Home authorization and deployment remain
separate checks; a first read attempt before approval correctly returned not ready.

Owner-approved macOS Home permission was subsequently verified through CLI: new
identity ready/authorized, background mode, no Dock presence or visible owned
windows, and owned native process stopped after read-only acceptance. Physical
writes were zero. Release numbering advances to 0.1.92 to preserve the independently
delivered account-module 0.1.91 release.

## Installed production identity and legacy cleanup acceptance

PR #117 merged as 3c9eb77; clean remote-main signed Release 0.1.92 is installed
at the existing iCloud prefix. The native manifest pin is
`d82ddb4e394664257d9a0ce31c034de5831326aa64397e507eeec4ebdabd10d4`.
CLI inspection verifies `com.decompozr.homekit-helper`, display name
**iCloud HomeKit Helper**, Team 74NBML8KJB, and HomeKit entitlement in both the
signed application and dedicated Mac Catalyst profile. Owner-approved Home access
passes actual native background/readiness/zero-window checks. Build/typechecks
pass with zero Svelte errors/warnings; 8 bounded preflight tests pass.

The supported installer preserved databases/custody at the stopped installation
boundary. Supported helper enrollment reconciled the existing exact owner/account/
Home/user binding and new source pin, preserving client grants. Actual existing MCP
health reports ready/authorized and physicalControlEnabled/controlConsentGranted
true; independent Office Light read remains OFF. No physical writes were made
during this identity migration; previous 0.1.90 ON/OFF acceptance remains historical.

Legacy cleanup archived 39 exact old-identity native app bundles as private binary
evidence and removed their runnable `.app` copies. Source, signed receipts,
conversations and durable operation histories remain preserved. Exact-path
LaunchServices unregistration reduced 47 old registrations to zero. Supported
`tccutil reset All com.decompozr.homekit-probe` succeeded for only the retired app.
The new helper still passes actual MCP readiness after cleanup. Historical release
files remain, but their retired native helper must not be treated as a usable
HomeKit rollback; use the new signed identity.

The owner subsequently confirmed that the retired Probe disappeared from the
settings UI. This closes the settings appearance acceptance through owner visual
confirmation, alongside CLI registration absence and targeted permission reset.
Direct read-only TCC database inspection remains unavailable under existing OS
access; no permission expansion or system database edits were attempted. App-owned scene execution/enable, natural native/client
push and sleep/logout/login/retention acceptance remain open; this does not mark
the whole HomeKit roadmap complete. Shortcuts and graph service remain deferred.

## Native modern MCP subscription milestone

The owner selected natural HomeKit changes to MCP event subscription as the next
production milestone, before scene/automation acceptance and without Nerve. The
HTTP host adds the official SDK v2 modern `subscriptions/listen` path beside the
existing legacy transport. Each stream owns a private event bus, exact verified
owner/account/scopes, selected bound resource feeds, acknowledgment/correlation
framing, and idempotent removal. Authorization is checked before publish and every
30 seconds while idle, including Home unlink/source generation/policy boundaries.
There are at most 32 streams and 32 resource URIs per stream; each ends after five
minutes or 256 update signals. Clients explicitly reconnect and read the retained
event page with its session/cursor, reporting gaps rather than fabricating continuity.

Notification filters do not grant new access. Only already-consented Home reads
are used; no controls, household automation changes, inferred presence, Nerve
adapter or agent-wake behavior are added. Modern SDK wire checks and real loopback
HTTP fixture events are source verification, not physical/native acceptance or
Claude compatibility. A separate official-client acceptance script obtains fresh
owner OAuth consent for `homekit.read` only, stores tokens only in memory, and waits
for owner-generated Office Light ON/OFF observations through the deployed endpoint.
No device write command exists in that script. Natural/provider push, existing
production authorization and client delivery must pass before closing this milestone.

## Natural HomeKit event to modern MCP acceptance (2026-10-07)

PR #122 merged as 30d06e4 and release 0.1.94 is installed at the existing prefix.
The complete native manifest is unchanged; the clean-main signed formal helper
receipt remains valid. Source verification passed 45 affected subscription,
lifecycle, resource, control and authorization checks, two built legacy HTTP checks,
and full build/typechecks with zero Svelte errors/warnings. No PR CI checks were
configured; review was same-agent self-checking.

The owner supplied genuine OAuth consent for the official v2 acceptance client,
restricted to `homekit.read`. After acknowledgment of the exact bound Office Light
resource, owner-generated changes produced four real HTTPS subscription update
signals. The client read four exact-ID native callback events in the same session
with monotonically increasing sequences 1–4 and raw values [1,0,1,0]. Metadata
declares `format=bool`; bounded interpretation is ON/OFF/ON/OFF. Independent fresh
MCP read confirms final OFF. The agent/client issued zero physical writes.
This accepts **natural HomeKit change → modern MCP stream → authorized event read**
for this enrolled target and official SDK client. Claude/Codex conversation wake,
other host subscription behavior and unattended session lifecycle remain unverified.

The original client retained correct events but its completion assertion required
literal true/false, so it was stopped after receipt capture. Same-agent reconciliation checked retained evidence using corrected strict
bool/0/1 interpretation; the failed
automatic completion is not relabeled as passing. Two meaningful encoding/denial
tests and strict runner typecheck pass. Production events remain raw; no general
coercion was added to physical-control contracts. The runner now also retains OAuth
discovery/issuer binding state in memory beside PKCE, addressing an SDK warning from
the first callback exchange. No test token or verifier is persisted/exported.

The first loopback authorization attempt expired because the owner used a different
device. For the completed attempt, the owner authenticated on their passkey-enabled
device and delivered the localhost callback directly to the intended Mac mini via
screen sharing; state and PKCE checks remained intact. A loopback callback belongs
to the client machine, not the device opening consent. Avoid sending callback codes
through agent chat or logs. The exact acceptance client process is stopped; no
standalone event watcher is left running. Runtime behavior is unchanged by these
acceptance-runner/documentation corrections, so no additional app release is needed.

Scene/automation execution and sleep/logout/login/retention acceptance remain open.
Nerve, Shortcuts and relationship graph work are outside this milestone.

## App-owned scene and automation production slice

The owner selected scenes and Home automations next. Scope is app-owned definition
CRUD/revisions and bounded scene execution/readback, followed by supported disabled
calendar/characteristic automation definition/linking and explicitly approved
enable/trigger acceptance. Existing household resources are not adopted, edited or
executed. Exact owner/account/Home, ownership/reference, opaque-definition, durable
intent and no-retry boundaries remain mandatory. A concrete target/effect and
automation trigger/time are pending owner selection; no physical action has been
performed for this slice. Sleep/logout/login testing remains excluded.

The source slice removes the obsolete Test creation/rename prefix while retaining
operation correlation and exact ledger identity. Provider-owned bool targets may
use NSNumber 0/1; normalize only those declared SDK bool values for scene preview
and definition readback, keeping incoming control commands strictly typed. Scene
execution performs bounded fresh characteristic reads after SDK acknowledgment;
mismatch or unavailable readback retains its outcome without replay. Foundation
policy and host denial/retention tests precede signed clean-main build/deployment.

The first 0.1.95 app-owned scene creation was rejected by HomeKit with HMErrorDomain
60 (name does not end with valid characters): the added trailing square bracket
was invalid. No created scene ID or ownership record was returned. Keep the original
operation/plan unknown with its provider rejection receipt; do not replay it.
Correct generated names to end in the operation UUID's valid alphanumeric character.
The host now preserves a bounded exact-operation native rejection receipt, stripping
unrecognized fields; control and unrelated native error behavior stay unchanged.
Any corrected creation is a distinct reviewed operation after confirming absence,
not an automatic retry of the failed command.

## Scene definition staging on production 0.1.96

PR #125 (71a01f6) delivered scene policy/readback; PR #126 (46ccf77) corrected
the observed invalid name and preserved native rejection evidence. Signed clean-main
Release 0.1.96 is installed with native manifest
`6b866e20ac08dfc78b027c11101cee97b6f45f94f11931cefa78a3cb650fa7d8`.
The stopped installer preserves databases/custody; supported enrollment reconciles
the same owner/account/Home/user and new source pin without changing client grants.
Native ledgers remain in the stable owner/account/Home directory; old operation
results remain retained. Doctor and actual connected MCP readiness pass.

The failed 0.1.95 operation was not replayed. Its native receipt identifies the
naming rejection; all 118 scene snapshots contained no matching operation marker,
with scene/automation counts 118/100 throughout that non-atomic inspection.
A distinct corrected operation then created the App-owned Office Light On scene,
followed by one exact power characteristic action with desired true. Another
operation created the Office Light Off scene with desired false. All four definition
mutations completed with independent SDK definition readback and exact ownership
proof. Actual MCP execution previews pass, each showing exactly one approved-device
power action and no trigger references. Prepared execution plans were cancelled
without dispatch while owner effect/trigger selection remains pending.

No scene execution, device write or existing household automation mutation occurred
for this slice. Independent fresh MCP read remains OFF. The two staged definitions
are retained for the requested next acceptance, not temporary orphan resources.
Scene execution/readback and automation create/link/enable/trigger acceptance remain
open; the first async target/trigger question is still pending. No automatic clock,
sensor threshold, fallback duration or household automation target was selected.

## Reviewed existing scene execution

The owner explicitly requested native execution of the existing Turn Off Third
Floor scene after turning on the two Master Washroom lights. The previous fallback
performed 11 exact device writes with verified final OFF, but did not execute the
scene API and is not scene acceptance. The production extension adds default-off
owner policy `scenes` and distinct `homekit.scenes` client consent. Existing
`homekit.control` grants do not expand automatically. Both control and read remain
required, and policy/consent are checked before prepare, before dispatch and after
response. A host-only intent bit can authorize existing user-defined scenes; public
DTOs reject it. Definitions retain exact ledger ownership for editing/removal, and
automation enable remains app-owned. Opaque, built-in, unresolved, truncated or
referenced scenes remain denied. Scene execution uses native executeActionSet,
revision binding, bounded fresh action readback and once-only durable outcomes.

Source, denial/revocation tests, signed clean-main build and local deployment precede
owner policy activation and fresh client consent. Only then repeat the already
owner-selected washroom ON → native Turn Off Third Floor sequence. No direct-write
emulation is accepted as a native scene test.

## Existing scene source deployed; fresh consent pending

PR #128 merged as b31ba1b; signed clean-main 0.1.97 is installed. Native manifest
`bc41a6dd69184a13c7a77ea40c770b29360d632bbc0a9e6ad02c30c196fbbb85` passes
signature/source verification. Signed native inspection confirms the exact existing
Turn Off Third Floor scene's nine supported actions can be previewed with the
host authorization bit, and remain denied without it. This is read-only native
acceptance, not OAuth or physical scene execution.

41 host checks, 22 native policy/journal checks and 22 scene/provider checks pass;
full builds/typechecks report zero Svelte errors/warnings. No PR CI checks were
configured; checks are same-agent. Owner enrollment reconciles the same approved
owner/account/Home/user and new pin, preserving client grants. Doctor and actual
existing MCP control health pass. New scenes policy remains false; actual health
reports sceneExecutionCapabilityEnabled/ConsentGranted/Enabled all false.

The owner was given the concrete UI activation and connection capability-review
steps. Do not enable policy or expand grants automatically. After those steps,
perform the already requested two Master Washroom lights ON, then one native
executeActionSet for Turn Off Third Floor, followed by its bounded action readback
and independent target reads. Until then this milestone is deployed but physical
scene acceptance remains open. Existing definitions and automation management
permissions remain unchanged; no new physical writes occurred for this extension.

## Automatic connection capability synchronization (0.1.100 deployed)

Enabling a module now updates eligible installation-owner client registration
ceilings automatically. A separate Connections Review action is no longer needed
for those registrations. Existing consent, tokens and refresh grants are preserved.
Disabled, unrelated and shared registrations remain excluded.

A reconnect whose scope list exactly matches an audited former complete
registration snapshot is updated to the currently enabled registered scopes before
the provider signs a new authorization request. This addresses the observed
ChatGPT reconnect requesting only Mail, Calendar and offline access despite the
same client's enabled Photos and HomeKit registration. Explicit narrow requests,
silent authorization and other-resource requests remain unchanged. Fresh displayed
consent and the selected account are still required; scope synchronization grants
no Home access by itself.

The synthetic OAuth check verifies a cached complete reconnect reaches the signed
consent page with new permissions, preserves state and PKCE, and preserves every
grant when denied. A narrow read request remains narrow. Live client consent and
the approved Office Light / first-floor native scene sequence remain pending.

PR135 merged at `9fc8cb5cdcde06a91ba9768fc39a20310cf7af65` and signed-helper
release 0.1.100 is installed locally. The unchanged formal helper source pin is
`bc41a6dd69184a13c7a77ea40c770b29360d632bbc0a9e6ad02c30c196fbbb85`;
its existing Release signature and team were verified without a new native build.
Installed payload verification matched 17,426 files/symlinks. Configuration, custody,
Home bindings/policy, consent/access/refresh rows and owner-store rows were retained.
Registration ceilings and their audits may change intentionally at startup.

The actual public authorization endpoint was checked via CLI with this ChatGPT
client's old Mail/Calendar/offline scope snapshot. It returned a signed owner-login
continuation offering all 15 enabled scopes, including `homekit.scenes`, while
preserving state and PKCE. This check issued no token and performed no physical
write. Read-only doctor checks passed. The old open signed consent page is immutable
and must be restarted through the host's reconnect flow to receive the new list.
The current conversation still reports scene consent false; genuine host consent
and the approved first-floor native scene effect remain external prerequisites.
