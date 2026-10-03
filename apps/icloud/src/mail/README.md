# Mail feature module

Mail owns mailbox behavior end to end. Its use cases are listing/searching/reading
mail, organizing selected messages, composing and sending mail, managing drafts
and attachments, and bounded unsubscribe discovery/submission. The authoritative
user-facing contracts and limitations are in [mailbox tools](../../../../docs/mailbox-tools.md).

## Ownership and composition

`module.ts` assembles Mail's adapters, services, persistent operator policy and
outbound ledger, and contributes its tools and scopes to the shared module runtime.
The application selects Mail at composition time. The shared MCP host invokes
registered tools; it does not construct Mail services or know mailbox operations.

| Component | Responsibility |
| --- | --- |
| [domain](domain/README.md) | Mail identities, requests/results, errors and provider ports |
| [services](services/README.md) | Use-case validation, capability checks and safe operation sequencing |
| [icloud](icloud/README.md) | IMAP, SMTP, MIME and unsubscribe network adapters |
| [mcp](mcp/README.md) | Mail tool schemas, scope requirements and result mapping |
| [storage](storage/README.md) | Mail operator policy and durable outbound replay protection |

The dependency direction is MCP → services → domain ports ← iCloud adapters.
`module.ts` performs dependency injection; domain code does not depend on HTTP,
SQLite or the MCP SDK. Tool names retain `mail_*`; scopes retain `mail.*`.
`offline_access` is an authentication capability, not a separate mailbox operation.

`createMailModule(settings, dependencies)` returns `registration`, the compatibility
`config` view, and `admin` integration hooks. Dependencies provide the owner store,
auth database, master key, monitor and optional injected provider factories. The
application registers `registration`; admin receives credential validation,
capability accessors and `mailAdminPresentation`. `admin.ts` owns the Mail credential
section and policy labels. `consent.ts` owns English/Traditional Chinese scope
descriptions contributed to generic auth rendering. `observability.ts` owns Mail
outcome classification.

`config.ts`, `http.ts` and `mcp/server.ts` retain Mail-owned compatibility/fixture
composition APIs. Production uses explicit TOML settings and `createMailModule`,
not the legacy environment credential parser. These helpers do not create another
production listener or feature registry outside application composition.

## Data, security and compatibility

Each request uses the current owner credential and current operator policy. Mail
owns the interpretation of the stored credential as an Apple account address and
app-specific password. Shared owner storage treats its encrypted bytes as opaque.
Operator capability settings never grant OAuth consent: both server policy and
client scopes must allow an operation. Existing database table names and encrypted
ledger material are retained so moving source files does not reset replay history.

An outbound uncertainty must remain unknown and must not trigger a blind retry.
Removing stored credentials does not revoke an Apple password or client grant.
The service currently supports one owner/account; it does not provide a generic
multi-provider or multi-account registry.

## Verification and extension

Tests remain colocated in each owned component. Application typechecks and unit
tests run through `bun run typecheck` and `bun run test` from the repo root; built
protocol/application tests belong to [apps/e2e](../../../e2e/README.md).
Synthetic fixtures establish local contracts, not live Apple interoperability.

Calendar is not implemented. A future Calendar module should own its own domain,
services, adapter, tools and storage and register with the same shared runtime.
Adding it must not require editing Mail internals or teaching the MCP host Calendar
operations. Feature-specific enrollment UI and credential policy still need an
explicit design; the current private setup experience is for Mail.
