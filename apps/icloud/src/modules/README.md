# Feature module runtime

`runtime.ts` is the application registry for independently owned feature
contributions. Its use case is composing Mail today and another feature later
without editing the shared MCP host or Mail internals. The composition root
constructs modules and calls `register` before `start`; this is static composition,
not runtime package discovery, installation or hot replacement.

## Contract and namespace ownership

`RuntimeModule` declares an `id`, `scopes`, `tools`, and optional async `start` and
`dispose` hooks. `ScopeDescriptor` carries its name, title, description and dynamic
`enabled` predicate, plus optional `descriptionLocales` keyed by locale. Features
own their consent translations; the host forwards them without feature-specific
label lookup. `RegisteredTool` carries the MCP `tool` descriptor,
`requiredScopes`, dynamic `enabled`, `run` and optional `validateIntent` callback.

IDs are unique lowercase alphanumeric identifiers beginning with a letter. A
module's scopes use `<id>.…`; its tool names use `<id>_…`. Duplicate IDs/scopes/tools
and tool requirements outside the module's declared scopes are rejected before
registration mutates the registry. `offline_access` is the explicit shared auth
exception. Namespaces are ownership boundaries, not a security sandbox: registered
code is trusted application code.

`declaredScopes` feeds auth registration; `allowedScopes` evaluates current policy.
`listTools()` and `tool(name)` expose only contributions whose tool and required
scope policies are enabled. Client consent is checked separately by the MCP host.
Disabling a feature capability therefore affects discovery and subsequent dispatch
without granting or rewriting any OAuth scopes.

## Lifecycle and resources

Start runs in registration order. Cleanup runs in reverse order, includes a module
whose start failed, and continues through disposal failures. Disposal is idempotent;
multiple failures are aggregated. Registration closes when startup begins.
Modules must only dispose resources they own: borrowing the application's database
or monitor does not transfer ownership. The registry itself persists no state.

`invoke` tracks registered callback execution independently of feature telemetry.
Disposal closes runtime invocation admission and waits for active callbacks before
running cleanup. The application also owns listener admission/draining and invokes
module teardown before closing shared databases. Registry hooks alone do not start
a server or drain HTTP.
Feature-specific schema initialization remains within the owning module rather
than a global migration engine.

## Verification and limits

Colocated registry/host tests exercise non-Mail contributions through real HTTP/MCP,
namespace conflicts, policy changes, unauthorized dispatch, lifecycle failure cleanup
and waiting for active callbacks during disposal. See
[architecture](../../../../docs/architecture.md). A synthetic Calendar
contribution proves extension mechanics only; no production Calendar module or
CalDAV behavior is delivered. Admin setup and generated client content still need
explicit feature integration when another feature is implemented.
