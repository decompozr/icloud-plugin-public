# Application server and composition

The server runs the selected feature modules behind public MCP/OAuth and private
owner-management listeners. `application.ts` is the composition boundary: it wires
shared owner authentication, storage, module registration, diagnostics and admin
integration. It registers Mail and Calendar, supplies their independent read-only
credential probes, and constructs account access for caller-limited union/routing.
Concrete feature imports belong here, not in the shared MCP host.

`http.ts` owns HTTP transport, protected-resource discovery and authenticated MCP
requests. `bridge.ts` adapts Fetch handlers and validates configured hosts.
`lifecycle.ts` tracks admitted requests and graceful draining. `settings.ts` validates
explicit TOML settings; installation and prerequisite helpers support startup and
private setup. Startup does not install dependencies or compile source.

Public traffic cannot select the private router using forwarded headers. Private
access additionally checks its trusted local/proxy source and exact configured
Origin for mutations. OAuth authorization, owner sessions, bootstrap proof and
provider credentials remain distinct boundaries. See [setup/auth](../../../../docs/setup-and-auth.md)
and [deployment lifecycle](../../../../docs/deployment-lifecycle.md).

Shutdown stops new work and waits for accepted operations; losing an HTTP client
must not automatically cancel a write already accepted by a provider. The runtime starts before auth/UI assembly; later application-construction failure
unwinds started modules. Database connection ownership remains with the application
startup/teardown path. Colocated
settings/lifecycle tests and [built E2E tests](../../../e2e/README.md) cover local
configuration, listener isolation and draining. These do not prove deployed routing,
reboot reliability or live provider acceptance. Module selection is static; no
runtime package installation or hot reload is provided.
