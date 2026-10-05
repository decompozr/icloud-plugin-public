# Implementation roadmap and checkpoint goals

Implementation is now authorized. Each checkpoint runs strict typecheck, build,
application end-to-end checks and independent review before the next checkpoint.
Fixtures must be identified as fixtures; a passed local gate never claims live
Apple, Passkey, Tailscale or client-account acceptance. No commit, publication,
public activation or global installation follows implicitly from a checkpoint.

## Dual Keychain migration roadmap (planned)

The requested next custody outcome moves **both** each account's Apple
app-specific password and the **exact existing installation master key** into
macOS Keychain. Neither migration is optional. The
[full migration plan](keychain-migration-plan.md) defines the current-code
inventory, authority/state machines, caller/signing gates, recovery and observable
acceptance. Status: documentation complete and K0 investigation started; production implementation, migration,
signer provisioning and installed acceptance are not performed. The earlier
implementation authorization/checkpoint history does not activate this migration.

The baseline is `22acfe419189b6a37e16bc5ee812928bc4ebec6b`. PR #29's
[closed experiment](../playground/keychain/README.md) provides bounded feasibility
evidence, not production security/lifecycle acceptance. The master key still
protects marker HMAC, owner/auth contexts, internal verifier credentials, Photos
web sessions and Mail/Calendar ledgers after Apple passwords move.

| Phase | Outcome and dependency | Observable completion gate |
| --- | --- | --- |
| K0 | Select native API/accessibility, production signing/renewal and an authenticated caller design; prototype only with synthetic values. | Dedicated signed runtime and broker distinguish this sealed application from arbitrary same-user Bun scripts. Generic Bun, path/UID checks and a plaintext-export helper are insufficient. Changed signed releases and unauthorized controls, setup authorization and supported login/lock lifecycle are tested; unverified contexts remain explicit. |
| K1 | Build separate master-key/account-password custody ports, versioned authority/settings, CAS journals/tombstones, compatibility tooling and stable custody paths. K0 policy is a dependency; fixture-only work may proceed while external signing inputs remain pending. | Crash/concurrency tests preserve authoritative source and identities; active Keychain never falls back to file/SQLite. Unsupported old formats/signatures are rejected. Container/file mode remains explicit. No production cutover yet. |
| K2 | Move the original master key first; preserve exact bytes and every derivation/AAD/installation context. Requires K0/K1. | Populated marker/account/session/auth/verifier/Mail/Calendar validators pass, restart succeeds without UI or owner reenrollment, protected restore/rollback is accepted before legacy file retirement. |
| K3 | Move every connected account password with stable UUIDs/revisions and explicit per-account authority; integrate add/rotate/revoke. Requires K2. | CAS and interrupted-write recovery preserve routing/grants; real rotation/revocation invalidates Photos sessions/readiness and cannot resurrect stale credentials. Custody-only moves retain valid sessions. Revoked accounts remain tombstoned. |
| K4 | Integrate signed artifacts, setup/doctor/LaunchAgent, ordinary update, recovery/rollback/reinstall and both uninstall modes. Requires K2/K3. | Whole-outcome acceptance and independent review pass. One-time setup authorization is observed; ordinary runtime/updates remain unattended. Retained uninstall/reinstall preserves both stores; opt-in full removal handles exact owned items/state and interrupted cleanup. Actual rollout requires separate authorization. |

The next bounded slice is K0's caller/signing/API design and isolated prototype,
as detailed in the plan. The [stock Bun boundary experiment](../playground/keychain/runtime-boundary.md)
reproduced external-script/preload execution under an unchanged signed standalone
executable. Stock compilation plus signing is insufficient; K0 now requires a
native pre-JS code-loading boundary before any broker can release credentials.
No Keychain operation was involved, and K0 has not passed. K1 fixture contracts
remain independent; K2/K3 activation remains gated. K1's first inactive foundation
now provides both custody ports/exact selectors and a master authority journal
with original-key HMAC, atomic fsynced writes, phase/generation CAS and exclusive
leases. The inactive account SQLite journal now adds HMAC-bound pointers/cleanup,
epoch CAS, atomic ciphertext cutover and revision/session-aware revocation. Synthetic
process-death/concurrency tests cover storage only; neither journal calls Keychain.
Read-only master interruption inspection retains committed authority and all lock/
staging evidence; account cancellation/exact-selector availability recovery now use
CAS without revising credentials or sessions. Operational stopped recovery,
account add/rotation adapters and settings/compatibility/backend
integration remain pending; K1 is not complete and runtime custody is unchanged.
The product startup path now checks explicit file authority/format/UUID/generation
and unfinished custody intent, and refuses native selection or unsupported account
journals before current consumers can reinterpret them. Proof/review paths use a
stable custody-directory setting with unchanged defaults. This is no native backend
or operational maintenance/installer compatibility gate.
No production identity is presumed available; sealed
Bun packaging and authenticated peer-channel feasibility are unverified. Open
decisions are signer custody/renewal, Keychain implementation/accessibility,
supported OS/login contexts, protected recovery retention/export, and whether
complete removal should become the uninstall default. Keep current retained-state
semantics until that product choice is made; explicit opt-in complete removal must
not delete a master key while retained ciphertext needs it. Local removal does
not revoke Apple passwords or securely erase backups.

No Keychain migration or OS lifecycle tests have been run in the K0 investigation.
The previous certificate experiment was self-checked, not independent review;
its retained sources remain historical evidence and must not ship as a production
helper or signer. Planning changes do not modify the historical checkpoints below.

## Historical implementation checkpoints

| Checkpoint | Goal and dependency | Observable completion gate |
| --- | --- | --- |
| CP1 | Establish the actual HTTP application test boundary and align exposed scope. | Built Streamable HTTP app → MCP → service → typed fake provider completes initialization/discovery/search/read/exact mutation; anonymous/malformed/stale/missing targets have no writes; no general send/draft/attachment tools; listeners shut down. |
| CP2 | Complete mailbox contracts on the CP1 harness. | Batch outcomes, pagination, unread/flags, trash/restore/archive/junk, capability-based tags and unsubscribe discovery/execution boundaries have positive and failure E2E fixtures; no unsafe expunge or blind retry. |
| CP3 | Implement owner bootstrap/admin and durable storage ports. | Persistent single-owner enrollment, protected credentials, restart/recovery and private route checks; provider validation uses explicit fixtures until live setup. |
| CP4 | Integrate maintained Passkey/OAuth provider. | Actual local registration/login/code/token/refresh/revocation flows protect MCP/admin. Synthetic authenticator is labeled; real Passkey is a user checkpoint. |
| CP5 | Package native Mac and Linux/Apple Container modes. | Dev/build/release/runtime separation, installed artifact startup, proxy MCP methods/headers, restart/state/cleanup checks on both modes. No build or dependency install at runtime. |
| CP6 | Verify setup prerequisites and actual integrations. | Tailscale installed/authenticated/online and private setup route checked before Passkey/iCloud prompts; actionable install/login/recheck guidance. Actual owner Passkey, selected mailbox observations and Codex/ChatGPT eligibility/account linking complete with required user participation. |

## CP1 plan before execution (historical scope)

This records the original CP1 boundary; the accepted next Mail scope below
supersedes its send/draft exclusion for later work.

Expose only implemented in-scope tools. Remove the legacy public general-send,
draft and standalone attachment surface and send permission configuration. Keep
provider primitives needed for later unsubscribe internal. Add typed error and
batch-outcome vocabulary without pretending all batch tools exist. Validate
message existence and UIDVALIDITY before writes; ensure search ordering does not
assume provider order. Exercise the built production HTTP/MCP/service modules
through the SDK client with a stateful fake provider, explicitly injected dummy
authentication and no Apple network access. Include actual request/response and
state assertions, not only mocked service calls.

The fake-auth application is test scaffolding only. Full authentication remains
CP3/CP4. Missing tools remain absent until their use cases and acceptance tests exist.

## Setup prerequisites

The setup UI must begin with topology-aware prerequisites for both native and
container modes: discover whether Tailscale is installed, authenticated, online
and able to reach the private setup endpoint. Missing prerequisites must present
install/login/recheck actions and preserve progress; do not request Passkey or
Apple credentials first. Installation/login requiring user action is explicit.
ChatGPT account/workspace developer eligibility must be checked before promising
connection availability; exact current eligibility guidance belongs to the
integration step, not a fabricated success condition.

## Status

CP1 and CP2 completed and independently reviewed. CP3/CP4 owner setup and authentication integration is independently accepted for automated local integration. CP5 final native and Linux checks passed; independent lifecycle review is recorded separately. CP6 private native setup is reachable; owner ceremony and public/client integration remain pending.
Prior playground and workspace checks remain supporting evidence only.

### CP1 gate evidence

`bun run checkpoint` passed on Bun 1.4.2: strict typecheck, build, 14 application
tests and two built HTTP E2E tests (34 E2E assertions). One E2E uses the typed
fake provider port; the other reaches the actual iCloud adapter and ImapFlow
through a scripted loopback IMAP server. Exact UID STORE/MOVE and read-only
selection are observed; stale/missing targets and unauthorized requests produce
no writes. General send/draft/standalone attachment tools and send configuration
are removed. Auth is explicitly a fixture verifier in these E2Es, not proof of
owner login. Independent checkpoint review passed; no live mailbox was used.

### CP2 gate evidence

`bun run checkpoint` passed and was independently repeated: strict typecheck,
build, 47 application tests (104 assertions), and four built E2E tests (98
assertions). Auth/storage component tests included in that count do not approve
CP3/CP4. The mailbox surface now includes precise batching, pagination, flags,
capability-aware organization/tags and bounded unsubscribe discovery/submission.
Missing/ambiguous targets prevent writes; unverified STORE/MOVE outcomes remain
unknown. Actual production POST policy runs against a controlled socket with DNS
pinning, no redirects/auth/cookies and bounded responses; TLS handshake and live
iCloud behavior remain integration checks. No live mailbox was contacted.

### CP3/CP4 integration gate (independently accepted)

The current `bun run checkpoint` passes strict typecheck, server/browser builds,
58 unit tests (172 assertions) and five built E2E tests (147 assertions). The new
owner E2E has 46 assertions across actual dual HTTP routers, maintained Passkey
cryptography, owner SQLite storage, provider-validation fixture, PKCE OAuth and
MCP access. It tests prerequisite/proof/UV rejection, enrollment closure, scope
enforcement, rotation/revocation, restart and missing authentication-state denial.
It uses a synthetic authenticator and a fake provider boundary; it does not prove
a browser ceremony, actual Apple credentials, Tailscale routing or client UI.

Runtime now uses explicit TOML configuration and existing owner state. Explicit
initialization creates protected external custody files without printing secrets.
See [local setup](local-setup.md). SQLite array-type migration warnings from the
auth dependency remain visible; actual persisted token/session/scope behavior is
covered by restart tests rather than assumed from the warning.

The final compatibility gate also verifies OAuth security schemes in actual
`tools/list` wire output, with matching compatibility metadata, and a write-scope
challenge on an unauthorized tool call. Private admin navigation redirects an
expired/missing owner session to private Passkey sign-in; mutation APIs remain
denied. Strict TypeScript checking now includes build/release/install scripts.

### CP5 final runtime evidence

Final native artifact installation/lifecycle fixtures pass five tests (41
assertions). The actual nonroot Linux application image runs the five built E2E
tests (147 assertions) and survives two runtime restart cycles with persistent
state; test-only dependencies are isolated from the production image. This is
application/runtime evidence, not a live Apple or ChatGPT connection.

### CP6 private setup reached (partial)

A project-local native installation is running from its immutable installed
artifact with protected configuration, external custody and an owned PID/log.
A new private Tailscale Serve listener on HTTPS 8443 forwards only to the private
application listener. Existing Serve routes were compared before and after and
preserved. Actual private HTTPS health, setup status and setup HTML return 200;
installed/authenticated/online/private-reachable prerequisites all pass. Owner
enrollment remains incomplete. Anonymous MCP is denied; no public Funnel route
has been enabled. The user follows the private wizard, clicks Set up Passkey, completes a real
Passkey ceremony and provides the Apple app-specific password there. Proof and credentials have not been read or printed in chat. Public OAuth
routing, actual Codex/ChatGPT connection and live mailbox acceptance follow that
user-owned step; this checkpoint is not complete.

### Post-checkpoint audit fixes (historical source evidence)

A continuation audit found HTML-only messages could produce an empty body. The
source now enables the parser's HTML-to-text fallback and tests real MIME through
the actual HTTP MCP read handler (full and bounded summary results). The source
gate passes strict build/type checks, 62 unit tests (181 assertions) and six built
E2E tests (164 assertions). A separate configured Codex client artifact is
exported with a validated concrete URL, marketplace manifest and workflow skill;
ChatGPT registration remains a manual remote-connection step. Artifact structural
checks are not client-installation evidence. The already-running immutable native
release is unchanged by these source fixes; do not assume the HTML fix is deployed
until a separately versioned update is verified and deliberately installed.

### Previously queued immutable 0.1.1 update

The HTML fix is now packaged as a separate 0.1.1 native artifact/archive and
Linux image, with a matching configured client artifact. Native installed-launcher
startup and the Linux HTML-only HTTP/MCP regression each pass 17 assertions.
Native, current built source and Linux index checksums match. The running private
0.1.0 instance is deliberately unchanged while user enrollment is pending; a
later controlled update must preserve state/custody/routes. See the ignored local
instance readiness runbook for queued artifact locations. No publication or
commit is implied by creating these local artifacts.

### Guided setup update 0.1.3

The native private instance now runs immutable 0.1.3 with the guided English-first
i18next UI and server-only bootstrap authorization. State, custody and existing
Serve routes were preserved. Installed-artifact checks cover JavaScript delivery
from a hidden installation directory (one test, 25 assertions); the built owner
HTTP integration passes 50 assertions. This supersedes the historical queued
0.1.1/live 0.1.0 status above. Actual owner enrollment remains user-controlled;
no public Funnel or real mailbox connection was activated automatically.

### Passkey account-label regression 0.1.4

The live native instance now runs 0.1.4. The supported provider registration
resolver returns `iCloud Plugin owner` for both WebAuthn account labels while
retaining an opaque user ID. The framework-only email is derived separately.
A staged session resumes setup instead of generating another credential.
The actual HTTP options—not only page text—are asserted by the built owner
E2E (55 assertions), alongside signed registration/login and OAuth/restart.
Installed-artifact checks pass 25 assertions; live private HTTPS options confirm
the two friendly account labels and `iCloud Plugin` RP name. State, custody and
routes were preserved. Existing saved authenticator labels are not rewritten.

### Requested account label 0.1.5

The live private native service now sends `iCloud Plugin Admin` for WebAuthn
user.name and user.displayName, with `iCloud Plugin` unchanged as the RP name.
The exact label is verified through the actual private HTTPS options and the
55-assertion owner E2E. This is a label-only update; existing records, custody
and Serve routes were preserved, and no physical credential was created.

### Account connection wording 0.1.6

Live native setup now uses **Connect your iCloud** with the iCloud Plugin brand
in both locales. Current capability remains Mail. Completion separates account
enrollment from public endpoint preparation and Codex/ChatGPT authorization.
The real owner has completed enrollment; the wording update preserved that
state, custody and all routes. Funnel/client activation remains pending. Strict
build and three admin HTTP tests (23 assertions) passed, with independent copy
review and actual private HTTPS text verification.

### Connect ChatGPT tutorial 0.1.7

Step 4 now guides ChatGPT setup using individually copyable name, description,
configured public MCP URL and a read-only latest-five-email prompt. Both locales
include Developer mode/Plugins, OAuth dynamic-registration and owner Passkey
instructions. No connection tracking or new checkpoint is implied. Strict build,
eight admin/auth UI tests (42 assertions), and built owner HTTP E2E (64 assertions)
pass. Source review and actual served HTML verification passed; real ChatGPT
connection still requires public endpoint activation and user authorization.
Native deployment preserved completed enrollment, custody and Serve rules.

### Scoped namespace deployment 0.1.8

The live native application uses `/icloud` for setup, admin, assets, auth and
MCP. Standards discovery uses only the two canonical origin-root well-known
suffix routes. Issuer/resource and internal verifier registration migrated without
rewriting owner, Passkey or Apple credential records. Existing browser sessions
may require owner login again; legacy external OAuth connections must reconnect.
Full checkpoint passes, including six built E2E tests (191 assertions); native
installed lifecycle passes 25 assertions. Exporter schema/URL regression passes.
Deployment-scope tests pass four tests/31 assertions (owned installation, root
rejection, proxy scope and streaming shutdown). Independent source review passed.

Private Serve8443 now mounts only `/icloud`, with the same path repeated on its
proxy target. Root ingress is404; unrelated8460/8463 and Funnel configuration were
preserved. Actual private HTTPS confirms setup/assets and enrolled readiness;
canonical public-backend metadata and anonymous401 were checked locally. The Mac
was locked for final0.1.8 browser screenshot/clipboard recheck; prior0.1.7 clipboard
behavior was verified. No public exposure, real mailbox action or credential
ceremony occurred during this deployment.

### Observed ChatGPT dialog tutorial 0.1.9

The live tutorial matches the user-observed Create custom MCP server dialog,
including Server URL, OAuth, acknowledgment and Create as a plugin. Six numbered
icon headings organize its instructions. Static selectable copy values replace
form-like textareas; copy icons show a temporary checkmark and accessible live
feedback, with Range selection for manual fallback. Product description is
`Connect your AI assistant to iCloud.`; supported-capability and public-readiness
limitations remain separate. Strict build, owner HTTP E2E81 assertions and
admin/auth UI8 tests42 assertions pass; independent source review passed. Scoped
private deployment preserved enrollment, custody and all routes.

### Tutorial emphasis 0.1.10

The deployed tutorial uses safe text/strong segments for actionable labels in
both locales. Advanced OAuth settings guidance is conditional on successful
discovery; failures direct the user to fix public reachability and retry. Strict
build, targeted admin/copy tests (4 tests,39 assertions) and independent review
passed. Actual private HTML strong markup was verified; enrollment, custody and
scoped routes were preserved. A separate authorized operation configured public
Funnel mounts; external DNS/reachability remains a separate verification gate.

### Test and command workspace separation

E2E scenarios now live in the separate `apps/e2e` Bun workspace and import the
existing private built application modules, rather than bundling production source into
tests. App component/unit tests are colocated beside their source modules.
Reusable lifecycle tooling and its tests live in `packages/tooling/src`; root
`bin` files are thin command entrypoints. Strict workspace types, build, unit
suites (65 app tests/261 assertions and 5 tooling tests/37 assertions), and four
external built-service E2E scenarios (154 assertions) pass. Direct adapter
component tests now live beside their implementation; no catchall package API
was introduced for tests.
A temporary native artifact passed installed-runtime lifecycle (25 assertions),
and release contents exclude the E2E project, tooling source and app test/source
files. A moved executable-mode issue was caught and fixed with explicit runtime
launcher permissions. The rebuilt Linux image also passed the four external E2E
scenarios (154 assertions) and two runtime restart/shutdown cycles, including
non-root UID 10001, private loopback health, direct-host private ingress rejection,
and retained key state. Temporary test instances were removed. This structural
change did not redeploy the live service.

## Product sequence and current priority

The agreed sequence is **Mail → Calendar → Drive → Contacts → Photos**, followed
by cross-feature workflows. Calendar and later stages require their own provider
feasibility and scope checks; this sequence does not claim implemented support.
Current priority is reliable existing Mail read/organize behavior. Resolve the
observed UIDPLUS-without-MOVE compatibility gap with staged failure tests before
implementing the now-accepted general send, reply and draft-creation scope. No new feature implementation or
live mailbox mutation is part of that compatibility fix. Source UI improvements
remain queued while the owner tests the currently installed service.

### UIDPLUS compatibility gate

The read-only authenticated provider diagnostic confirmed UIDPLUS and no MOVE.
The adapter now uses checked single-UID stages rather than the SDK's combined
fallback. Fourteen local wire-protocol cases cover confirmed success, missing
COPYUID, rejected/lost COPY/STORE/EXPUNGE, unverified state and absent capability.
Five built HTTP MCP scenarios (44 assertions, including the existing native-MOVE
scenario) passed: organize:junk completes under the UIDPLUS fixture and each
failed stage stops the remaining batch as unknown without affecting an unrelated
Deleted UID. Strict app types and build passed. These fixtures establish local
implementation behavior; no live message was changed and this fix is not yet
installed in the currently running service.


### Next Mail checkpoint: send, reply and drafts

After the 0.1.11 MOVE release and UIDPLUS compatibility gate, implement the accepted
[composition contract](mailbox-tools.md#accepted-next-mail-scope-send-reply-and-draft-creation).
These are next source changes, not tools claimed to be exposed by the current
service. Existing client grants do not automatically gain sending permission.
This supersedes earlier send/draft exclusions without retroactively changing CP1
or CP2 evidence. Mail remains ahead of Calendar → Drive → Contacts → Photos.
Forwarding, composition attachments, implicit reply-all and existing-draft editing
remain deferred.

Before tool exposure, settle the durable operation-token ledger, conflict and
concurrency handling, restart reconciliation and retention contract. Then verify
bounded explicit composition, exact-original reply threading, Drafts SPECIAL-USE
APPEND identity, recipient-level SMTP partial/rejected/unknown outcomes and no
blind retries through production-path fixtures. Separate mail.send policy/scope
from mail.write draft access and mail.unsubscribe; update consent/tool metadata
with the same authorization contract. Run strict types, build, E2E and independent
review before this checkpoint is called complete. No live message is sent,
replied to or saved by these documentation changes; actual provider acceptance
remains separately authorized and unexecuted.

### 0.1.11 installed checkpoint

The reviewed UIDPLUS, explicit persisted auth limiter, shared UI and workspace
refactor were installed in the owned native instance after an authorized brief
restart. Final gate: 80 app tests/334 assertions, 5 tooling tests/37 assertions,
8 built E2E tests/182 assertions, and installed-runtime lifecycle25 assertions.
Owner/Passkey record counts, custody bytes and Serve/Funnel settings were unchanged.
Post-update HTTPS setup/status and both discovery documents returned200; enrollment
and readiness stayed true; anonymous MCP401 and public setup404 remained enforced.
This verifies deployment, not a live mailbox move. Only current and immediate
rollback runtime releases were retained; temporary release staging was removed.

### Owner-reported live MOVE/Junk acceptance (2026-10-02)

The owner reported that the existing ChatGPT connection moved one selected
Kraken message to Junk, then a batch of seven, each reported succeeded. Follow-up
searches found none remaining in INBOX and all eight in Junk. This is user-reported
live acceptance of MOVE/Junk on 0.1.11, not assistant-observed logs. The connector
needed no reimport. Trash was subsequently verified by the owner as recorded below. No assistant-initiated
mailbox mutation was performed.

### Outbound source checkpoint (0.1.12)

Send, reply and create-draft now have typed schemas, fixed account sender,
separate false-default `allow_send`/`mail.send` gates, explicit reply recipients,
read-only bounded header lookup, verified draft identity and encrypted durable
operation receipts. Existing grants are not upgraded. Existing-draft editing
and sending an existing draft are not implemented; this is a follow-up limit,
not a claim that the full draft lifecycle is complete.

The full checkpoint passed106 app tests/349 assertions,5 tooling tests/37
assertions and9 built E2E tests/201 assertions. A final all-recipient4xx refusal
regression then passed with the updated focused23 adapter/service tests and
outbound HTTP E2E1/19. The native installed artifact lifecycle passed1/25.
No real outgoing mail or draft creation has been performed. Sending must remain
disabled until explicit owner enablement and new OAuth consent for mail.send.

0.1.12 was subsequently installed with sending disabled and configuration
unchanged. Owner/Passkey/client/consent record counts and custody bytes were
preserved; Serve/Funnel routes were unchanged. Live discovery does not advertise
mail.send. HTTPS setup remained ready/enrolled, sign-in and discovery200,
anonymous MCP401, public setup404. No live send, reply or APPEND was performed.
Current and immediate rollback releases alone are retained; temporary artifacts
were removed. An explicit allow_send enablement and new OAuth consent remain
necessary before any real sending action.

### Owner-reported live Trash acceptance (2026-10-02)

The owner reported that the main ChatGPT connection moved53 explicitly selected
LinkedIn/promotional messages into `DeletedMessages`. Follow-up verification
found all53 original source UIDs absent and destination UIDs34095–34147
(inclusive) present with UIDVALIDITY1322976237. This is owner-reported live Trash
acceptance, not independently retrieved assistant logs. The assistant did not
repeat any move or inspect message content.

The native release remains0.1.12. Send/reply have not been live-accepted,
`allow_send` remainsfalse, and new mail.send OAuth consent is pending explicit
owner approval. No live SMTP submission or draft APPEND was performed by the
assistant.

### 0.1.13 bounded correction

Reply original identity is retained on pending replay and receipt-write failure.
Independent targeted service15/15, built outbound HTTP1/19, strict build and
installed lifecycle1/25 passed. The native instance was updated with unchanged
configuration, grants, custody and routing; mail.send remains disabled.

During update, the previous process stopped listening but took more than10
seconds to exit after SIGTERM; it later exited without force. No data loss was
observed. Bounded shutdown with active HTTP connections remains a lifecycle
follow-up; the exact cause is not yet established.

### Owner-approved sending enablement (2026-10-02)

After the owner explicitly paused cleanup and confirmed no in-flight mutation,
the existing0.1.13 instance received the single allow_send=true configuration
change and a graceful same-release restart. Live discovery now includes
mail.send; readiness/enrollment remain true. All existing account, Passkey,
client, consent, access/refresh token records and custody/routes were unchanged.
No grant was expanded. Scott must personally complete new OAuth consent for
mail.send; existing registered clients may require a new connection registration.
No SMTP submission, draft APPEND or remaining cleanup action was performed.

### Owner-reported live draft acceptance

The owner reported at20:28 that an explicitly requested recipient/content draft
returned draft_saved, and readback from Drafts UID430/UIDVALIDITY4 matched the
requested sender, recipient, Chinese text and emoji. No SMTP submission occurred.
This is user-reported acceptance; the assistant did not recreate the draft. An
initial non-UUID operationId was rejected; the UUID request succeeded. The next
Mail hardening checkpoint makes this UUID requirement explicit in schemas, tool
descriptions and actionable errors.

Existing-draft editing/sending remains a separate unimplemented lifecycle step;
current tools create a new draft or submit a newly specified message/reply.
Multi-account work is deferred until after original Mail priorities.

### Mail hardening — source checkpoint verified, not deployed

The operationId UUID requirement is now explicit in actual MCP schemas and static actionable validation errors. Privacy-safe operation events identify only tool/action, opaque correlation, duration, outcome and counts. Graceful shutdown rejects new work and waits for accepted provider operations even after caller disconnect; the regression reproduced a pending SDK transport promise and avoids mistaking transport lifetime for unfinished mailbox work.

The already prepared single-account admin controls are now wired to persisted operator policy, seeded from current installation settings without changing OAuth grants. Owner HTTP tests cover immediate disablement, confirmation before re-enable and an unchanged read-only grant. The packaged icon is served; dynamic plugin ZIP download remains separate and is not exposed as a working action.

Verification: `bun run checkpoint` passed strict typechecks/build, 122 application tests (382 assertions), 5 tooling tests (44 assertions), and 10 built HTTP E2E tests (224 assertions). Independent focused review passed. These results describe source output; live release remains 0.1.13 pending the ongoing read-only OAuth diagnosis and a coordinated update window.

The candidate now also includes a private owner-authenticated plugin ZIP download generated on demand from immutable installed template files and the configured public MCP URL. Local installed-artifact download/extraction checks passed; hosted import, live deployment and any additional OAuth consent remain separate acceptance steps.

### Candidate 0.1.14 release receipt — not installed

The native candidate's complete built application/template tree matches current build output byte-for-byte; subsequent doctor and container-context fixes change tooling only. Native server archive and configured client ZIP both report 0.1.14. The CLI ZIP and installed runtime's generated ZIP are byte-identical for the same configured public origin; extraction integrity passed. Final tooling checks passed 6 tests/51 assertions. The isolated Linux image passed 11 E2E tests/236 assertions (see deployment README), including the new archive route; the audit image was cleaned up rather than retained as a published release.

Remaining acceptance: approve a coordinated live update window; resolve the existing client's send-scope issue without silently modifying grants; owner-run send/reply acceptance; hosted private plugin import acceptance. Existing-draft editing/sending is still unimplemented. Multi-account and later Calendar/Drive/Contacts/Photos work remain deferred behind Mail priorities.

#### 0.1.14 candidate HELD — known resource insert-only defect; do not deploy

Prepared artifacts (SHA-256):

- Native directory: `.flow-runtime/build/native-candidate-0.1.14-zip`.
- Server archive: `.flow-runtime/release-candidate-0.1.14/icloud-plugin-0.1.14-darwin-arm64.tar.gz`, `0a6c6b8de3c183984a957cd46693b6a0825fb1a19986b5a3786f4086df432bc1`.
- Client ZIP: `.flow-runtime/client-candidate-0.1.14/icloud-plugin.zip`, `a06dd93703d073ba9f3466eeb534aed6b4f33b141b00fb4e67acafaca5db4b94`.

Last read-only check: installed release 0.1.13, owned PID 16118, readiness/enrollment true, `allow_writes=true` and `allow_send=true`. Revalidate process identity and current symlink immediately before acting; a stale PID is not authorization to stop another process. Candidate policy initialization seeds these current flags once, without changing existing OAuth client ceilings, consent or token grants. Subsequent capability changes require authenticated owner actions; policy persistence is a behavior change included in this candidate.

After explicit deployment approval: confirm no in-flight mail actions; send SIGTERM only to the revalidated owned process and wait for exit. If it does not exit within the observation window, report rather than force-kill or start a competing instance. Nominal downtime is seconds, but the older release has previously taken over ten seconds to exit. Preserve config and custody. Make any database backup only after the process has exited, retaining SQLite database/WAL/SHM together as applicable, or use SQLite's consistent backup API; never copy a live database file alone. Keep backups private and never print contents.

Install the prepared native directory through the existing scoped `bin/install update` operation, retain release 0.1.13 as the exact rollback target, and start the same instance/configuration with a new owned PID record. Rollback changes only the owned release symlink after stopping the new process; do not reset credentials, owner state or grants. Check private readiness/enrollment, public resource/issuer metadata and scopes, anonymous MCP challenge, and public denial of private admin/setup routes. Do not send mail, create drafts, move messages or perform token/grant inspection as a deployment test. Preserve all Tailscale routes and unrelated services.

No deployment step above has been executed. The owner withdrew approval for this candidate after the resource insert-only defect was confirmed. These immutable artifacts are held and are NOT deployable; the procedure above is historical preparation, not an instruction to proceed. Preserve the recorded hashes and never rebuild corrected code under this same artifact identity. A corrected production artifact does not yet exist. Regression work is still evolving and is not claimed complete; a newly identified, independently verified release will be required before another deployment decision.

Current release disposition: live 0.1.13 remains unchanged. Candidate 0.1.14 is held for the confirmed resource insert-only defect, not awaiting approval. No production code, configuration or grants were changed by this status update.

### Corrected 0.1.15 candidate — validated and ready for review; not deployed

Production OAuth resource initialization now explicitly uses the pinned provider's `resourceSeedMode: 'merge'`, supplying only the canonical resource identifier and supported scopes. This reconciles the app-owned resource ceiling while preserving other resource policy fields and existing client/consent/token scopes. It does not repair an old registered client's permission ceiling or grant sending automatically. The regression retains the insert-only baseline and invokes the actual production factory after reopening the stale resource database; independent source checks passed 2 tests/109 assertions.

New immutable native artifact: `.flow-runtime/build/native-candidate-0.1.15`. Server archive `.flow-runtime/release-candidate-0.1.15/icloud-plugin-0.1.15-darwin-arm64.tar.gz` SHA-256 `99218ab7702870467bfa9fb820bd1ad0a81c6d1ef9369fd1e79d8a85f42499de`; client `.flow-runtime/client-candidate-0.1.15/icloud-plugin.zip` SHA-256 `a5e208dab5a8859cd8d2cce178e45c264db1713093b1059c658f308d6d3406d3`. Native owner/download HTTP checks passed 2 tests/100 assertions. Baseline test-fixture providers are excluded from runtime and declaration output. Installed-artifact upgrade plus ZIP download checks passed 2 tests/70 assertions: the stale fixture SQLite database is reopened by the installed production module, fresh consent gains the supported scope, and prior grants/tokens and unrelated resource fields remain unchanged. Final Linux validation passed 11 E2E tests/236 assertions plus the installed production resource-upgrade regression 1 test/60 assertions, under UID 10001 with no test-fixture providers in runtime. The tested image manifest digest was `sha256:eff7ae93de4d7bee40c6e5e4d79f839d61c3ac5d1ce70b1115e85fba324bd3ea`; the audit image and fixture resources were cleaned up, and the builder restored to stopped. Independent native artifact review passed. Candidate 0.1.15 is ready for review, not deployment approval. Version 0.1.14 remains held with its original hashes.

### Owner-approved 0.1.15 deployment completed

After explicit approval, the owned native instance was updated from 0.1.13 to the verified 0.1.15 candidate. The old process exited gracefully; stop/install/start/readiness took 2.63 seconds. New owned PID 35960 was recorded. A private backup was taken after shutdown, and 0.1.13 remains the rollback release. Configuration/custody were preserved; no Tailscale routes were changed.

The canonical `/icloud/mcp` resource now contains `mail.read`, `mail.write`, `mail.send` and `offline_access`. Metadata-only comparisons confirmed unchanged existing client, consent, access-token and refresh-token scope rows/counts, and unchanged unrelated resource policy fields. No token secret was read or printed. Local doctor checks all passed; private icon returned 200 and unauthenticated admin redirected to sign-in, while public private routes remained 404. No mailbox operations, sends, drafts, new client registrations or consents were performed. Existing client ceilings and user-driven ChatGPT consent remain separate acceptance steps. Version 0.1.14 remains held and was never deployed.

### Incremental-consent catalog correction — source only

Policy-enabled descriptors are now visible independently of the caller's existing token scopes. Write/send descriptors include mandatory `mail.read` plus their action scope. Calls still enforce scope before operation/provider execution. Step-up challenges include canonical metadata and only still-enabled prior mail scopes, avoiding a request for a capability the owner disabled. Actual descriptor/screenshot-rule simulation tests passed 2 tests/22 assertions; strict build/typechecks and built owner OAuth/MCP E2E passed 1 test/90 assertions. This is not a ChatGPT UI acceptance result. No deployment, client/grant mutation or new artifact occurred for this correction; live 0.1.15 remains unchanged.


### Fresh ChatGPT install and live send/reply acceptance — parent-reported

On 2026-10-02, a fresh reinstall with **empty Base scopes** succeeded on deployed
0.1.15. Parent-reported metadata records client
`YByabnjWIiXQpCCaDEOrbNnkuPqoSzau` creation at 22:38:05Z, consent at 22:38:30Z and
token issuance at 22:38:35Z with mail.read/mail.write/mail.send. Reading works and
mail_send/mail_reply are visible. The original user-authorized send returned
submitted at 22:41:57Z; the parent reports matching subject/body received in Gmail
as message `1a0fec81ac508bbc`. This documents parent-reported live acceptance,
not an independent mailbox check by the documentation worker.

Base scopes is not necessary for this successful fresh-install path. The earlier
tools-list circularity hypothesis is not a confirmed root cause. Reconnect or
permission upgrade of the existing plugin without reinstall remains unverified. The discovery correction and new icon changes remain source-only;
neither was deployed for this successful 0.1.15 test. Earlier pending-send
statements above are historical. The latest user report relayed by the parent
confirms iCloud → Gmail → iCloud → Gmail: all three emails received in one thread,
with correct In-Reply-To and References. Real send/reply/threading acceptance is
**PASS** for this path; no further mail tests are requested. This remains
parent-reported evidence, not a new verification by the documentation worker.
See [scope diagnosis](oauth-request-scope-diagnosis.md).

### Candidate 0.1.16 — source and native artifact verified, not deployed

Includes reviewed policy-based descriptor discovery, mandatory read+action scopes, policy-aware consent challenges, and the monochrome cloud icon. Strict build/typechecks passed. The installed native artifact's actual auth AND MCP modules passed the same-client fresh-consent upgrade regression together with private ZIP download (2 tests/88 assertions); independent artifact review passed 1 test/78 assertions. Prior access tokens remain unchanged, and legacy clients with a narrower registered scope ceiling remain unsupported by this change. This is server-side evidence, not proof of ChatGPT UI reauthorization.

- Native candidate: `.flow-runtime/build/native-candidate-0.1.16`.
- Server archive: `.flow-runtime/release-candidate-0.1.16/icloud-plugin-0.1.16-darwin-arm64.tar.gz`; SHA-256 `ad8130e96fb3b6800685d8a47c8aae8520babf07d5a45cc9388a32f111b47b62`.
- Client ZIP: `.flow-runtime/client-candidate-0.1.16/icloud-plugin.zip`; SHA-256 `66db151f9937dfff5b4a3e7c0e548493d2dc745a3ac9dbf2074336766c7ec580`.

Final Linux verification passed 11 E2E tests/236 assertions and the installed auth+MCP scope regression 1 test/78 assertions. Tested image manifest: `sha256:48634e2909b1ee70ed0f1fbc0924d8920dea97446235f920261bc894f551ed7e`; runtime UID 10001, fixture exclusion and matching monochrome icon verified. Audit resources were cleaned and builder state restored. Candidate 0.1.16 is ready for review; live 0.1.15 has not been changed, and artifact preparation does not authorize deployment.

### Owner-approved 0.1.16 deployment completed

Preflight found the previous recorded PID 35960 already absent, neither owned listener active, and the private route returning 502 before deployment. The last operation event was completed with activeCount 0. No process was killed; the cause and duration of that preceding outage are not established.

After a private stopped-state/custody/config backup at `backups/pre-0.1.16`, the verified candidate was installed and started as owned PID 9988. Backup/install/start/readiness recovery took 3.63 seconds; this is not a measurement of the prior outage. Version 0.1.15 remains the rollback release. Existing client, consent and token scope rows/counts, canonical resource policy (excluding provider timestamp), operator capability policy, configuration and custody were unchanged. No routes, grants or permissions were modified.

All 13 local doctor checks passed. The served monochrome icon SHA-256 is `45d7e7c2026e7cfb419a6977178401dad1b2d1dcdafdd0417c4ace840985d0bd`, matching the candidate. No mail calls, new OAuth consent or token-secret reads occurred. Actual ChatGPT no-reinstall permission upgrade remains unverified.

### Candidate 0.1.17 — independently reviewed Mail extensions; not deployed

Adds bounded attachment download/send, revision-checked existing-draft read/edit/send, and forwarding as original MIME. Independent rereview approved the queued-revocation and decoded-attachment-size fixes. Sending a draft retains it; replacement saves a new draft before moving the previous version to Trash. Inline-content and signed/encrypted drafts are rejected. No new OAuth scopes, grant migration, or live mail/auth actions are introduced. Existing mail.read/write/send grants and operator policy remain enforced; real ChatGPT no-reinstall consent acceptance is still open.

Native candidate: `.flow-runtime/build/native-candidate-0.1.17` (darwin/arm64, Bun 1.4.2).

- Approved packaging output: `.flow-runtime/release-candidate-0.1.17-clean/icloud-plugin-0.1.17-darwin-arm64.tar.gz`, SHA-256 `45807b3a408b73d9f4776f3687a3996606846ce89b730989cb0ba5121f69aa5a`.
- Client ZIP: `.flow-runtime/client-candidate-0.1.17/icloud-plugin.zip`, SHA-256 `ace92b22bbd5f4f325c24394406136b7327971524485810de7a69aeb2411c1d4`.
- The first archive under `release-candidate-0.1.17` contains macOS AppleDouble metadata and is superseded; do not use it. The clean archive was created with `COPYFILE_DISABLE=1 bun bin/release` into a new immutable directory.

Final source checks passed typechecks/build, 142 application tests, 8 tooling tests, and 11 built E2E tests/236 assertions. Artifact-selected tests load the candidate's actual extension service, outbound adapter, ledger, auth and MCP modules: 18 tests/115 Bun assertions pass, including 16 extension regressions plus signed same-client OAuth lifecycle and isolated temporary-install startup/restart/shutdown. The 2 MiB HTTP cap is retained and 300 KB attachment HTTP/SMTP E2E passes.

Archive audit: 10,913 regular files match the candidate byte-for-byte; 652 symlinks resolve inside it; all 123 application build files match. Application fixtures/tests, private config, .env, custody, databases and runtime PID files are absent. Third-party production dependencies retain their upstream package contents. Client ZIP passes extraction integrity and exact six-file allowlist/version/endpoint checks. No remote publication, Linux candidate, installation or deployment occurred. Live current remains releases/0.1.16-darwin-arm64.

Deployment requires its own approved window: verify the candidate identity and owned PID/listeners, gracefully drain/stop only this instance, take a stopped-state backup, run the scoped existing install-update command for this candidate, start with the unchanged external config, record the owned PID, and run read-only doctor/metadata/admin-boundary checks. Preserve 0.1.16 for rollback. Do not reset state, rewrite grants, reconfigure routes, reinstall the client, or send mail as a health check. Interruption is the owned-process stop-to-readiness interval; expect seconds after drain when idle, but active writes may extend it and no fixed downtime is guaranteed.

### Owner-approved 0.1.17 deployment completed (2026-10-03)

Scott approved the concrete deployment proposal. Preflight verified the approved clean archive SHA-256 `45807b3a408b73d9f4776f3687a3996606846ce89b730989cb0ba5121f69aa5a`, candidate bytes, owned PID16520/listeners, private readiness and last observed activeCount0. The owned process drained and exited without force. After a stopped-state backup at `backups/pre-0.1.17`, the scoped update installed 0.1.17 and started owned PID47095 with unchanged external configuration. Shutdown took0.100s; stopped-to-readiness2.322s; total stop-to-readiness2.422s.

All13 read-only doctor checks pass. Installed artifact metadata identifies0.1.17 and all123 compiled files match the approved candidate. Read-only metadata comparisons preserve all existing client, consent, access-token and refresh-token scopes/identities/counts, resource policy excluding provider update timestamps, and operator capabilities. Configuration/custody bytes and modes match before deployment. No token secrets were selected or printed. No mailbox calls, sends, drafts, fresh consent, new grants, route changes, or unrelated service changes occurred.

Installed MCP production-module discovery with observed operator policy and inert providers returns19 tools, including mail_attachment_download, mail_draft_read, mail_draft_edit, mail_draft_send and mail_forward. This is an installed-module check, not an authenticated live ChatGPT tools/list call: the conversation's cached tool catalog still has14 tools. Actual client refresh and no-reinstall permission upgrade remain unverified.

Rollback release0.1.16 remains intact and was not used. No state backup restore was required.

## Owner-approved 0.1.18 deployment (2026-10-03)

Scott approved redeployment of the independently reviewed optional persistent-access candidate. Archive SHA-256: `38707e06a311a918c6a8a59400afbbe80b7f77e0445461f44457cafe53c58ff8`. The 12-file source patch applied after exact baseline/candidate hash checks. Live current is releases/0.1.18-darwin-arm64, owned PID58210. Previous PID47095 was idle and exited gracefully; stop-to-readiness was2.753s (shutdown0.105s). Stopped backup: backups/pre-0.1.18; rollback0.1.17 retained and unused.

All13 read-only doctor checks passed and all123 compiled installed files match the approved candidate. Installed-module discovery with inert providers lists20 tools, including mail_request_persistent_access requiring mail.read+offline_access. This is not an authenticated ChatGPT discovery check. Configuration/custody bytes/modes and selected nonsecret client/consent/access/refresh/resource/operator metadata remained unchanged. No mail calls, actual persistent-access invocation, new consent/grant, or routing changes occurred.

Before packaging, candidate checks passed143 application tests,8 tooling tests,11 built E2E/236 assertions,18 artifact tests/146 assertions. Independent source/test review found no blocking issues. Explicit confirm=true is required before the server issues the optional tool challenge; enabled prior grants are preserved. Ordinary tool scope requirements are unchanged. Real ChatGPT metadata refresh, consent ordering, and later refresh credential use remain unverified; owner consent is still separate.


## Accepted multi-account connection change (2026-10-03)

The user selected ChatGPT's plugin details **Connect another account** entry.
Initial setup now enrolls the owner Passkey without Apple credentials. Client OAuth
authorization must offer existing accounts and provider-validated account addition,
then bind explicit consent and subsequent refresh/tool use to one selected account.
Existing account/grant identity and account-specific references must remain isolated.
This is one owner's multi-account service; unrelated-owner registration is outside
scope. Earlier multi-account deferral records above are historical.

See [the accepted authentication contract](setup-and-auth.md#multiple-icloud-accounts-through-client-authorization).
Source work does not deploy the running installation or establish live ChatGPT
acceptance. The final source snapshot passed application/tooling typechecks,
production/browser builds, application units (170 tests / 813 assertions), tooling
units (nine / 97) and built E2E (11 / 253). Independent source findings are closed.
Rendered browser interaction and live ChatGPT account/profile/reconnection acceptance
remain open; see [current status](current-status.md#multi-account-source-checkpoint-2026-10-03).


### Published native application release 0.1.20

Release 0.1.20 delivers one owner's multiple iCloud accounts through client OAuth:
setup finishes with a Passkey, each authorization selects or adds a validated
iCloud account, and grants/refresh/profile identity and message references stay
bound to that account. Existing active single-account credentials and grants
migrate to the original stable account; revoked unknown legacy identity stays
unusable. Private administration rotates or locally revokes the named account.

PR #5 merged at `b87f3d7fd7756bb176f48d3e944585412e490add`. The stable
[native v0.1.20 release](https://github.com/decompozr/icloud-plugin/releases/tag/v0.1.20)
is published and the existing installation was upgraded through the shipped CLI.
The protected stopped pre-update backup and previous release are retained; owner,
Passkeys, grants, configuration/custody and the original account migration were
checked after startup. See [current status](current-status.md#application-0120-release-and-installed-upgrade-2026-10-03-utc)
for archive, backup and process evidence. Independent post-upgrade audit passed 13 doctor checks, both SQLite
integrity checks and 33 stopped backup-entry byte/mode comparisons. Older-binary rollback restores compatible state and release together.
Rendered browser and live ChatGPT add-account/profile/reconnection acceptance
remain outstanding.
