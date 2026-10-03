# Source architecture and evidence status

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

Merge verification ran `bun run checkpoint` against an isolated export of the
staged Mail refactor, with unchanged baseline manifests and tooling. Existing
local dependency installations were reused; no fresh install was performed:

- `bun run test`: application 154 tests, 626 assertions across 26 files;
  tooling 8 tests, 87 assertions across 5 files; zero failures.
- `bun bin/build`: passed, including application typecheck and declaration build.
- `bun run e2e`: 11 tests, 236 assertions across 6 files; zero failures.
- Independent review found no blocking issues. The five module/runtime integration
  tests cover namespace rejection, Mail plus synthetic Calendar registration,
  a signed Calendar-only bearer through HTTP, startup-failure cleanup and draining.
  Consent metadata/resolver checks cover Traditional Chinese, unknown-locale
  fallback and arbitrary module labels. Ledger tests include post-disposal rejection.
- Documentation verification checked 81 local link targets across 22 documents:
  all exist. Every source-containing subsystem has a README. Markdown diff
  whitespace checks passed.

The Calendar contribution is a synthetic test fixture, not a shipped Calendar
module, CalDAV integration or evidence of real calendar access. Current enrollment
still uses one Apple account credential form; shared copy/client artifact content
is not a fully module-generated UI. No live mailbox operations, physical Passkey
ceremonies, deployment/routing changes or actual client catalog refresh were run
for this refactor. Historical acceptance records follow separately.

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
| Single-owner Passkey/OAuth setup | Yes | Real synthetic signed Passkey/HTTP OAuth tests; user completed actual owner enrollment and connected ChatGPT. No multi-account support. |
| Account management and capability controls | Yes | Private owner-session/Origin checks, credential rotation/revoke and persisted policy tests; confirmed elevation required. UI controls are deployed but post-upgrade live owner interaction has not been independently exercised. Grants are never automatically expanded. |
| Incremental scope discovery/consent | Corrected in 0.1.16 | Actual installed auth+MCP same-client lifecycle regression passed 1 test/90 assertions, including expiry, refresh rotation, rejected scope escalation (400), rejected replay of old/successor refresh tokens (400), revocation, and an unaffected separate read-only grant; policy-enabled descriptors expose read+action scopes while calls still enforce permission. Actual ChatGPT upgrade without reinstall remains unverified; legacy clients with narrower registered ceilings are not automatically migrated. |
| Private wizard, shared UI/i18n, monochrome icon | Yes | Typed English/Chinese resources, component checks and prior browser wizard evidence; new deployed icon hash verified. Complete latest dashboard visual/accessibility walkthrough still pending. |
| Configured plugin ZIP download/export | Yes | Private owner-only route; installed archive extraction, version, allowlist and trusted URL tests passed; CLI/runtime ZIP byte equality verified. Hosted private import acceptance not verified; download is not installation. |
| Shutdown and operation telemetry | Yes | Actual HTTP disconnect/drain tests preserve accepted writes and emit only bounded non-content fields. Live startup/readiness verified. Unexpected earlier process disappearance remains unexplained; unattended service reliability is not proven. |
| Native build/release/install/update | Yes; native runtime active | Immutable artifacts, installed restart/custody checks and scoped actual updates. LaunchAgent template exists; persistent login/reboot service installation is not completed. |
| Apple Container mode | Implemented and isolated-tested, not live | Linux UID10001 E2E11/236 and installed auth+MCP1/78 passed. Host proxy path tested; native port publishing previously failed. Real production container/Tailscale/user-account acceptance remains open. |
| Doctor and setup-plan commands | Repository tools implemented | Read-only doctor tested and run against live service; setup-plan emits validated TOML/plist/scoped route proposals only. It does not provision, load services or change routes. |
| Calendar | Playground only; not deployed | Synthetic parser/loopback CalDAV fixtures10/55. PROPFIND/REPORT responses are canned: these do not prove search-filter correctness or independent CalDAV interoperability. No production files, MCP tools, scopes or real iCloud calendar calls. |
| Drive, Contacts, Photos, cross-feature workflows, multi-account | Not implemented | Deferred roadmap, not current product capabilities. |

## Safe next checks

Start with private-page navigation, icon and owner-authenticated package download, without changing settings. The owner may then test the existing ChatGPT connection's Refresh and fresh consent flow; metadata refresh alone is not proof of a new grant. Do not delete/recreate the connection by default. Report only displayed scope names/outcomes, never tokens, codes or passwords. Existing successful mail acceptance need not be repeated. Any new mailbox mutation, send, draft or capability elevation requires the user's concrete intent.

Evidence detail and historical receipts: [roadmap](roadmap.md), [mail contracts](mailbox-tools.md), [authentication](setup-and-auth.md), [deployment](../deployment/README.md), [client artifacts](client-artifact.md), and [Calendar feasibility](calendar-feasibility.md).

## Tool names and connection observation

The historical 0.1.16 Mail surface contains 14 tools: `mail_list_mailboxes`, `mail_search`, `mail_read`, `mail_mark`, `mail_move`, `mail_flag`, `mail_tag`, `mail_organize`, `mail_batch`, `mail_send`, `mail_reply`, `mail_draft_create`, `mail_unsubscribe_discover`, and `mail_unsubscribe_submit`. Release 0.1.17 adds `mail_attachment_download`, `mail_draft_read`, `mail_draft_edit`, `mail_draft_send`, and `mail_forward`, for 19 installed tools. Availability follows operator policy; invocation additionally requires the corresponding OAuth scopes.

A separate read-only Dot log observation recorded a cloud-backend DNS `ENOTFOUND` at 22:55:22Z and a connected event at 22:57:34Z. These historical events have no established mapping to the user's current task. Current DNS resolution and a separate Bun service-health request returning 200 are different observations; they do not identify the exact Dot failure. No restart or configuration change was made. The OAuth fixture lifecycle results above do not establish global session revocation.
