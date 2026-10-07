# HomeKit integration into the current runtime

Status (2026-10-07): deployed locally in 0.1.83 from main commit
`b0794a2d0eef238c6b13c234a752eeb03baf0035`. **The complete HomeKit roadmap is not
accepted.** The retained `plan-homekit-end-to-end` branch preserves the original
roadmap and experimental evidence. This document tracks the current production
module, which intentionally exposes a narrower subset.

## Acceptance boundary

| Capability | Current production state | Remaining acceptance |
| --- | --- | --- |
| Native physical control | Original native experiments verified selected light/garage writes; helper supports controls | Not registered in the production MCP; needs distinct control consent, reviewed exact-target operations, durable no-retry outcomes, and real authorized client/provider acceptance |
| Home reads and binding | Optional module installed; owner linked a Home/account and enabled read policy | Fresh same-client consent, tool loading and actual enrolled-Home read through that client remain unverified |
| Scene/automation definitions | Review/apply tools for app-owned scenes and supported disabled calendar/characteristic triggers; local native evidence retained | Broader subtypes, physical scene execution and automation enable/disable are incomplete; do not edit existing household automations under this acceptance |
| Events | Scoped resource/session transport and fixture reliability checks; actual native reads/subscriptions verified locally | Real client natural push, disconnect/restart/revocation delivery acceptance |
| Packaging | Signed Release helper installed with provenance, retained rollback and live service health | Sleep/logout/login lifecycle, optional removal and journal retention acceptance |

The original roadmap's M1 rich reads and bounded M2 definition slices are accepted
locally. M3/M4 have source and deployed infrastructure evidence, but not complete
real-client acceptance. M5 packaging/install is accepted for this local installation;
its broader lifecycle checks remain open. Neither experimental control nor a signed
artifact establishes the entire module's completion.

## Next implementation slice: production controls

Register a separate `homekit.control` capability, disabled by default and requiring
fresh client consent. Bind every command to the verified owner/account/enrolled
Home and exact accessory/service/characteristic or scene/trigger ID. Add bounded
write, scene execution and automation enable-state contracts, preview/revision
checks where applicable, and persist intent before dispatch. Preserve unknown and
readback-mismatch outcomes without automatic replay or retry. Controls must not
inherit definition-management permission.

First implement and test source/fixture authorization and reconciliation without
operating a device. Live physical acceptance requires a concrete owner-approved
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
disabled triggers; physical control/scene execution is not included in this module.

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
