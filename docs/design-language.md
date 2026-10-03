# Shared interface design

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
