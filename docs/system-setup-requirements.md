# System setup requirements

Owner direction, 2026-10-06: requirements should determine the next necessary action, rather than duplicate readiness checklists inside every feature module.

Desired order:

1. Establish the installation owner's localhost passkey through the existing OS-owner-authorized setup entry point.
2. Check the configured Tailscale route and connectivity.
3. If the configured Tailscale relying party lacks an owner passkey, use the existing owner-authorized pairing flow to open that origin and register it.
4. Enter administration once the applicable prerequisites are satisfied.

Tailscale and installation ownership are system requirements. They are removed from Mail, Calendar and Photos settings in 0.1.68. Modules retain only their relevant credentials, permission status and capability settings.

The ordered system gate is a requested design, not implemented acceptance. Existing code has local-owner and remote-owner pairing flows, but a generic count of owner passkeys does not prove both origins are enrolled. Implementation must establish trustworthy per-relying-party registration evidence, preserve current sessions/recovery, and test first setup, partial setup, existing deployments and expired pairing. Never grant enrollment merely because a request originated on localhost or Tailscale.

On a remote device, localhost addresses that device, not the service computer. When local setup is missing, explain that setup must first be completed on the service computer; do not blindly redirect a phone to localhost. Remote passkey registration must stay at the configured origin with the existing single-use owner-authorized transfer. No credentials or existing passkeys are to be deleted to enforce this sequence.

## Compact instruction pattern

Implemented UI pattern: completed requirements show a checkmark and collapse; missing requirements expand with one short instruction and a direct action. Checking and dependency-waiting states never claim success. Tailscale installation, connection and reachability are ordered. Photos metadata access and native access can be completed independently. After opening Photos authorization the view polls for up to two minutes and rechecks on focus; actual ready state collapses the relevant step. Long help stays inside a disclosure. Capability switches remain separate from system permission evidence.

Visual verification uses a disposable account/permission fixture, never real Photos UI automation. Native passkey gestures and the requested origin-specific system gating are separate from that fixture evidence.

## Deployed UI acceptance

Release 0.1.69 was built from merged PR #79, installed and payload-verified. Build/typechecks, 12 Studio tests, 436 application tests and 11 tooling tests passed; installed doctor passed 13 checks. Original-MCP Photos health reports native authorization=3. Browser verification used a disposable fixture, including automatic collapse after simulated permission completion and Calendar module requirements without Tailscale. No live permission prompts or photo mutations were automated. The 0.1.68 deletion configuration ceiling remains open, with saved owner policy and OAuth consent unchanged.

## Module dialog spacing correction (0.1.70)

The completed credential step and the Allowed actions heading both supplied a separator. Keep the step separator and remove the heading border and excess top padding. An empty allowed-action list explicitly says Empty (localized); it is not represented by unexplained whitespace. Verified: application build, Studio typecheck (zero errors/warnings), 12 Studio tests, and browser fixture inspection showing a single separator; the heading computed border and padding are both zero. Authentication gates remain unchanged.

## Compact notifications (0.1.71)

Notifications align to the right and shrink to their message, capped at 22rem and viewport width minus 4rem. Embedded notifications use the same compact card; empty notification stacks reserve no space. Refresh feedback says Updated. This release includes the 0.1.70 separator correction, which was merged but not deployed separately.

Verified: application build, Studio typecheck with zero errors/warnings, 12 Studio tests, and a 390px browser viewport. Updated notification measured 135px wide with a 16px right inset.

## Finite busy indicators (0.1.72)

A failed first Photos status request left both requirements in checking because no result existed. Failed requests now show the error state. Refresh arrows track their own awaited action instead of global busy flags, so unrelated controls do not rotate; completion replaces the animated element with a static one. Existing request timeouts remain in force.

Verified in the disposable browser fixture: completed refresh has aria-busy=false and animation=none; a failed first Photos request produces two error requirements with animation=none. Build, Studio typecheck, and 12 Studio tests passed. The exact icon observed on the remote phone is not yet identified.

## Compact language trigger (0.1.73)

The language trigger displays EN or 繁中 in its existing position. Expanded choices retain their full language names.

Service labels and values align vertically within each grid row, including the taller copy-button row. Account and authorized-connection totals use the matching navigation icons with hover titles and screen-reader labels.

Credential controls wrap according to available card width (14rem flex basis), rather than a viewport-only breakpoint. Narrow cards stack App password and Apple session; status pills do not shrink into labels.

Enabled scope totals also use an icon and count with a hover title and accessible label.

Browser fixture verified at 430px and 390px: credential controls occupy separate rows with scrollWidth equal to clientWidth; all Service label/value row centers match within 0.01px.

## Language in navigation (0.1.74)

Move the compact language trigger below the navigation icons in the 44px rail. Remove the separate toolbar row; preserve the same accessible language menu and full option names.

Accounts use a person silhouette and client connections use linked-chain geometry, consistently in navigation and totals.

The navigation rail starts at the viewport left safe-area edge instead of inheriting the centered page gutter. Content keeps its own gap and maximum width; the brand retains its text inset.

Credential controls and module toggle labels have 44px minimum touch targets on coarse pointers. Requested post-fix UI and UX audits follow deployment.

## Post-fix independent audits for deployed 0.1.74

Deployment source: f7c40c78c74aa39f5d891d22ba9553376745f50a. Installed payload matched 14,657 artifact files and all 13 runtime doctor checks passed. Two separate agents audited the matching-build fixture after installation.

- UI: rail left 0px / width 44px; EN menu fits the viewport; semantic account/connection icons; 44px credential controls and 44x44px module labels under coarse-pointer emulation; no overflow at 390px or observed 1238px desktop. Earlier touch-size findings resolved.
- UX: language selection focus and Escape return, Calendar dialog cancellation focus, settled refresh state and compact notification passed. No blocking finding in the checked flows.
- Nonblocking recommendation: hover metric titles have no touch equivalent. A tap explanation could improve mobile discovery; not implemented in this release.
- Limits: fixture rendering and interaction, not physical iPhone Safari, real remote authentication, Photos operations, screen-reader acceptance, or every screen. Existing per-origin passkey gating remains pending.
