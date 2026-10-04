# Application architecture

This document describes the source architecture, not the currently deployed
release. The application is one Bun service with a shared host and registered
feature modules. Mail and Calendar are registered source modules. Their availability is detected
per account, independently of operator action policy and OAuth scopes. Source
integration does not imply deployment or live-client acceptance.

## Feature ownership and shared infrastructure

Mail owns its domain, services, iCloud adapters, MCP tool definitions and durable
operation state under `src/mail`. The [Mail module](../apps/icloud/src/mail/README.md)
constructs them and contributes capabilities through the
[module runtime](../apps/icloud/src/modules/README.md). The shared MCP host receives
registered tool contributions; it does not import Mail services or implement a
mail/calendar switch. Domain and services are feature-owned code, not global
registries that each need to understand every feature.

The application composition root chooses modules and provides shared dependencies.
Owner identity, OAuth, public/private listeners, opaque credential custody and
operation tracking are shared infrastructure. See the complete
[source subsystem index](../apps/icloud/src/README.md) and [workspace](workspace.md).

```text
application composition
  ├─ owner auth / opaque owner storage / private admin
  ├─ account probes / consent snapshots / capability routing
  ├─ module runtime ← Mail and Calendar modules
  │                    ├─ tool contributions → services → domain ports
  │                    └─ policy + ledger       ↑ iCloud adapters
  └─ shared MCP host → registered tools
```

## Registration and request flow

Registration is explicit and static within the running application. Each module
owns its namespace, declares scopes and tools, and can supply lifecycle hooks.
The registry validates contributions before serving them. The host advertises
the union of enabled, available contributions across only the caller-authorized
accounts, intersected with operator policy, and checks required scopes before dispatch.
Modules own policy readers and invocation behavior; enabling a server capability
never expands a client's existing consent. The exact TypeScript registration
contract is maintained with [module runtime documentation](../apps/icloud/src/modules/README.md).

A Mail request flows from public HTTP to token verification, registered-tool
lookup and permission checks, Mail input validation, service preflight, provider
I/O and a typed response. Errors and unknown outcomes must survive this path.
The host does not infer success from a transport disconnect or retry an uncertain
write. Operation monitoring and listener draining preserve accepted work.

## State and security boundaries

The owner store owns exclusive enrollment, persistent bootstrap closure and opaque
encrypted credential bytes. Mail interprets those bytes and owns its operator
policy and outbound ledger. These responsibilities are separate even when SQLite
connections are shared. Capability storage adds version-bound service evidence and default-account tables
while preserving existing records and encryption contexts; no state is reset. The owner authentication DB
also persists Passkeys, sessions and OAuth grants. Caller-owned database handles
are closed by the application lifecycle, not by feature code borrowing them.

Public MCP/OAuth and private setup/admin use distinct listeners. Forwarded host
headers cannot choose private handlers. Private enrollment requires trusted
bootstrap access and owner Passkey enrollment. Public OAuth addition probes all registered services independently and requires at
least one success. Selection binds consent to immutable explicit account IDs; old
single-account grants retain their original boundary. Registered service metadata
never grants action privileges. The runtime validates `account_id` against the
grant and current eligibility before installing request-local selected identity;
ambiguous selection requires a choice. See [account capabilities](account-capabilities.md).

Opaque access tokens are checked through provider introspection with owner,
issuer, audience and scope checks. Key custody remains outside client artifacts
and database content. Source paths named `storage` contain implementation; mutable
state lives under configured runtime directories. [Setup/auth](setup-and-auth.md)
and [operations](operations.md) describe the operational contracts.

## Design choices and extension limits

Feature ownership prevents adding Calendar from changing Mail internals or the
shared MCP dispatch implementation. It does not require a dynamic plugin loader,
general dependency injection container or a universal provider model. Each feature
can have different domain rules and storage needs while sharing authentication
and transport. Multiple accounts are explicitly consented; hot module installation is not implemented.

The Calendar module declares its namespace, scopes, tools, CalDAV adapter and
persistence under `src/calendar`. The composition root registers it alongside Mail.
[Calendar production](calendar-production.md) records its contracts and limits; the
[feasibility report](calendar-feasibility.md) retains historical research.

## Documentation and acceptance

The repo is the deliverable: subsystem documentation, cross-module architecture,
operation contracts and tests must move with implementation. Every subsystem
README records its purpose, use cases, interfaces, dependencies, data flow,
security/state decisions and verification limits. Do not leave stale candidate
text next to current architecture and expect readers to infer which is authoritative.

Typechecks and unit tests validate source contracts; built E2E tests validate
application and protocol integration. Registration tests must demonstrate a
non-Mail contribution and disabled/unauthorized paths without a live provider.
Synthetic results are not evidence of live Apple, physical Passkey or deployed
client acceptance. [Current status](current-status.md) records dated evidence;
[research](research.md), [experiments](experiments.md) and `playground/` retain
historical candidate evaluations. Their older recommendations do not override
this source architecture. No release, installation or deployment is part of this
structural change.

## Mail safety rationale

Mail identities bind mailbox path, UIDVALIDITY and UID. Batch preflight rejects
invalid targets before writes when possible; later disappearance is represented
per target. Reads are bounded and preserve read state. Moves must use safe
selected-message semantics and must not silently downgrade to copy or global
expunge. Restore requires an explicit destination when the original is unknown.
Outbound idempotency records retain uncertain outcomes rather than inviting blind
retries. Exact budgets, result/error names and tool behavior live in
[mailbox tools](mailbox-tools.md) and the feature-owned domain types.
