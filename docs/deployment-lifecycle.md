# Deployment and lifecycle requirements

This is the authoritative lifecycle specification. Current CP1–CP5 implementation and acceptance are recorded in the roadmap; the native private setup service is live. Public routing and real client enrollment remain pending. The host is this Mac, runtime direction is Bun, and the
[accepted setup/auth flow](setup-and-auth.md) governs private setup and client
access. Calendar remains outside the current Mail scope.

## Required observable outcomes

| ID | Requirement and acceptance | Evidence / gap |
| --- | --- | --- |
| D01 | Starting the selected build must validate configuration without exposing secrets, bind only intended interfaces and expose accurate readiness. Invalid configuration must fail without a misleading ready state or partial owner enrollment. | CP5 native artifact and actual Linux image validate startup/config/readiness. |
| D02 | The chosen private setup route must permit authorized owner enrollment; the chosen client route must support MCP/OAuth while rejecting anonymous mailbox/icloud/admin access. Verify actual Codex and ChatGPT discovery/calls. | CP3/CP4 local auth/MCP E2E pass; actual private Serve verified. Public/client acceptance pending. |
| D03 | Restart must retain completed ownership, bootstrap closure and required credentials/grant state, according to the chosen revocation policy. Lost state must fail closed. | CP3/CP4 owner/key/grant restart and missing-state checks pass; disaster recovery remains limited. |
| D04 | Graceful shutdown must stop accepting work, resolve or report in-flight operations accurately, release owned listeners and close mail connections without implicit purge. Verify no reachable owned listener afterward. | L1/L10 listener teardown and mail logout fixtures; in-flight production behavior open. |
| D05 | Updates must identify the running revision, preserve private state and permissions, and define migration/rollback outcomes. Failed updates must not silently reset ownership or expand access. | Owned immutable install/update mechanism tested; cross-version migration/rollback not yet exercised. |
| D06 | Uninstall must stop only this service, disconnect/revoke the specified grants and credentials, and remove only owned deployment resources. It must preserve mailbox data and unrelated Tailscale/container configuration. Explain any retained backup/state and separate provider revocation from local removal. | CP5 scoped install/uninstall preserves state; CP3/CP4 local credential/token revocation tested. |
| D07 | Before relying on unattended hosting, report actual behavior across process/container restart, logout, reboot, sleep/wake and network loss. Do not promise availability while the Mac is asleep/offline. | Process restart and one container stop/start observed; remaining host lifecycle checks open. |

## Current runtime evidence

CP5 tests the actual application, not just the earlier counter experiment:
five native lifecycle tests (41 assertions), five Linux built E2E tests (147
assertions), and two Linux runtime restart cycles passed. The host-loopback proxy
preserves cookies and supports MCP streams; native published-port forwarding
remains an environment limitation. See [deployment guide](../deployment/README.md)
and [roadmap](roadmap.md). Private native Tailscale setup is now reachable.

## Lifecycle coverage disposition

| Stage | Required deliverable before claiming completion | Current status |
| --- | --- | --- |
| Dev | Reproducible source workflow and specifications | Implemented; source changes pass checkpoint gates. |
| Build | Bun builds and meaningful checks | Native server/browser builds and Linux E2E pass. |
| Release | Immutable versioned artifact excluding secrets | Native artifact/Linux image built and reviewed; not published. |
| Install | Owned state/routes and actual clients | Native private setup installed; owner ceremony and clients pending. |
| Update | Revision/migration/permission preservation | Owned current/release mechanism tested; future schema rollback remains open. |
| Uninstall | Scoped removal without mailbox deletion | Automated owned removal preserves private state; live setup intentionally remains. |

Record readiness, version, redacted error/outcome and cleanup evidence. Never
retain credentials, token values or private mail as diagnostic proof. Observed
failures remain failures until a new experiment resolves them; documentation
alone does not close deployment acceptance.

## Accepted lifecycle structure and roadmap

Both native Mac/Bun and Apple Container/Linux-Bun must satisfy the same application
contracts; platform-specific key/network/service integration remains explicit.
The single application lives in `apps/icloud`. Development watches source,
build produces artifacts without starting services, release packages versioned
existing artifacts without publishing, and runtime starts an installed artifact
without compiling or installing dependencies. [Current commands](workspace.md).

The implementation sequence is now: establish typed application boundaries and
workspace; complete agreed domain/service contracts; integrate owner auth/icloud/admin
and storage; validate native and container runtime adapters; verify actual client
and provider behavior. Each step retains the existing acceptance gates. The current checkpoints implement the application and validate native/Linux artifacts. Real owner/provider/client integration remains the CP6 gate.

All lifecycle actions are application-scoped: dedicated marked directories,
verified owned PIDs/container names, and exact Tailscale mount paths. Filesystem
root installation, host-root container mounts, global resets, broad process kills
and root HTTP catchalls are forbidden. Only the two canonical OAuth discovery
paths are allowed outside `/icloud`; see [deployment scope](../deployment/README.md#deployment-scope).

## Drain and diagnostic contract

Shutdown stops admission first, then waits for accepted application work before
closing SQLite or clearing keys. Idle keep-alive sockets must not keep the
process alive. A grace deadline may close idle/incomplete HTTP connections, but
must not abort an active mailbox mutation; an extended drain reports only active
counts and continues waiting. HTTP disconnect is not proof a provider operation
finished. Synthetic tests must exercise both idle sockets and a delayed write.

Operation events contain only an opaque random correlation ID, allowlisted tool
and action, fixed outcome/error code, elapsed duration and aggregate counts.
Never log request arguments, message/subject/body, mailbox/UID, addresses,
credentials, tokens, raw errors or stack traces. Logging failure must not change
the operation result. No telemetry is proof of remote delivery.

Operator capability policy is seeded once from the installation's current TOML flags, including an already enabled sending flag. Subsequent owner-confirmed changes are persisted separately in SQLite and take effect for new tool calls without restarting. Disabling Read blocks all mailbox tools; Write additionally controls mutations and unsubscribe submission; Send remains a separate OAuth permission. Re-enabling a capability requires explicit owner confirmation. Changes never expand existing OAuth clients or grants, and already admitted work drains to its actual outcome. Downloadable plugin archives remain a separate delivery checkpoint.

## Production installation location

The release provides an executable `icloud-plugin` command. `icloud-plugin install`
installs that artifact into `~/.decompozr/plugins/icloud`; `update` atomically
selects a new immutable release in an existing marked installation. Root project
`releases/` remains the distribution output. Production config/state/custody live
under the installation's `runtime/`, outside immutable version directories.
`current/icloud-plugin run` starts the selected build with `runtime/config.toml`
and never initializes, builds, installs dependencies, or rewrites configuration.
An explicit `--config` permits a different private configuration; provisioning
requires explicit `--initialize`. Installation does not migrate data or manage
processes implicitly. Stop the old service before migrating existing state and
preserve configuration bytes, SQLite state, custody and owner-only permissions.

Scoped uninstall retains the installation ownership marker along with private
runtime data. Same-prefix reinstall may reuse a real directory only when its
regular-file ownership marker matches and both `current` and `releases` are
absent. It preserves retained bytes and permissions without initialization.
Existing active installations require update; arbitrary, unmarked or symlinked
prefixes must be rejected. A prefix left unmarked by an older uninstall requires
explicit recovery, not automatic adoption. These are the source lifecycle
requirements; the historical installer1 distribution below is unchanged.

### Installer packaging revision evidence

The `0.1.19-installer1` distribution adds the standalone CLI to the previously
validated `0.1.19` application without rebuilding or deploying the concurrent
Mail-module source refactor. `packaging.json` records this provenance. All 14,259
original files/symlinks were independently compared and preserved; the only
additions are the launcher, bundled installer JavaScript and packaging record.
The application version and installed release ID remain `0.1.19` and
`0.1.19-darwin-arm64`; `installer1` identifies the distribution packaging revision.
The original archive was preserved during packaging and removed after successful
production migration, as recorded below. The installer1 archive SHA-256 is
`d4af08188e53f77518736398c5bec7cda5296508583fa54783510a867995048e`.

The shipped CLI passed the native lifecycle test (1 test, 26 assertions): actual
installation, explicit-only provisioning, two starts, protected endpoints/assets,
graceful termination, closed listeners and unchanged custody across restarts.
The standalone CLI suite additionally checks the standard prefix with an isolated
home, paths with spaces, duplicate-install/update refusal and retained config on
uninstall. The production runtime migration has its own separately recorded
process/configuration and health evidence.

During installer work, checks against the concurrently changing checkout briefly
passed typecheck and 147 application unit tests, then exposed an E2E drain timeout
and a later module-fixture type error. Those intermediate observations are not
acceptance evidence for deploying that refactor. No `0.1.20` application was
installed: its unshipped staging artifact and archive were removed. Independent
refactor results, if subsequently recorded, are separate from this stable
application packaging and migration.

Production migration completed through the actual released install command. The
installed `current/icloud-plugin run` launcher started application 0.1.19 using
the migrated `runtime/config.toml`; all 13 doctor checks plus local/private health
checks passed. Configuration/custody and persistent owner/auth/policy records were
verified unchanged, with SQLite integrity checks passing. Task-owned root runtime
and extracted distributions were removed after verification. The final installer1
archive remains at project root `releases/`; the sole installed application and
private runtime occupy approximately 155 MiB at the standard prefix. See current
status for observed process IDs and retained distribution sizes.


## Native 0.1.20 release and upgrade (2026-10-03 UTC)

PR #5 merged at `b87f3d7fd7756bb176f48d3e944585412e490add`; stable
[v0.1.20](https://github.com/decompozr/icloud-plugin/releases/tag/v0.1.20) publishes
the native `darwin-arm64` application only. The archive is 24,369,484 bytes, SHA-256
`cc10c3bfcd3b21f087a0d0e568cae2304a85226ba90fd711e9ff11292174324d`.
Packaging uses `COPYFILE_DISABLE=1` to omit AppleDouble metadata. The earlier
unpublished candidate remains identified as task-owned output, not the released
archive. The previous 0.1.19 evidence above is historical.

The shipped installer `update` and selected `current/icloud-plugin run` upgraded
`/Users/scottchu/.decompozr/plugins/icloud` to `releases/0.1.20-darwin-arm64`,
using existing configuration without `--initialize`. Launcher/server PIDs were
25006/25010. The protected stopped backup remains at
`runtime/backups/pre-0.1.20-20261003T144627Z` with `upgrade-receipt.json`; the previous
release remains available. Configuration/custody bytes and modes match; both SQLite
integrity checks pass. Owner, Passkeys and existing grants remain intact, the one
active original credential migrated to its fixed account, and bootstrap stays
closed. Rollback to an older binary restores compatible stopped state and release
together, rather than changing only the symlink. Independent post-upgrade audit passed all 13 doctor checks,
both read-only SQLite integrity checks, unchanged owner/install hashes and auth
row counts, and 33 protected stopped backup-entry byte/mode comparisons. The
launcher is detached (parent PID 1); the server has the exact installed working
directory and loopback listeners on ports 4100/4101. The protected receipt is
finalized. Task-owned controller/pointer/temporary files were removed while backup,
previous release and release artifacts remain. Live ChatGPT account addition/profile/reconnection and rendered
browser interaction remain unverified.
