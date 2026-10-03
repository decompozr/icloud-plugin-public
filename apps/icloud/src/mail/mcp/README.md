# Mail MCP contributions

This folder translates Mail use cases into registered MCP tools. It owns `mail_*`
names, input schemas, operation annotations, scope requirements and Mail result/error
mapping. The shared [MCP host](../../mcp/README.md) owns protocol dispatch and obtains
this catalog from the module registry.

A call passes through host authentication/scope checks and the enabled-policy gate,
then the Mail schema and service. Read, write and send permission combinations are
part of each tool contract; server capability enablement does not upgrade a client
grant. The optional persistent-access tool requires explicit confirmation and asks
for authentication consent; it cannot grant itself `offline_access`.

The Mail test factory supports service/provider fixtures without configuring a real
owner installation. Colocated discovery/input/authorization tests cover the public
contract. [Mailbox tools](../../../../../docs/mailbox-tools.md) is the authoritative
operation catalog; avoid copying schemas here. Production Calendar tools are absent.
