# Account service capabilities

This shared subsystem separates provider evidence, owner enablement and caller
consent from feature action policy. `capabilities.ts` defines the registered-service
probe contract and safe persisted evidence. All probes run independently; at least
one success is required to accept a new credential. Generic failure stays unknown.
`ServiceUnavailableError` is reserved for affirmative provider evidence; current
production adapters do not emit it for generic authentication errors.

`access.ts` resolves only verified grant IDs through the owner store. It builds the
safe account catalog, computes eligible accounts per service and selects an explicit
ID, an authorized eligible service default, or the sole eligible account. Ambiguity
requires a user choice; an explicit unavailable ID never falls back. No credentials
are returned by this layer. The runtime consumes this contract before dispatch.

`presentation.ts` provides the shared admin/consent DOM checklist and validated
metadata schemas. Availability and enabled state are separate checks; unknown and
unavailable services have disabled controls and honest reasons. Registered Mail and
Calendar are shown; unimplemented services are absent. Authentication/CSRF remain
the owning handler's responsibility.

Persistent evidence, credential revision guards and service defaults belong to
[owner storage](../storage/README.md); immutable selected-account consent snapshots
belong to [auth](../auth/README.md). This subsystem does not own provider adapters,
OAuth tokens, action policy, or transport lifecycle.

`capabilities.test.ts` exercises probes, migration/reopen, revision races, admin
rotation, MCP union/routing and Calendar account identity using synthetic providers.
[Full acceptance](../../../../docs/account-capabilities.md) distinguishes these
checks from live provider/client verification.
