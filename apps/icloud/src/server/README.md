# Application server and composition

The server runs the selected feature modules behind public MCP/OAuth and private
owner-management listeners. `application.ts` is the composition boundary: it wires
shared owner authentication, storage, module registration, diagnostics and admin
integration. Concrete feature imports belong here, not in the shared MCP host.

`http.ts` owns HTTP transport, protected-resource discovery and authenticated MCP
requests. `bridge.ts` adapts Fetch handlers and validates configured hosts.
`lifecycle.ts` tracks admitted requests and graceful draining. `settings.ts` validates
explicit TOML settings; installation and prerequisite helpers support startup and
private setup. Startup does not install dependencies or compile source.

`custody-startup.ts` now gates installation before owner/auth startup. Legacy
settings keep their original file backend and paths only when no migration
authority/intent metadata is present. Optional `custody_directory` supplies a
stable proof/review namespace, defaulting to the original key directory. File
mode currently rejects a different directory rather than silently moving proofs.
An explicit `[custody]` format-1 selection binds `master_backend`,
`installation_id` and `minimum_generation` to a pre-existing manifest; startup
discovers file authority first and then verifies its original-key HMAC before
opening owner storage. Adoption is explicit stopped preparation, not ordinary
startup or `--initialize`. Missing/tampered metadata, native authority, retained
locks/staging and account custody tables unsupported by the current SQLite-only
consumers fail closed. Failed startup clears its temporary master buffer.

Keychain selection is deliberately unavailable until K0/K2 acceptance: startup
rejects it before accessing a stale key file or owner/auth database, with no UI or
fallback. Containers reject Keychain selection during settings validation. These
are product compatibility checks, not a native backend, migration coordinator,
race-free maintenance lease or installer compatibility completion. The stopped
service/mutation coordination remains necessary before real preparation/cutover.
Synthetic custody-startup tests cover identity/key preservation, unfinished and
incompatible state, and the actual Bun entry point's fail-closed rejection.
The account-format preflight opens the existing database with readwrite/create:false
and issues only a schema SELECT: SQLite may perform normal hot-journal rollback
recovery before that read. A real SIGKILL/dirty-page-spill regression verifies this
existing file-mode recovery; it is not automatic migration or schema repair.
Main verification passed 71 targeted startup/storage/auth-path tests, three
existing owner/auth application tests, typecheck and the application build.
Independent review reproduced the readonly hot-journal regression; after the
correction, it reran all 11 startup tests and typecheck with no confirmed blocker.

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
