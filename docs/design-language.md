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

The selected cloud outline replaces the prior modular-link proposal. One source in Studio generates
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
