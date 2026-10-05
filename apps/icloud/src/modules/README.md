# Feature module runtime

`runtime.ts` is the application registry for independently owned feature
contributions. Its use case is composing Mail, Calendar, optional Photos and future modules
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

`context.ts` supplies request-local verified principal context so account-aware
modules resolve the selected account without a process-global mutable selection.
Modules still own their credential interpretation and per-account resources.

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
[architecture](../../../../docs/architecture.md). Synthetic contributions prove extension mechanics only; live provider and remote
client acceptance remain feature-specific. Admin setup and generated client content
still need explicit integration when another feature is implemented.

## Request identity

`context.ts` carries an immutable verified `{ownerId, accountId}` through
`AsyncLocalStorage` for one protocol invocation. The HTTP host supplies the bearer
principal; tool arguments cannot select or mutate this context. Concurrent clients
share registrations and resources while keeping their account identities separate.
Production Mail invocations require an account binding. Unscoped test/stdio callers
may use the explicitly migrated legacy account for compatibility.


## Generic capability onboarding and acceptance

Every module uses the same application flow: explicit composition, owner policy,
module scope descriptors, OAuth discovery/registration, signed consent, scoped
token validation, MCP tool discovery/invocation and provider results. Provider setup
is feature-specific; it must not create a separate authorization or MCP product.
Photos' Mac-library permissions are distinct from its remote OAuth client consent.

Track these observations separately: host availability and enabled policy; registered
client ceiling; requested signed scopes; displayed/selected consent; issued token
scopes; tools loaded in the actual assistant conversation; successful read/preview.
A build, deployment, advertised scope or reconnect alone does not close acceptance.

Adding a capability never silently enlarges existing clients, consent or tokens.
An eligible owner-bound client may use the supported explicit update followed by
fresh consent. A legacy anonymous registration with a narrower ceiling requires
a supported new registration; preserve working connections and grants. Determine
the host's actual supported route before instructing repeated reconnects. Never
rewrite signed authorization parameters or internal metadata to simulate approval.

A module delivery must test both fresh registration/consent and insufficient/disabled
paths through the shared auth and MCP boundaries, then verify the intended remote
client can discover and invoke its tools. Mutations require feature-specific exact
review/confirmation and outcome recovery. Historical/fixture results stay distinct
from owner-visible remote provider acceptance. See the active
[Photos plan](../../../../docs/photos-capability-plan.md) for current gaps.
