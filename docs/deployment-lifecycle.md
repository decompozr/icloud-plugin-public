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
