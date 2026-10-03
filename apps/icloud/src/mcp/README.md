# Shared MCP host

`server.ts` creates the protocol server from a `ModuleRuntime`, public resource URL
and verified client scopes, plus an optional operation-tracking callback supplied
by HTTP lifecycle integration. It implements discovery and dispatch over registered
contributions. It does not own Mail schemas, construct providers, parse mailbox
identities or import feature services.

Discovery returns enabled contributions even when a client's current grant is
narrower, so a client can discover an available operation and request additional
consent. Invocation looks up the currently enabled tool, applies optional intent
validation, checks all required scopes and invokes its registered callback through the runtime
so teardown waits for accepted work. HTTP tracks the tool operation itself, not an
SDK transport promise that can remain pending after a client disconnect. Missing
scopes produce an MCP authentication challenge tied to the configured protected
resource; this requests consent and does not authorize the call itself. Unknown
or disabled tools fail without executing a callback.

HTTP listener/authentication ownership remains in [server](../server/README.md).
Tool schemas, provider result translation and feature-specific monitoring belong
to the contributing module, such as [Mail MCP](../mail/mcp/README.md). No database,
credential store or persistent connection state is owned here.

Registry/host and Mail MCP tests cover generic registration, discovery and rejected
calls as well as Mail compatibility. Client catalog refresh and interactive OAuth
consent require separate client acceptance. Adding a module should require new
registration at composition, not another condition in this dispatcher.
