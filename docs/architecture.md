# Application architecture

Account and Mail backend ownership have moved to `modules/account` and `modules/mail`; server/process ownership
remains in the transitional app until the next phases. See [the accepted Studio
server migration](studio-server-migration.md).

This document describes the source architecture, not the currently deployed
release. The application is one Bun service with a shared host and registered
feature modules. Mail and Calendar contribute feature-owned capabilities; optional
Photos uses the same shared host and authorization flow with a Mac-local provider.
Installed release and live remote acceptance are separate evidence. See the
[generic capability contract](../apps/icloud/src/modules/README.md#generic-capability-onboarding-and-acceptance).

## Feature ownership and shared infrastructure

Mail owns its domain, services, iCloud adapters, MCP tool definitions and durable
operation state under `modules/mail/src`. The [Mail module](../modules/mail/README.md)
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
  ├─ module runtime ← Mail module
  │                    ├─ tool contributions → services → domain ports
  │                    └─ policy + ledger       ↑ iCloud adapters
  └─ shared MCP host → registered tools
```

## Registration and request flow

Registration is explicit and static within the running application. Each module
owns its namespace, declares scopes and tools, and can supply lifecycle hooks.
The registry validates contributions before serving them. The host advertises
currently enabled contributions and checks required scopes before dispatch.
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
connections are shared. The refactor retains existing file/table names and key
contexts; it is not a database migration or reset. The owner authentication DB
also persists Passkeys, sessions and OAuth grants. Caller-owned database handles
are closed by the application lifecycle, not by feature code borrowing them.

Public MCP/OAuth and private setup/admin use distinct listeners. Forwarded host
headers cannot choose private handlers. Private enrollment requires trusted
bootstrap access and owner Passkey enrollment. Public OAuth selection/addition
validates Mail credentials and binds each grant to one stable account; a new feature's setup and credential
requirements need an explicit integration contract rather than assumptions that
all iCloud services use IMAP credentials.

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
and transport. Multiple accounts and hot module installation are not implemented.

A future Calendar module would declare its own namespace, scopes, tools, CalDAV
adapter and persistence needs, then be selected by the composition root. This is
an extension direction, not a shipped Calendar feature. The
[Calendar feasibility report](calendar-feasibility.md) remains bounded research.

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
[research](research.md), [experiments](experiments.md) and the
[prototype archive](research/retired-prototypes.md) retain
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
