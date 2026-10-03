# Source architecture and evidence status

## Audit corrections integrated with multi-account source (2026-10-03 UTC)

The source now preserves unknown outcomes when STORE acknowledgement is missing,
stops remaining batch items, and carries confirmed COPY destination evidence as
`recovery.copiedTarget` through single and batch MCP results without claiming a
successful move. Send/reply and draft creation recheck current read and action
policy after asynchronous preparation, immediately before provider submission;
revoked operations retain rejected receipts, while already submitted work drains.
Uninstall retains installation ownership proof so same-prefix reinstall preserves
private state; arbitrary, unmarked or symlinked prefixes remain rejected.

The corrections are integrated with `origin/main` at `b87f3d7` (multi-account
release 0.1.20). A fresh `bun bin/checkpoint` passed application/tooling typechecks,
production build, 196 application tests (887 assertions), 10 tooling tests
(126 assertions), E2E compilation and all 11 built E2E tests (253 assertions).
All four corrections received independent review before this integration.
The final integration review accepted the result after 16 targeted tests
(105 assertions).
New production-module regressions verify that single and batch move-recovery
identities retain the authenticated account and are rejected across accounts.
The integration review also exposed a late annotation check that could replace
an in-flight outcome with a rejection after credential revocation. Result
annotation now captures account identity at admission: completed and unknown
results retain their evidence, while new invocations still enforce current
credentials. Single and batch regressions cover both outcomes and denied
subsequent provider access.
Policy revocation tests use a verified nonlegacy account context, retaining
account-scoped operation receipts and restart replay.
Regression fixtures cover real ImapFlow STORE responses, staged move failures,
SQLite-backed policy changes and retained-prefix CLI reinstall. Better Auth's
existing SQLite array/TEXT mapping warnings remain visible; the checks passed.
The STORE adapter's private ImapFlow command boundary remains a maintenance
dependency guarded by protocol tests and command-shape validation.

These are source and synthetic-fixture results. No release archive, installed
application, live mailbox, authorization grant or route was changed by this work.
The full integration checkpoint exited successfully. Subsequent read-only shell
launches briefly hit the host file-descriptor limit and recovered; that host
condition did not invalidate the completed checkpoint. Existing live acceptance below
is separate and does not establish live behavior of these new corrections.

## Multi-account source checkpoint (2026-10-03)

Application **0.1.20** is published as the stable native `darwin-arm64` release
from PR #5 merge commit `b87f3d7fd7756bb176f48d3e944585412e490add`:
[release v0.1.20](https://github.com/decompozr/icloud-plugin/releases/tag/v0.1.20).
The authorized local upgrade completed; release and installation evidence follows
below. The versioned candidate's full `bun bin/checkpoint` passed, including all
190 tests summarized here.

The source implements the accepted owner-only account chooser/add flow, three-stage
owner setup without Apple credentials, per-grant account binding and stable profile
identity. Independent source review findings are closed. Frozen dependency installs
were explicitly approved and completed without lockfile changes.

The final combined source checks passed:

- `bun bin/typecheck`: application and tooling typechecks.
- `bun bin/build`: production application and actual browser bundles.
- `bun bin/test`: 170 application tests / 813 assertions and nine tooling tests /
  97 assertions.
- `bun bin/e2e`: 11 built HTTP/protocol E2E tests / 253 assertions.
- `git diff --check`: no whitespace errors.

The passing regressions cover actual legacy and new account bindings, simultaneous
account selections, and rejecting formerly issued unbound refresh tokens when no
legacy account exists (`invalid_grant`). Owner HTTP E2E covers two accounts with
identical mailbox/UID identities, cross-account reference rejection, stable profiles
and account-preserving refresh/restart. These tests use synthetic Passkeys and mail
providers; known Better Auth SQLite TEXT/string-array mapping warnings remain.

Rendered browser interaction could not be verified: CUA in-app/Chrome surfaces were
unavailable, and native Chrome returned `cgWindowNotFound`. Narrow-layout changes
have source review and passing HTTP/HTML integration checks, not rendered-screen
visual or interaction acceptance. Live ChatGPT **Connect another account**,
account-label/profile and reconnection acceptance have not been performed.

## Application 0.1.20 release and installed upgrade (2026-10-03 UTC)

The published native archive is 24,369,484 bytes with SHA-256
`cc10c3bfcd3b21f087a0d0e568cae2304a85226ba90fd711e9ff11292174324d`.
Packaging used `COPYFILE_DISABLE=1` to exclude macOS AppleDouble metadata.
Only `darwin-arm64` is released; there is no 0.1.20 Linux release claim.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Historical 0.1.19 production installation (2026-10-03 UTC)

The released `icloud-plugin install` command installed the stable 0.1.19
application with installer1 packaging into `~/.decompozr/plugins/icloud`.
The detached launcher PID 15377 (parent PID 1) starts server PID 15381 from
`~/.decompozr/plugins/icloud/releases/0.1.19-darwin-arm64`, using
`~/.decompozr/plugins/icloud/runtime/config.toml`. These are observed process IDs,
not persistent identifiers. All 13 doctor checks and local/private health checks
passed. The stopped-state copy preserved all bytes and modes; post-start checks
confirmed unchanged configuration/custody and owner, user, passkey, OAuth client,
token, consent and operator-policy records. Both SQLite integrity checks passed.

The installation occupies approximately 155 MiB. Root `releases/` now contains
only the installer1 archive (24 MiB) and the pre-existing 0.1.0 archive (34 MiB).
Task-owned extracted releases, the old 0.1.19 archive and root runtime data were
removed only after successful migration and preservation checks. The concurrent
Mail-module source refactor was not deployed. Release provenance and archive hash
are recorded in [deployment lifecycle](deployment-lifecycle.md).


The source now separates the Mail feature from shared module registration, MCP,
authentication, owner storage and server infrastructure. Current boundaries and
extension limits are documented in [architecture](architecture.md) and the
[source subsystem index](../apps/icloud/src/README.md). Calendar remains unimplemented
in production. Every source subsystem has local ownership/design documentation;
these documents are part of the implementation, not optional follow-up material.

This refactor does not establish which release is currently running, migrate runtime
state or deploy source changes. Release paths, process IDs and test counts in the
historical sections below are observations from their respective work, not refreshed
live evidence.
In particular, previously recorded release numbers must not be used to infer the
current filesystem or authorize removal of runtime data. Refactor verification is
reported separately from those historical acceptance records.

## Combined source verification before PR (2026-10-03 UTC)

`bun bin/checkpoint` passed application/tooling typechecks, the production build,
application/tooling unit suites (including the standalone installer CLI), E2E
compilation and all 11 built E2E tests (236 assertions). A fresh native artifact
assembled from this combined source also passed the actual released CLI lifecycle
in an isolated temporary installation: 1 test, 26 assertions, including explicit
initialization, protected endpoints/assets, two starts, graceful shutdown and
preserved custody. The task-owned verification assembly was removed after the
check; no distribution archive or production installation was changed.

This verifies the combined package isolation, release installer and Mail module
source changes. It does not deploy that source or repeat live iCloud operations,
ChatGPT consent/refresh, or Linux container execution. The production installation
record above remains separate from this source verification.

## Mail module refactor verification

The application now registers Mail tools/scopes through `ModuleRuntime`; the shared
MCP host dispatches registered contributions. Mail domain, services, iCloud adapters,
policy/ledger storage, tool definitions, admin presentation, consent translations
and telemetry classification are owned under `src/mail`. Auth has no `mail.read`
minimum; module descriptors supply consent labels, including locale fallbacks.
Shutdown drains accepted tool callbacks, disposes modules (including clearing the
Mail ledger's derived key) and then closes shared storage. Application-assembly
failure also unwinds started modules. Existing storage tables, encryption contexts, tool names and scopes remain
compatible; no runtime data migration or live deployment was performed.

Final integrated verification reported by the implementation worker after the
localization and ledger-disposal corrections:

- `bun bin/test`: application 154 tests, 626 assertions across 26 files;
  tooling 9 tests, 97 assertions across 6 files; zero failures.
- `bun bin/build`: passed, including application typecheck and declaration build.
- `bun bin/e2e`: 11 tests, 236 assertions across 6 files; zero failures.
- Independent review found no blocking issues. The five module/runtime integration
  tests cover namespace rejection, Mail plus synthetic Calendar registration,
  a signed Calendar-only bearer through HTTP, startup-failure cleanup and draining.
  Consent metadata/resolver checks cover Traditional Chinese, unknown-locale
  fallback and arbitrary module labels. Ledger tests include post-disposal rejection.
- Documentation verification checked 81 local link targets across 22 documents:
  all exist. Every source-containing subsystem has a README. Markdown diff
  whitespace checks passed.

The Calendar contribution is a synthetic test fixture, not a shipped Calendar
module, CalDAV integration or evidence of real calendar access. That refactor
retained one Apple account credential form; the subsequent accepted multi-account
source change moves credential addition into OAuth connection. Shared copy/client artifact content
is not a fully module-generated UI. No live mailbox operations, physical Passkey
ceremonies, deployment/routing changes or actual client catalog refresh were run
for this refactor. Historical acceptance records follow separately.

## Historical package isolation and initial release 0.1.19 deployment

Each application/package now owns its manifest, committed lockfile, and dependency
installation. Root `package.json`, `bun.lock`, and `node_modules` are removed.
`bun bin/checkpoint` dispatches verification without creating a root workspace.
Build output is `apps/icloud/dist`, native assembly is
`apps/icloud/build/<platform>-<arch>`, and archives are in the repository-root `releases/`.
At that stage, the selected release ran directly from
`releases/0.1.19-darwin-arm64`, with configuration/state/custody in
`releases/runtime`. Versioned runtime and mutable state are separate
from build output. See [layout](workspace.md).

Frozen installs, typechecks, build, unit/tooling tests, 11 built E2E tests
(236 assertions), archive structure checks, and an extracted-release lifecycle
test (25 assertions) passed. Version 0.1.19 archive SHA-256 is
`367ce7fe30f29461d1d9a660a35cdc2d3d069ce548326c48e06e1dda053cca88`.
Linux container execution was not rerun because its API server was unavailable.
That initial owner-requested migration ran the extracted release directly at
`releases/0.1.19-darwin-arm64`, PID 8749 (detached, parent PID 1), with matching
working directory. Configuration/state/custody were stored in `releases/runtime`;
the external installation prefix was removed. All 13 read-only doctor checks
passed. SQLite integrity checks passed; owner/account/Passkey/OAuth tables
were preserved, as were exact configuration/custody bytes and modes. Historical
status/logs and backups were then retained under `releases/runtime`. The former `.flow-runtime`
directory was deleted after preservation checks, reclaiming 1,308,428 KiB
(about 1.25 GiB). Task verification copies, obsolete root dependency copies,
and the rebuildable application assembly directory were also removed.
No mailbox mutations or new OAuth consent were performed. The entries below
describe historical deployments.

## Source verification before merge (2026-10-03)

The pending 0.1.18 source changes were retained after an independent review found no blocking issues. `bun run checkpoint` passed application and tooling typechecks, the production build, application/tooling tests, and all 11 built E2E tests (236 assertions). The local installed-release link points to 0.1.18. This verification did not repeat the historical deployment checks or exercise real ChatGPT consent and refresh.

## Owner-approved 0.1.18 deployment (2026-10-03)

Scott approved redeployment of the independently reviewed optional persistent-access candidate. Archive SHA-256: `38707e06a311a918c6a8a59400afbbe80b7f77e0445461f44457cafe53c58ff8`. The 12-file source patch applied after exact baseline/candidate hash checks. Live current is releases/0.1.18-darwin-arm64, owned PID58210. Previous PID47095 was idle and exited gracefully; stop-to-readiness was2.753s (shutdown0.105s). Stopped backup: backups/pre-0.1.18; rollback0.1.17 retained and unused.

All13 read-only doctor checks passed and all123 compiled installed files match the approved candidate. Installed-module discovery with inert providers lists20 tools, including mail_request_persistent_access requiring mail.read+offline_access. This is not an authenticated ChatGPT discovery check. Configuration/custody bytes/modes and selected nonsecret client/consent/access/refresh/resource/operator metadata remained unchanged. No mail calls, actual persistent-access invocation, new consent/grant, or routing changes occurred.

Before packaging, candidate checks passed143 application tests,8 tooling tests,11 built E2E/236 assertions,18 artifact tests/146 assertions. Independent source/test review found no blocking issues. Explicit confirm=true is required before the server issues the optional tool challenge; enabled prior grants are preserved. Ordinary tool scope requirements are unchanged. Real ChatGPT metadata refresh, consent ordering, and later refresh credential use remain unverified; owner consent is still separate.

## Deployed 0.1.17 (2026-10-03)

The live deployment is 0.1.17, owned PID47095. The independently reviewed release adds attachment download, draft read/edit/send, forwarding, and bounded attachments on send/reply/create-draft. Deployment passed13 read-only doctor checks; stop-to-readiness was2.422s. The new mail actions have not been live-accepted. Draft sends retain the original, edits save a replacement then move the old draft to Trash, and forwards attach the original MIME. Existing-draft limits and permission acceptance gates are recorded in mailbox-tools.md and oauth-request-scope-diagnosis.md. The historical inventory below describes0.1.16. Installed0.1.17 module discovery returns19 tools; actual ChatGPT catalog refresh and no-reinstall consent remain unverified. Existing grants/configuration/custody were preserved;0.1.16 remains available for rollback.

# Historical 0.1.16 implementation and acceptance

Historical read-only snapshot: native release **0.1.16**, owned PID **9988**. Current built application/template bytes match the installed release. All 13 local doctor checks passed during this inventory. These checks establish this Mac's reachability, not independent off-tailnet or ChatGPT reachability. No mail or authorization actions were performed for this inventory.

| Capability | Implemented/deployed | Evidence and remaining acceptance |
|---|---|---|
| Mailbox list, search, unread filter, bounded full/summary read | Yes, 0.1.16 | Built HTTP/provider fixtures; user reported live search/read/read-state preservation. “Summary” is bounded content, not an AI-generated interpretation. |
| Mark read/unread; flag/unflag; tags | Yes | Exact UID/UIDVALIDITY and capability checks tested. User reported live Bills tagging and read-state operations. Flag toggling is not separately live-accepted. |
| Move, archive, trash, restore, junk/not-junk, batches | Yes | Native MOVE and checked UIDPLUS fallback tested, uncertain outcomes stop remaining work. User reported eight Junk moves and 53 Trash moves with source/destination verification, plus later cleanup. Archive/restore/not-junk not separately live-accepted; junk placement does not claim classifier training. |
| Send and reply | Yes; operator sending enabled | Synthetic SMTP/error/replay/threading tests. User reported iCloud→Gmail→iCloud→Gmail three-email exchange in one thread, correct reply headers: live PASS. This does not authorize additional sends. |
| Create draft | Yes | Synthetic APPEND/identity/replay tests; user reported saved Drafts UID430/UIDVALIDITY4 with Chinese text/emoji and readback: live PASS. Editing or sending an existing draft is not implemented. |
| Unsubscribe discovery/submission | Yes, bounded supported mechanisms | Header classification and production outbound destination/redirect/bounds policy tested with fixtures. Real subscription cancellation not live-accepted; submission is not confirmation and arbitrary browsing is not supported. |
| Single-owner Passkey/OAuth setup | Yes | Real synthetic signed Passkey/HTTP OAuth tests; user completed actual owner enrollment and connected ChatGPT. The deployed baseline is single-account; multi-account source acceptance is tracked below. |
| Account management and capability controls | Yes | Private owner-session/Origin checks, credential rotation/revoke and persisted policy tests; confirmed elevation required. UI controls are deployed but post-upgrade live owner interaction has not been independently exercised. Grants are never automatically expanded. |
| Incremental scope discovery/consent | Corrected in 0.1.16 | Actual installed auth+MCP same-client lifecycle regression passed 1 test/90 assertions, including expiry, refresh rotation, rejected scope escalation (400), rejected replay of old/successor refresh tokens (400), revocation, and an unaffected separate read-only grant; policy-enabled descriptors expose read+action scopes while calls still enforce permission. Actual ChatGPT upgrade without reinstall remains unverified; legacy clients with narrower registered ceilings are not automatically migrated. |
| Private wizard, shared UI/i18n, monochrome icon | Yes | Typed English/Chinese resources, component checks and prior browser wizard evidence; new deployed icon hash verified. Complete latest dashboard visual/accessibility walkthrough still pending. |
| Configured plugin ZIP download/export | Yes | Private owner-only route; installed archive extraction, version, allowlist and trusted URL tests passed; CLI/runtime ZIP byte equality verified. Hosted private import acceptance not verified; download is not installation. |
| Shutdown and operation telemetry | Yes | Actual HTTP disconnect/drain tests preserve accepted writes and emit only bounded non-content fields. Live startup/readiness verified. Unexpected earlier process disappearance remains unexplained; unattended service reliability is not proven. |
| Native build/release/install/update | Yes; native runtime active | Immutable artifacts, installed restart/custody checks and scoped actual updates. LaunchAgent template exists; persistent login/reboot service installation is not completed. |
| Apple Container mode | Implemented and isolated-tested, not live | Linux UID10001 E2E11/236 and installed auth+MCP1/78 passed. Host proxy path tested; native port publishing previously failed. Real production container/Tailscale/user-account acceptance remains open. |
| Doctor and setup-plan commands | Repository tools implemented | Read-only doctor tested and run against live service; setup-plan emits validated TOML/plist/scoped route proposals only. It does not provision, load services or change routes. |
| Calendar | Playground only; not deployed | Synthetic parser/loopback CalDAV fixtures10/55. PROPFIND/REPORT responses are canned: these do not prove search-filter correctness or independent CalDAV interoperability. No production files, MCP tools, scopes or real iCloud calendar calls. |
| Multiple iCloud accounts | Locally verified; native 0.1.20 installed | Owner-only OAuth chooser/add, account-bound grant/refresh/profile and cross-account reference checks pass. Rendered browser and actual ChatGPT Connect another account/profile/reconnection acceptance remain open. |
| Drive, Contacts, Photos, cross-feature workflows | Not implemented | Deferred roadmap, not current product capabilities. |

## Safe next checks

Start with private-page navigation, icon and owner-authenticated package download, without changing settings. The owner may then test the existing ChatGPT connection's Refresh and fresh consent flow; metadata refresh alone is not proof of a new grant. Do not delete/recreate the connection by default. Report only displayed scope names/outcomes, never tokens, codes or passwords. Existing successful mail acceptance need not be repeated. Any new mailbox mutation, send, draft or capability elevation requires the user's concrete intent.

Evidence detail and historical receipts: [roadmap](roadmap.md), [mail contracts](mailbox-tools.md), [authentication](setup-and-auth.md), [deployment](../deployment/README.md), [client artifacts](client-artifact.md), and [Calendar feasibility](calendar-feasibility.md).

## Tool names and connection observation

The historical 0.1.16 Mail surface contains 14 tools: `mail_list_mailboxes`, `mail_search`, `mail_read`, `mail_mark`, `mail_move`, `mail_flag`, `mail_tag`, `mail_organize`, `mail_batch`, `mail_send`, `mail_reply`, `mail_draft_create`, `mail_unsubscribe_discover`, and `mail_unsubscribe_submit`. Release 0.1.17 adds `mail_attachment_download`, `mail_draft_read`, `mail_draft_edit`, `mail_draft_send`, and `mail_forward`, for 19 installed tools. Availability follows operator policy; invocation additionally requires the corresponding OAuth scopes.

A separate read-only Dot log observation recorded a cloud-backend DNS `ENOTFOUND` at 22:55:22Z and a connected event at 22:57:34Z. These historical events have no established mapping to the user's current task. Current DNS resolution and a separate Bun service-health request returning 200 are different observations; they do not identify the exact Dot failure. No restart or configuration change was made. The OAuth fixture lifecycle results above do not establish global session revocation.
