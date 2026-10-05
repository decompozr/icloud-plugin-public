# K0 native peer identity controls

Status: **connection controls observed; message-origin gap reproduced; K0 not
passed** (2026-10-05). This is a bounded synthetic probe with a Bun runner, not a
production broker or Keychain migration. No credentials, Keychain APIs, installed
signing identities or user configuration are accessed.

The runner orchestrates compilation, ad-hoc hardened signing, subprocess lifetime,
result checks and cleanup in Bun. The native C fixture supplies the Security
framework/code-identity controls; stock Bun cannot serve as a fixed-entry approved
application, as the [earlier probe](runtime-boundary.md) demonstrated. This fixture
does not select the production runtime language. Bun's FFI calls Darwin socket
APIs for the descriptor-transfer control; local compiler/SDK layout measurements
are checked before constructing native buffers. No Python runner is added.

The broker obtains `LOCAL_PEERTOKEN` from a Unix socket and uses
`SecCodeCopyGuestWithAttributes` with `kSecGuestAttributeAudit`, then checks the
live code against the approved fixture's exact CDHash. Request PID/path claims
are ignored. It emits only a fixed nonsecret authorization decision. The test
harness configures the requirement; no product endpoint for choosing requirements
or credential selectors is proposed.

## Observed controls

[Retained evidence](peer-boundary-evidence.json) is same-agent execution on macOS
27.0.1. Approved bytes stayed unchanged and strict signature checks passed.
Independent source/raw-evidence review accepted the bounded finding and cleanup;
the reviewer did not rerun the probe or certify a production boundary. The Bun
runner also passed a standalone TypeScript check using the existing compiler.

| Case | Result |
| --- | --- |
| Approved native fixture and byte-identical copy at another path | Allowed. |
| Changed build with same identifier; different identifier | Denied by requirement. |
| Same-user Bun with fabricated PID/path claims | Denied by requirement. |
| Native fixture with Bun environment switches | Allowed; this C fixture has no JS loader. |
| Approved fixture delegates connected FD; Bun sends request | Denied by requirement. |
| Bun sends request; approved donor writes later byte before validation | **Allowed** for the original unapproved request. |

The final negative control is deliberately synchronized: the approved donor sends
its connected FD through `SCM_RIGHTS` and remains alive. Bun sends `deferred`; the
broker reads it and replies `held`. Bun then asks the donor to write `!` through
the same FD. Only after that byte does the broker obtain the socket token, which
passes the approved code requirement. This proves that this lookup does not bind
the original stream message to its sender. It does not establish a vulnerability
in the existing plugin or credential extraction; no such product broker exists.

Apple's [socket definitions](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/un.h)
and [kernel implementation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/uipc_usrreq.c)
support this interpretation: peer-token lookup uses the peer socket's `last_pid`
to retrieve a current task token, rather than the origin of a prior stream message.
The installed SDK and local reproduction establish the current-machine result.

## Consequence and limits

Do not release credentials based on this Unix socket check alone. The next channel
candidate is message-bound XPC identity. The installed public Security SDK exposes
`SecCodeCreateWithXPCMessage`; actual packaging, availability, sender binding,
delegation/races and mutual broker authentication remain unverified. No private
XPC token API was used. CDHash pinning authenticates one particular build: the
denied rebuilt fixture explicitly does not prove ordinary-update continuity.
Production signing/renewal, the actual sealed runtime, Keychain API/accessibility
and OS lifecycle remain separate gates. Both migrations in the
[dual plan](../../docs/keychain-migration-plan.md) remain required and gated.

## Reproduction

```sh
bun playground/keychain/run-peer-boundary.ts
```

Uses existing Bun, `xcrun` and `codesign`; installs nothing. The runner prints an
owner-private temporary record directory containing raw results and summary.
Every child is observed terminal before task-owned payload/socket cleanup. Raw
records are retained until review/reconciliation, then only exact owned paths
may be removed. The negative interleaving result is checked as a reproduced gap;
a changed result fails reproduction and requires investigation, never an automatic
K0 pass. These recipes are not run during setup/build/runtime.
