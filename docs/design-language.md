# Shared interface design

## Current Surface design adoption (2026-10-06)

Logo selection (2026-10-07): the owner selected the plain, plump cloud outline
after rejecting modular-link, robot, tunnel and decorated-cloud concepts. Use
one continuous olive outline with an empty interior, a larger right-hand lobe,
smaller left shoulder and softly rounded ends. No eyes or other decoration.
Scope is the shared Studio glyph and generated plugin assets.
Acceptance is matching geometry across admin/auth and SVG/PNG exports, legibility
at the existing 32px rail size, and passing Studio build/type checks. Preview
renders are task-owned temporary artifacts. Deployment was subsequently requested
to the existing native installation; release 0.1.84 preserves the 0.1.83 runtime
features, settings and signed HomeKit helper, with 0.1.83 retained for rollback.

The selected raster preview was rebuilt as a compact SVG path so small UI
glyphs stay sharp. The inline glyph has no background fill; the downloadable
PNG retains its white background.

Selected-version self-checking: Studio build passes, Svelte reports zero errors
or warnings, and the existing suite passes 12 tests / 1,158 assertions. Admin
and auth SSR contain the shared cloud geometry. SVG and PNG exports match the
source; the 256px PNG is 4,204 bytes. The 256px and 32px renders were visually
inspected. Task-owned temporary build log and small preview were removed after
recording these results. The committed task checkout is retained for review.
The updated-main deployment candidate passes the repository checkpoint: type
checks, build, 531 Studio/application/tooling tests and 11 HTTP E2E tests.
Installation and live acceptance remain separate until the deployer records
installed-version, payload, health and browser readbacks in the existing private
runtime deployment records. No external-client acceptance is implied.

Studio follows the owner-selected Surface design reference at
`https://mac-mini.duckbill-ionian.ts.net:8463/workspace/surface/main/design/`.
Observed controls use DecompozR Inter, 14px/20px body and field typography,
13px/18px compact controls, 4px control corners, quiet idle controls and the shared
Milk Green semantic palette. Content uses an 18px title, 14px section headings,
open white sections and restrained separators. Studio preserves normal 36px
controls and 44px coarse-pointer targets while adopting that quieter treatment.

Consent uses flat, aligned checkbox rows with a 12px text gap, normal text weight
and no browser-default fieldset border. Same-origin compiled stylesheets are
allowed by CSP alongside the existing inline styling; nonce scripts, frame
restrictions and origin/authorization checks remain intact. Browser verification
now captures CSP console errors and checks computed styles, not only asset HTTP
success. The prior inline-only style policy was reproduced blocking Kit CSS.

The selected cloud outline replaces the prior modular-link proposal. One shared UI source generates
the inline glyph and 256px SVG/PNG download assets. Regenerate exports with
`bun run --cwd apps/studio render:brand`. This is an original project mark, not a
legal trademark-clearance opinion. Earlier cloud/teal/i18next sections below are
historical and superseded by this adoption and the SvelteKit/Paraglide migration.

## Home connection and notification controls (0.1.83)

Project-wide adoption is required by `AGENTS.md`. Home connection fields consume
the pinned Select, Checkbox and Button controls. Approval uses a short aligned label,
is unchecked by default, and still confirms the specific Home/account link.
OAuth permissions give HomeKit its own category; offline and unknown scopes remain
under Connection. This presentation change does not alter grants or native policy.

Connections place their actionable Review control inside the warning area and show
granted actions as wrapping catalog Tags. Only the existing actionable upgrade
predicate determines warnings and Review visibility.

Each notification event retains its own catalog Toast. The bounded ToastRegion
anchors to the visible viewport's lower end and keeps history above new messages.
Consumer adapters add entry/stack motion, rightward swipe dismissal and focus
recovery, with reduced-motion support. Messages remain until individually dismissed;
new messages never steal focus. The pinned catalog's history action remains English.
Source/type/regression checks do not establish physical iOS Safari visual acceptance.

## Requirement-based Studio setup

The language selector sits on the right of the navigation bar, sharing its row
and divider. Overview has separate service, accounts and capabilities cards. Loading uses
skeletons only before the first snapshot. Refreshes retain loaded content and card
dimensions while the upper-right refresh icon shows activity. Module configuration
uses a labeled gear icon button. Refresh, settings and add glyphs use the pinned
DecompozR Icon catalog geometry and its 16px compact/stroke-2 recipe, with the
Lucide notice bundled. No independently drawn refresh/settings glyph remains.
Navigation has no inter-tab gap and a shared active marker uses native cross-document
view transitions in supporting browsers, with reduced-motion opt-out. Account summaries distinguish
stored app passwords from saved Apple Account web sessions. A saved authenticated
session is not live-provider or cross-service acceptance.

App-password entry and the existing Shared Album web session use separate shared
modals. Public signed OAuth connection uses the app-password modal; Apple session
management remains owner-only. Transient passwords and verification codes clear
before submission and when their components close. Native dialogs restore focus,
keep notifications visible above the backdrop and prevent closing pending requests.
Action results use translated toasts. Failed refreshes retain observations with
persistent stale-state labels and an error notification.

Setup is driven by missing requirements, with Tailscale instructions, owner
registration, credential entry and explicit Photos permission controls. The legacy
setup URL remains available as a requirements dashboard. No wizard step sequence
or automatic native permission prompt remains. New installations seed every Mail,
Calendar and Photos capability disabled. Existing stored policy choices and OAuth
grants survive upgrades. Enabling proposes minimal read, then requires completion
and explicit confirmation; disabling and cancellations preserve persisted state.
The backend rechecks stored credentials or Photos readiness before elevation.

## Historical design decisions (superseded where conflicting)


Setup, administration, sign-in and consent belong to one iCloud plugin. They must share the existing setup interface's teal palette, system typography, quiet page background, white bordered cards and compact actions. Authentication must not introduce a different blue button or oversized layout.

The shared `src/ui` module owns visual tokens, styles and decorative brand/Passkey icons. Pages reuse these primitives; authentication does not carry a second stylesheet. Primary buttons use teal, secondary actions use a pale neutral surface, focus is visible, disabled actions remain recognizable, and errors use the same warm error surface. Icons supplement readable translated labels and are hidden from assistive technology.

Keep the setup wizard's compact copy fields, section icons and step order. Auth pages use the same outer spacing and card treatment with a narrower reading width. On small screens retain page gutters and wrapping actions; long client identifiers wrap. English remains the default through existing i18next resources. No routes, authentication flow, browser ceremony, or content security policy changes are part of this work.

Acceptance: setup and both auth pages render the same shared styles and branding primitive; setup registration and sign-in use the same Passkey icon; primary and secondary actions have explicit variants; live status remains accessible; existing continuation, return destination, translation and setup page tests pass. Source checks do not establish physical Passkey or external client success. Deployment is a separate step while live user testing is ongoing.

The ChatGPT tutorial has seven ordered steps: open ChatGPT in a web browser, enable Developer mode, create the MCP server, configure authentication, create the plugin, authorize, and try it. The developer-mode step preserves bold interface labels and states the plan/workspace permission prerequisite. This source change does not assert a successful live ChatGPT installation.

Verification: targeted setup/auth page tests pass (8 tests, 56 assertions), covering shared styles/icons, translated tutorial order, safe emphasis, continuation filtering and private return destinations. No live service restart or deployment was performed for this change.

## Administration shell and onboarding

The private administration surface is the lasting home for one iCloud account. Initial setup appears as a focused wizard inside the same application shell; an enrolled owner opens the dashboard without repeating enrollment. The dashboard presents the stored-credential status, account identity only in masked form if returned, effective service capabilities, and existing real credential rotation/removal actions. It must never prefill or return an App-specific password.

Service capability policy and OAuth grants are separate: enabling sending permits a client to request `mail.send`, but does not upgrade existing grants. A send control must call an authenticated, origin-checked persistence handler and show the returned effective policy. Until that handler is available, no decorative toggle is shown. Multiaccount management is deferred.

A project-owned minimal black cloud silhouette on white is shared by the shell and a downloadable 256×256 PNG (under 10 KB) for the ChatGPT creation form. The mark uses a single smooth cloud contour with generous whitespace, no envelope, colored tile, gradient, or Apple logo tracing. The SVG is the vector reference; the PNG and shared inline shell icon reproduce its contour. The existing interface palette stays unchanged. Download is a local static asset, not an upload or installation action. The setup tutorial supplies the download control. Existing private listener, trusted Tailscale access, owner Passkey checks and CSP remain authoritative.

Acceptance covers fresh setup, enrolled dashboard, rotated/revoked credentials, policy errors and consent explanatory copy; synthetic fixtures do not prove live iCloud authentication. Keep the onboarding step focus/error behavior and reload recovery. No credentials, mail, or new grants are exercised during UI implementation.

## Pinned language Menu

The language control now consumes the actual DecompozR Menu and Icon components,
with their unmodified token/internal dependencies pinned at the same design-system
revision in Studio. It no longer uses a browser-native select in the admin navbar.
The selected locale is visible in the trigger and checked action. Menu keyboard,
focus, viewport positioning and compact spacing come from the upstream component.
English/Traditional Chinese state and cookie persistence remain Studio-owned.

## Persistent admin shell (0.1.70)

The four admin destinations share one mounted Svelte shell. The left icon rail
uses 44px controls and a constant-height selected background. Only the marker
position transitions with CSS; whole-document view transitions are off.
Owner status validates each shallow navigation. Back uses latest-response fencing;
open modals and pending operations block it. Overview uses one column and explicit
Mail, Calendar, Photos module order. Path copy controls use full values and toasts.
Clipboard acceptance uses disposable fixtures, not the live clipboard.

## Static completed requirement markers (0.1.78)

Loading and completed requirement markers use distinct DOM branches. The spinner
node is removed on completion; static markers explicitly use no animation or
transform. Disposable browser acceptance verifies both Photos checkmarks have
zero animations before and after recheck, and the old loading node is disconnected.
Chrome fixture evidence does not establish physical iOS Safari acceptance.

## Compact admin actions and account cards (2026-10-07)

Owner-requested scope: put Add (+) beside Refresh, group each account identity,
credential/session status and actions in one card, replace application action
buttons with catalog icons and hover explanations, reduce default admin prose,
and match the cloud's rendered stroke to the navigation icons.

Acceptance: all product action buttons use the shared catalog Button adapter with
translated accessible names and explanations; preserve disabled/pending behavior,
form submission, confirmation and modal focus. Account status stays visible and
separate from actions, including unknown/stale observations. Supplementary help
and diagnostics use progressive disclosure; fields and explicit consent remain
readable. Check desktop/mobile rendering, keyboard explanations, dialogs and
notifications using disposable fixtures. Keep pinned vendor sources unchanged.
Menu option labels remain readable choices inside the pinned menu; its trigger
is an icon. No release, merge or installation is authorized by this task.

Plan: shared action adapter and button inventory; account cards and compact
admin details; shared logo and generated assets; build/type/regression and
browser self-checking. The current task worktree owns fixture artifacts under
ignored `.flow-runtime/admin-redesign/`; retain source for local review.

Source implementation: Accounts and Overview reuse AccountCard. Add (+) and
Refresh share the header; credential/session status uses catalog Tags independently
of edit/session/removal icons. Missing observations remain unknown and refresh
failures retain a visible stale-state notice. Statistics icons and numbers are
both 16px. Module status and each enabled permission use Tags; the unchanged pinned
Switch proposes the existing configuration dialog and preserves persisted policy
until save. The icon rail is fixed with no inner scroll; short viewports hide only
the decorative brand so navigation stays available.

ActionButton consumes the unchanged catalog Button and Icon with translated
accessible names, native hover explanations and keyboard-focus explanations.
Legacy button recipes no longer override the catalog. The catalog has no critical
Button variant: the shared adapter explicitly extends its face variables with
existing critical semantic tokens, preserving disabled/loading and focus behavior.
The existing project-owned Passkey glyph is preserved as the established
non-catalog authentication icon; it is sized through the same control metrics.
Language uses an icon trigger while menu options remain readable choices.
Supplementary connection, reset and Home helper help and System diagnostics use
disclosure. Consent and destructive impact/confirmation text remain visible.

The cloud stroke is 13.333333 in its 256px viewBox: at 32px it matches the 20px
navigation icon's stroke-2 recipe (1.666667px). SVG/PNG exports were regenerated.
The unused legacy HomeKit string renderer is unreferenced by the application;
active HomeKit uses Studio and the shared adapter.

Self-checking: full application build and Studio/application type checks pass
with zero Svelte warnings. Studio passes 23 tests including icon-only actions
across admin/auth/credential/Photos routes; application passes 512 tests. The
legacy auth assertion was updated to the catalog's secondary recipe, retaining
its Passkey and denial semantics. Desktop Chrome fixtures visibly confirm account
cards and matching density, and computed readback confirms icon-only named actions,
16px statistics and fixed/visible-overflow rail. A switch opens the existing
configuration dialog. The native discard confirmation blocks browser automation;
cancellation outcome, mobile wrapping, final critical-color readback and modal/toast
placement remain unverified. Source checks are not visual or installed acceptance.
Local-only delivery: no push, PR, merge, release or installation is part of this
request. The task checkout is retained. Recovery fixture, state and raw test/build
logs remain in ignored `.flow-runtime/admin-redesign/` while browser verification
awaits dismissal of the Chrome native confirmation. Flow reflection is deselected.

## Toast mouse drag completion (2026-10-07)

Observed defect: SwipeToast waited for pointerup, so a mouse released outside the
browser could leave a toast stranded mid-drag. Acceptance is dismissal completing
without an in-window release once a mouse right-drag reaches the existing 64px
threshold. Short/left/vertical drags stay reversible; touch/pen retain release-based
completion. The adapter commits mouse dismissal during pointermove, fences other
pointer IDs, settles lost capture and resets uncommitted drags on window blur.
Catalog Toast remains unchanged, with existing exit/focus and reduced-motion handling.

Toast self-checking: Studio build, typecheck (zero errors/warnings) and 25 tests
pass. In the final compiled Chrome fixture, a 40px right-drag/release restores
0px with the toast retained. An 80px drag removes the toast after its exit transition
while the mouse button remains held and no pointerup has been sent; moving/releasing
outside the 1238px viewport afterward does not strand a card. A subsequent blur/cancel
cannot reset an already-committed exit. This is Chrome input/DOM evidence, not a
physical Safari window-edge or iPhone acceptance claim. The production installation
is unchanged. A screenshot of the empty notification area is retained under the
chat's visualization artifacts as `toast-dismissed-before-release.png`.

The restored browser fixture also verifies 390px width without horizontal overflow,
fixed rail, 16px statistic glyphs/numbers and critical action color. Account identity
now occupies a full mobile row above its actions to avoid narrow email wrapping.
Earlier native discard-confirmation/cancellation checks and physical-device checks
remain unverified. Task-owned preview processes are stopped after self-checking;
raw logs are reconciled here and removed. The fixture script and task metadata remain
for resuming those broader checks. No merge, publication or installation occurred.

## Fixed admin shell and content scrolling (2026-10-07)

The owner clarified that document/body scrolling and the large centered-content
gap are defects. Normalize admin layout ownership: fixed viewport-sized main,
a non-scrolling rail within that shell, and one scrollable content pane. Remove
the 60rem centered width and consume available space beside the rail using pinned
spacing/control metrics. Root/body overflow rules apply only to the admin/setup
shell; auth pages retain normal document scrolling. Acceptance: document scroll
stays zero while the content pane scrolls; rail bounds remain stable; the content
starts one catalog gap after the rail; desktop/mobile have no horizontal overflow.

Shell source self-checking: Studio build/typecheck pass with zero Svelte warnings;
25 tests pass. Explicit `minmax(0,1fr)` row sizing bounds the scrolling pane, safe-area
insets preserve the rail controls, and shallow navigation resets the pane to its top.
Current live visual acceptance is unavailable: CUA lists no connected browsers and
Safari reports `cgWindowNotFound`. The screenshot's 0.1.87 legacy controls
are not evidence of this task branch being installed. Do not claim the fixed shell
has been deployed or visually accepted. Local changes remain reviewable on the task
branch, pending browser acceptance and separate merge/install authorization.
## Connection action and permission color refinement

The owner requested a distinct Review new capabilities button, no focus-ring visuals
throughout this application, and different colors for granted actions. Review uses
the pinned secondary Button's default bordered appearance inside its warning; other
quiet actions retain their existing recipe. Shared application CSS suppresses focused
outlines/shadows, including the programmatically focused connection-list container.
Focus, keyboard navigation, dialog recovery and handlers remain operational.

PermissionTag reuses the unmodified pinned Tag geometry and typography. The pinned
Tag only exposes neutral/sage tones; additional semantic colors are an explicit
consumer extension, not a vendor change: read uses informational blue, edit/definitions
sage, outbound/schedule/share warm amber, and delete/control critical rose. The shared
adapter consumes catalog semantic tokens; labels remain visible and authoritative.

Chrome fixture self-checking confirms all four badge color roles, bordered Review,
no focused outline/shadow in the review dialog, and normal Review/Cancel interaction.
The 390px viewport wraps badges and Review without horizontal overflow. Screenshots
use synthetic accounts/grants; this does not establish physical iPhone acceptance.

Release 0.1.86 deployed from clean verified remote main
`6734ad43667dc08004957339817ec48b3ec8a859` after PR #106. Signed provenance,
installed payload hashes, health/doctor and protected config/custody readbacks passed;
owner/Home policy, binding and OAuth grants were unchanged. The actual authenticated
Chrome Connections page also confirmed the four badge colors, bordered Review and
no connection-list outline. No actual Review confirmation or grant update occurred.
Private receipts/screenshots remain in `.flow-runtime/homekit-background/connection-visuals`.
Physical iPhone checks remain unverified. HomeKit physical control stays disabled.


Granted actions now reuse the existing permission-category mapping in fixed module
order: Mail, Calendar, Photos, HomeKit, then unknown Connection scopes. Each module
has a compact catalog-typography label and its own wrapping badge row. The owner
explicitly chose to retain the existing semantic colors; colors represent permission
meaning, not whether a capability is new. Existing grants and Review semantics do
not change. Grid spacing uses pinned tokens; vendor controls remain unchanged.
Chrome fixture checks confirm Mail/Calendar/Photos/HomeKit label order, all 12
fixture badges retained, and no horizontal overflow at desktop or 390px width.
The 547 existing application/Studio/tooling tests and full build/typechecks pass
with zero Svelte errors/warnings. These are self-checks, not physical iPhone proof.

Release 0.1.87 deployed from clean verified remote main
`34f13f0f0e7178ec2887781b791128ef10923998` after PR #108. Signed receipt,
installed payload/protected-file readbacks and health/doctor passed. The actual
Chrome connections retained 7/12/3 badges and now show their applicable module
labels in canonical order. Grants, binding and policies remained unchanged.
Private screenshots and rollout receipts: `.flow-runtime/homekit-background/grouped-permissions`.
The exact fixture server was stopped; the production page remains available.


Home module settings use a short readiness status and one connection-consent footer.
The embedded dialog omits the helper/Dock implementation note and duplicate linking
explanation. Standalone linking retains its brief no-device/no-permission-change
notice. Explicit unchecked Home-link approval and all handlers remain unchanged.

Release preparation: integrate the latest grouped Connections presentation without
changing its permission colors or focus appearance policy. Version 0.1.88 includes
the account/action/switch/logo, toast and fixed-shell changes. The integrated
checkpoint passes Studio/application/tooling type checks and build, 550 unit tests
and 11 HTTP E2E tests. Repository Actions has no configured workflows; remote CI is
not claimed. The authorized deployment retains the prior release and signed helper.

## Installed admin redesign 0.1.88

PR #110 merged at `c77b1ae6e51296533e764db38e3d232e1eb1991e` and the clean,
remote-verified main source produced the local 0.1.88 release. The shipped update
command installed it at the existing native prefix and started the installed CLI.
All 14,698 artifact files/symlinks match installed payload readback. The existing
signed HomeKit helper was reused from its verified Release receipt because its
source SHA256 matches main; no native authorization or configuration was changed.

The running and installed system readbacks both report 0.1.88; health, private
admin and protected system status return 200. Both linked compiled stylesheets
return 200 and contain the fixed viewport/content-scroll shell, while the document
contains the icon-action adapter and admin-only body scroll lock. This is actual
installed HTTP acceptance, not computed-style or browser visual acceptance.
All 13 doctor checks pass. Config/custody bytes and modes match before deployment;
both databases pass integrity checks and owner, policy, bindings and client grants
remain unchanged. Only runtime-owned OAuth resource/rate-limit tables changed on
startup/readback. The 0.1.87 release and protected stopped backup remain usable for
rollback. The archive SHA256 is
`baa33819d8b562fabf0350e51cf48b8e0362687048bafdf804734dd39ba46b10`.

Private deployment receipts are retained at the existing runtime's
`deployments/admin-redesign-0.1.88/`; backup is
`backups/pre-0.1.88-admin-redesign/`. Source verification passed 550 unit tests and
11 HTTP E2E tests; GitHub Actions has no configured workflows, so remote CI is N/A.
No browser is currently connected and Safari's native window lookup is unavailable:
final installed scroll/spacing/toast visual acceptance, native discard cancellation,
mobile dialogs/toast placement and physical iPhone acceptance remain unverified.
