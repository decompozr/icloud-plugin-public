## Shared admin shell delivery (2026-10-06)

Current native release 0.1.71 includes the shared Svelte admin shell from PR82.
The left icon rail stays mounted between Overview, Accounts, Connections and
System. Its selected background stays 44px tall; only CSS position moves. Overview
cards are rows, modules are Mail/Calendar/Photos, and path-copy controls use full
values with toasts. Owner access is revalidated before every shallow navigation.

58 disposable browser checks and focused independent review cover navigation
identity/size, rapid Back, pending credentials and expiry. 459 tests / 4238
assertions pass. Native lifecycle passed 1 test / 30 assertions. Running payload
matches clean main cf05683f72bacb5e785bdeb0132a3f22bfa852c4 except verified Kit
build identity; 13 live asset readbacks and 13 doctor checks pass. The concurrent
native workflow installed this main release before our installer, so it was
adopted without overwrite or another restart. Existing main MCP profile stays
on the same account and provider mailbox listing succeeds (9). No production
reset, live clipboard change or provider write was performed by this task.

## Studio 0.1.64 readback (2026-10-06)

The running native installation now uses SvelteKit Studio with requirement-based
setup, disabled defaults for fresh installations, compact overview cards, shared
credential modals, toasts and actual pinned DecompozR language Menu/Icon controls.
Two confirmed System reset modes are installed: connections preserves owner
Passkeys/master key; factory clears owner/Passkeys and rotates keys. No live reset
was executed. The native upgrade preserved stored choices, credentials and grants.

Source: main 349d2ce6754fb11147b40f844eb53bb36fef0c53, release 0.1.64 darwin/arm64.
456 application/Studio/tooling tests, 11 built HTTP E2E tests, 45 isolated browser
checks, native artifact lifecycle and scoped independent reset review pass. Live
payload readback checked 550 conditions; doctor passed 13 from this machine.
Provider/physical Passkey/off-tailnet acceptance is not implied. MCP/Express Fetch
transport migration remains the next authorized phase.

## Single-account production preparation (2026-10-04 UTC)

## SvelteKit / Paraglide phase two deployed (2026-10-06)

Native 0.1.60 now serves hydrated Studio admin/auth workflows and Paraglide English
and Traditional Chinese JSON catalogs. Thirty live page/locale/asset/ingress checks
and thirteen doctor checks pass; account, Passkey, grant and custody preservation
is verified. Independent review corrections and synthetic OAuth code/refresh
coverage are recorded in [the migration evidence](svelte-migration.md). Owner
testing is pending. MCP transport and removal of the outer Express lifecycle are
phase three, gated on owner `pass`. Prior deployment sections below are historical.

## Svelte Studio phase one deployed (2026-10-06)

Native 0.1.59 now serves Svelte-rendered admin/setup and authorization presentation
from `apps/studio`, with existing browser workflow adapters. Thirteen live doctor
checks and eighteen page/asset/ingress checks pass; account, Passkey, grant and
custody preservation is verified. Owner testing is pending. Reactive browser
ownership and SvelteKit routing remain phase two, gated on owner `pass`. See
[the migration and deployment evidence](svelte-migration.md).

The installed diagnostic release remains 0.1.26. The current preparation is based
on diagnostic commit `b85c33f`, after the successful custom MCP acceptance, and
does not change the service, accounts, credentials, grants or routes. Current
scope and evidence supersede broad or historical claims below:
[production audit](single-account-production-readiness.md).

## Reconnect redirect diagnostic iteration 0.1.26

Closes the authorization302 diagnostic gap by reducing the provider-created
redirect to one exact allowlisted OAuth error code. Redirect URL/header/query,
state, code, descriptions and identifiers never enter capture. Tests cover
actual synthetic302 invalid_scope and secret canary exclusion. The original
activation marker and30-minute deadline are preserved across this iteration.
No grants, credentials or network routes change. GitHub publication is paused.

## Reconnect diagnostic release 0.1.25

Adds a disabled-by-default, owner-only local capture for known discovery,
registration, authorization, token and MCP routes. Records only UTC timestamp,
fixed stage/route, HTTP status and allowlisted error code; no credentials,
headers, queries, bodies, identities or provider content. The empty private
enable marker grants a 30-minute window and retention is capped at256 records.
No grants or network routes change. See [activation and privacy contract](reconnect-diagnostics.md).
Publication and production activation remain separately verified outcomes.

## Readiness release 0.1.24

Adds account/client-scoped readiness observations, contextual registration recovery,
explicit unsaved capability changes and restored account chooser layout. Observations
come from verified bearer requests and successful allowlisted read tools; Calendar
completion requires listing plus an event read/query. They invalidate conservatively
on expiry or relevant metadata, credential and policy changes and clear on restart.
No grants are widened and no consent or provider operation is started by the UI.
See [evidence contract](readiness-evidence.md). Publication and installed acceptance
are recorded separately; fixture screenshots are not live ChatGPT acceptance.

# Source architecture and evidence status

## Photos implementation (2026-10-04)

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> **2026-10-04 closeout:** Experiments are closed. See [Photos capability plan](photos-capability-plan.md) for the authoritative current evidence, accepted local provider architecture, comparison limits and implementation phases. Older checkpoints below are historical.

## Photos research (2026-10-03)

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The earlier basic read milestone below remains valid:

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Historical implementation checkpoints (superseded by the result above)

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The authentication-only helper passed six fake-client tests. Actual preflight
stopped before login because the available Python 3.9.6 does not meet the pinned
upstream's Python 3.10–3.13 requirement. It created no session state and read no
Photos metadata. That Python route is historical and superseded by the accepted
Bun-native implementation goal. The native SRP/auth, scoped cookies, bounded
Photos HTTP reader and plist decoder now pass **66 tests / 565 assertions**;
preflight confirms no Python, credentials or network use. Actual terminal account
authentication and a cloud response are still required. The reader currently
targets only private `PrimarySync`, at most two pages/twenty assets. A follow-up
adds capped ordinary-album listing and exact-ID membership; listing explicitly
reports incomplete coverage because upstream album pagination is unverified.
Real-account album behavior and person-name search remain open. The goal is not
complete; see the research document.

`--people-schema` now samples at most two PrimarySync change pages/two hundred
records, outputting only schema names and counts. It verifies neither person
names nor photo mappings; missing types are inconclusive. Actual account/2FA
interaction remains the unchanged external gate after the native, album and
schema slices. No authenticated handle or live Photos result has been obtained.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Production installation verified (2026-10-03 UTC)

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

## Automatic renewal acceptance (2026-10-03 04:52 UTC)

**PASS for one real ChatGPT renewal cycle.** The parent's single post-expiry mailbox-list call succeeded at04:52:20. Same-client, unchanged-consent metadata confirms refresh rotation and new access retaining all four scopes; the original authorization-code link was inherited, not fresh manual authorization. New access expires05:52:20 UTC. This closes the pending renewal check for the observed cycle only, not indefinite reliability. [Exact evidence and limits](oauth-request-scope-diagnosis.md#real-chatgpt-automatic-renewal--one-cycle-accepted-2026-10-03). ZIP-name matching, receiver attachment byte/hash equality, and live idempotency remain separate unresolved items.

## Latest bounded Mail acceptance (2026-10-03, parent-reported)

The owner-authorized 04:02 UTC live test passed draft attachment download, existing-draft replacement, draft send with retained source, and original-MIME forwarding to Gmail. Source download bytes/SHA-256 were verified; Gmail receipt and nested MIME preservation were independently reviewed. Receiver-side raw attachment download returned403, so receiver byte/hash equality remains unverified. Receipt replay was blocked before execution: live idempotency was not tested, and no retry is requested. Draft432 remains, old test draft is Trash34629, original draft430 and unrelated mail were untouched. See [the exact live receipts and limits](mailbox-tools.md#bounded-live-mail-acceptance--2026-10-03-parent-reported). Earlier pending statements below are historical for these tested paths. The subsequent post-expiry verification passed one automatic-renewal cycle at04:52:20 UTC, as recorded above.

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

## Calendar source-module acceptance complete (2026-10-03 UTC)

The owner accepted a production-ready registered Calendar module, including
closing the sharing gap and cleaning all experiments. [Production
coverage](calendar-production.md) tracks operations, permission boundaries and
Dev/Build/Release/Install/Update/Uninstall acceptance. The registered source passed its independent gate and final build/tests;
production-path live smoke also passed with its resources cleaned. The user accepted disclosed recipient
verification limits, and final sharing revocation/cleanup restored four original
calendars with zero test markers. The accepted source-module goal is complete;
no deployment occurred.

Integration initially used an older Mail-only source base. Read-only comparison
identified the current multi-account base; the task branch was fast-forwarded to
`00415c6`, preserving all Calendar work. Calendar must now use verified owner and
account context, account-bound operations and credentials, and account-isolated
journals. Prior installed-release receipts are historical, not a deployment of
this Calendar work.

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
[source subsystem index](../apps/icloud/src/README.md). Calendar now has a registered source module; live production-path acceptance
and deployment are tracked separately in [Calendar coverage](calendar-production.md). Every source subsystem has local ownership/design documentation;
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
| Calendar | Registered source gate passed; not deployed | Independent Calendar46/181; final app243/1087 and tooling10/134, both typechecks/build and disposable artifact lifecycle pass. Registered real-iCloud smoke16invocations passed and cleaned its resources. User accepted recipient verification limits; final sharing revoke/cleanup verified four originals and zero test markers. See [production coverage](calendar-production.md). |
| Multiple iCloud accounts | Locally verified; native 0.1.20 installed | Owner-only OAuth chooser/add, account-bound grant/refresh/profile and cross-account reference checks pass. Rendered browser and actual ChatGPT Connect another account/profile/reconnection acceptance remain open. |
| Drive, Contacts, Photos, cross-feature workflows | Not implemented | Deferred roadmap, not current product capabilities. |

## Safe next checks

Start with private-page navigation, icon and owner-authenticated package download, without changing settings. The owner may then test the existing ChatGPT connection's Refresh and fresh consent flow; metadata refresh alone is not proof of a new grant. Do not delete/recreate the connection by default. Report only displayed scope names/outcomes, never tokens, codes or passwords. Existing successful mail acceptance need not be repeated. Any new mailbox mutation, send, draft or capability elevation requires the user's concrete intent.

Evidence detail and historical receipts: [roadmap](roadmap.md), [mail contracts](mailbox-tools.md), [authentication](setup-and-auth.md), [deployment](../deployment/README.md), [client artifacts](client-artifact.md), and [Calendar feasibility](calendar-feasibility.md).

## Tool names and connection observation

The historical 0.1.16 Mail surface contains 14 tools: `mail_list_mailboxes`, `mail_search`, `mail_read`, `mail_mark`, `mail_move`, `mail_flag`, `mail_tag`, `mail_organize`, `mail_batch`, `mail_send`, `mail_reply`, `mail_draft_create`, `mail_unsubscribe_discover`, and `mail_unsubscribe_submit`. Release 0.1.17 adds `mail_attachment_download`, `mail_draft_read`, `mail_draft_edit`, `mail_draft_send`, and `mail_forward`, for 19 installed tools. Availability follows operator policy; invocation additionally requires the corresponding OAuth scopes.

A separate read-only Dot log observation recorded a cloud-backend DNS `ENOTFOUND` at 22:55:22Z and a connected event at 22:57:34Z. These historical events have no established mapping to the user's current task. Current DNS resolution and a separate Bun service-health request returning 200 are different observations; they do not identify the exact Dot failure. No restart or configuration change was made. The OAuth fixture lifecycle results above do not establish global session revocation.

Private administration UI preparation now adds an owner-protected root overview,
Accounts, Client connections, System/diagnostics and a resumable account-only wizard.
See [admin shell](admin-shell.md) for routes, uncertainty semantics, fixture browser
checks and the proposed private root mapping. This candidate is local only; live
8443 routing, runtime, credentials and supervision are unchanged. The current source
version still collides with installed 0.1.26 and requires a new release version before
an authorized deployment.

The user reported reinstalling the custom MCP connection at 22:38 UTC on October 4.
Earlier grant lineage and proactive refresh observations describe the previous
connection. Do not transfer those claims to the reinstalled connection; fresh
read-only acceptance is a separate check in the parent task.


## Native release 0.1.27 candidate

Release 0.1.27 integrates the reviewed single-account security fixes and private
owner administration flow from 8bb6556, preserving its credential/grant/policy
contracts. The user explicitly approved publication, a controlled native restart
and only the private 8443 root mapping on October 4 at 23:06 UTC. No supervision
installation, broader security setting change, connector reconnect or screenshot
upload is included. The release is native darwin-arm64/Bun 1.4.2; Linux remains
unvalidated. Publication and live deployment are recorded separately after checks.

The repository currently has no configured GitHub Actions workflows or check runs.
Local full-suite, artifact, fixture-browser and independent review evidence is the
release validation; no passing remote CI claim is made.


Native patch 0.1.28 corrects private-root navigation to enter `/icloud/admin` before
authentication. Owner cookies retain their narrow `/icloud` scope, preserving
existing sessions and avoiding exposure to unrelated root applications on the
same hostname. The approved private 8443 root proxy remains unchanged. A browser
regression uses a real fixture cookie with path `/icloud` and no owner header.
