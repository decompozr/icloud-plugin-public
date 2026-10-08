# Mail MCP contributions

This folder translates Mail use cases into registered MCP tools. It owns `mail_*`
names, input schemas, operation annotations, scope requirements and Mail result/error
mapping. The shared [MCP host](../../../../apps/icloud/src/mcp/README.md) owns protocol dispatch and obtains
this catalog from the module registry.

A call passes through host authentication/scope checks and the enabled-policy gate,
then the Mail schema and service. Read, write and send permission combinations are
part of each tool contract; server capability enablement does not upgrade a client
grant. The optional persistent-access tool requires explicit confirmation and asks
for authentication consent; it cannot grant itself `offline_access`.

The Mail test factory supports service/provider fixtures without configuring a real
owner installation. Colocated discovery/input/authorization tests cover the public
contract. [Mailbox tools](../../../../docs/mailbox-tools.md) is the authoritative
operation catalog; avoid copying schemas here. Calendar contributes its own separate tools.

Production account-bound registrations validate `accountId` on every message target,
batch and search cursor before accessing a provider. IDs assert the account of an
observed reference; they never select an account. Returned references include the
connection's stable account ID while preserving provider UIDVALIDITY. References
without account IDs are accepted only for the migrated original account.

`mail_get_profile` accepts strictly empty arguments and requires `mail.read`.
Its `openai/profile` metadata and output schema identify the connected account with
stable `id`, display `name`, and `email`. Structured content and text contain the
same top-level profile object, with no credentials.
