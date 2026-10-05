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

The Bun entry point acquires `InstallationAccess` before opening installation
credentials or databases, including initialize/local-owner commands. Runtime and
maintenance share a private `installation-access.lock` directory with a durable
unique proof; a second cooperating runtime cannot start. Runtime retains access
through listener drain, module disposal, database closure and key-buffer clearing.
Concurrent shutdown signals await the same shutdown promise. Failed cleanup or
unclassified startup failure retains evidence instead of releasing access early.
Initialization/local-owner command completion and closed auth-database-open
failures release their own lease. Application-factory errors retain exclusion:
its best-effort cleanup does not establish that all started modules disposed.

Maintenance must acquire this lease before the master-authority mutation lease;
its `assertStoppedMaintenance` callback verifies purpose, inode and exact proof.
It does not prove old releases, direct storage users or custom writers stopped:
operators must establish that before administrative capture/migration. No PID
liveness heuristic, automatic crash-lock stealing or recovery deletion exists.
A SIGKILL leaves blocking evidence for explicit protected recovery. This is
cooperative exclusion, not K0 caller authentication or a complete maintenance
command. Synthetic subprocess tests cover exclusion, crash evidence, initialization
and actual listener lifetime through graceful shutdown; no live credentials or
Keychain are involved.

`prepareExistingMasterBaseline` is an inactive administrative adapter for an
already configured format-1 installation. It discovers authority before reading
the exact original key, acquires maintenance/authority leases, and opens only
existing private nofollow single-link key/marker/DB files. Held inode checks and
fresh key/marker bytes accompany capture's maintenance assertions. Sidecars are
checked before and after SQLite opens. SQLite uses create:false/readwrite to
permit ordinary hot-journal recovery; no owner/auth factories, enrollment,
schema repair, key generation or native backend are invoked. Owned handles and
key buffers are closed/cleared before lease release; uncertain teardown does not
certify completed maintenance. Only immutable baseline metadata is returned.

Container mode is rejected before state access; separate authorized host design
is still required. The caller must authenticate operator selection and independently stop older/
custom writers. This adapter is not exposed as a CLI or an authorization bypass.
Bun/SQLite opens by pathname: the checks do not establish filesystem isolation
against a hostile same-user replacement race. Format-2 recovery uses retained
metadata, not this initial format-1 capture path. Safe existing-file tests cover
missing/unsafe paths, replacement/key-change rejection and genuine SQLite crash
recovery; native operation and full installed acceptance remain separate gates.

Shutdown stops new work and waits for accepted operations; losing an HTTP client
must not automatically cancel a write already accepted by a provider. The runtime starts before auth/UI assembly; later application-construction failure
unwinds started modules. Database connection ownership remains with the application
startup/teardown path. Colocated
settings/lifecycle tests and [built E2E tests](../../../e2e/README.md) cover local
configuration, listener isolation and draining. These do not prove deployed routing,
reboot reliability or live provider acceptance. Module selection is static; no
runtime package installation or hot reload is provided.
