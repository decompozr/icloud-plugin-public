# HomeKit integration into the current runtime

Status: source integration and signed native-local acceptance; not deployed yet.
The retained `plan-homekit-end-to-end` branch preserves prior experiments and
roadmap. This branch ports its provider contracts/module into the current Studio
and Web-standard MCP host without replacing the current application architecture.

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
Policy starts disabled; the private owner System panel checks helper readiness and
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
synthetic data or contractual permission follows from type conversion. The owner's
request for a stricter public abstraction remains unresolved; default-disabled
policy and fresh owner/client consent must not be bypassed during activation.

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

Remaining work: package the v0.14 helper from reviewed main, install/configure the
optional module, owner account/Home enrollment, explicit public data contract,
real same-connection consent/tools/read acceptance, actual native push and remaining
sleep/logout/journal retention behavior. No existing Home automation was changed.
