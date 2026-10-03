# Mail application services

Services implement Mail use cases independently of HTTP and MCP. `MailService`
coordinates bounded reads/search and selected-message mutations through domain
ports. Outbound, unsubscribe and extension services add their own validation and
execution rules rather than exposing raw provider commands.

Inputs flow from validated tool calls to service validation, operator-policy checks,
provider preflight, execution and a typed result. Identity, mailbox capability and
batch checks happen before writes where possible; later provider failures can still
produce partial or unknown results. Outbound work uses a durable ledger to preserve
replay decisions across restarts. A client disconnect does not make a completed send
safe to repeat. See [Mail contracts](../../../../../docs/mailbox-tools.md) for exact
limits, required confirmations and result semantics.

The module supplies providers, policy readers and ledger ports. Services do not
choose listeners, OAuth libraries or filesystem locations. Colocated tests cover
identity validation, selected-message operations, outbound replay/error paths,
extensions and unsubscribe policy with injected providers. These tests do not prove
live mailbox capabilities or subscriber removal. New feature behavior belongs in
its own feature module rather than being added to Mail services.
