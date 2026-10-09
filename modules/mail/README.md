# Mail module

Installable local package with separate `@decompozr/mail/server` and
`@decompozr/mail/ui` entries. The server owns mailbox domain/use cases, IMAP/SMTP
providers, tool/scope declarations, policy and durable outbound replay protection.
The UI declares ordinary configuration for Studio to render.

The host injects verified invocation lookup, operation monitoring, opaque account
storage, SQLite and key custody. Mail contributes its registration to the existing
host runtime; it does not import Studio/server source, create a listener or duplicate
the registry. The transitional application retains HTTP/MCP fixture composition and
auth presentation adapters until Studio assumes server composition.

Tool names, scopes, account identity, existing database names and unknown-outcome
rules are preserved. Account selection comes from verified invocation context, never
request arguments. Account/UI exports are separate from this server-only entry.

See [mailbox contracts](../../docs/mailbox-tools.md) and
[the migration plan](../../docs/studio-server-migration.md). Source/fixture checks
are separate from live provider and physical-device acceptance.
