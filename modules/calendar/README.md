# Calendar module

Installable local package with separate `@decompozr/calendar/server` and
`@decompozr/calendar/ui` entries. The backend owns calendar/event domain and codec,
CalDAV discovery/gateway, use cases, encrypted operation/sync ledger, tool/scopes
and capability declarations. Studio renders the ordinary UI configuration.

The host injects the existing verified account invocation and operation monitor,
opaque credential store, SQLite and key custody. Calendar contributes declarations
to the existing runtime; no host implementation or duplicate registry is imported.

Scope/account/revision checks, default-disabled capabilities, recurrence limits,
provider concurrency limitations and unknown/replay semantics are unchanged.
The server entry remains separate from browser UI. See
[production contracts and evidence](../../docs/calendar-production.md) and
[the migration plan](../../docs/studio-server-migration.md). Source/fixture checks
are separate from actual provider and recipient/device acceptance.
