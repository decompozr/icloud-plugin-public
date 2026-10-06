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
