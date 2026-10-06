# Shared interface design

## Current Surface design adoption (2026-10-06)

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

The original modular-link icon consists of three connected rounded square nodes,
without a cloud silhouette or Apple/iCloud artwork. One source in Studio generates
the inline glyph and 256px SVG/PNG download assets. Regenerate exports with
`bun run --cwd apps/studio render:brand`. This is an original project mark, not a
legal trademark-clearance opinion. Earlier cloud/teal/i18next sections below are
historical and superseded by this adoption and the SvelteKit/Paraglide migration.

## Current element styling contract

Administration, setup, sign-in and consent use the DecompozR Design System consumer guide (source revision `c0863d99015cfd6b039755f2f2fb94ce5ee47aa7`). Its Milk Green semantic roles, 14/20 body and label typography, 16/24 headings, 36px normal controls, 44px coarse-pointer targets, 4px control radius, 6px surface radius and 2px focus outline supersede the historical teal styling below. Preserve the iCloud identity and native semantic HTML. The shared UI stylesheet adapts the guide to this server-rendered application; it is not an installation of the Svelte component library.

All capability sections use the same labeled checkbox rows, explicit primary/secondary actions, confirmation treatment and persisted-state feedback. Text fields must not impose their width/padding on checkboxes. English and Traditional Chinese copy use the existing translation mechanism. Account instructions describe the selected account and shared iCloud credential accurately. Authentication and provider operations retain their existing handlers.

Verification for this adoption: application typecheck, declaration/browser build and 24 existing admin/auth tests (175 assertions) and 10 tooling tests (134 assertions) pass. Chrome inspection of the isolated fixture confirmed rendering, Calendar enable confirmation focus, saved effective state, and live English/Traditional Chinese switching. This is synthetic UI evidence, not a new provider or Passkey test. Dedicated phone-device and forced-color verification remains unperformed. Production has not been updated by this change.

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
