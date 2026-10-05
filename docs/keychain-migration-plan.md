# Dual macOS Keychain migration plan

Status: **Revised K0 under the accepted user-level trust boundary; K1 foundations/preparation slices implemented, K1 incomplete; native custody unselected and real migrations not performed**
(2026-10-05). This plan covers
both required migrations: every connected account's Apple app-specific password,
and the exact existing 32-byte installation master encryption key. These are
different secrets. Moving passwords does not retire the master key.

Source inventory baseline: `22acfe419189b6a37e16bc5ee812928bc4ebec6b`, including
merged PR #29's closed Keychain experiment and PR #34's Photos reviewer change.
The [roadmap](roadmap.md#dual-keychain-migration-roadmap-planned) carries the phase
dependencies. This document authorizes no credential access, migration, runtime
installation, signing-identity provisioning, publication or destructive cleanup.

## Intent, evidence and gaps

The owner requires automatic native setup provisioning, setup-time macOS
authorization when necessary, unattended runtime reads and ordinary updates, and
an uninstall path that accounts for Keychain custody. Existing account/installation
identities and authentication must survive. The requested outcome includes both
stores; neither is optional backlog. Default uninstall retains state today. The
owner has not decided whether complete removal should become the default.

The [engineering knowledge](knowledge.md#macos-keychain-custody-and-update-identity-2026-10-05),
[experiment report](../playground/keychain/README.md) and
[self-checked evidence](../playground/keychain/evidence.json) establish synthetic
create/read/delete and changed-binary continuity under one exact certificate and
identifier. Bun and a user LaunchAgent worked in the existing unlocked login
session. Ad-hoc rebuilds, different signers and different identifiers were denied.
This is file-based Keychain feasibility, not production migration acceptance or
independent review. No real Developer ID release, renewal, actual Always Allow
ceremony, lock transition, reboot/login, pre-login operation or uninstall passed.

The main gaps are a production signing/API/caller boundary; explicit custody
authority outside transactions; migration of all master-key dependents; account
mutation coordination; and backup/reinstall/removal behavior. Existing source
evidence supports the inventory below, while proposed behavior requires the
acceptance gates in this plan.

## Current custody and consumers

Paths below describe repository source, never permission to inspect a live store.

| Current consumer | Existing contract that migration must preserve |
| --- | --- |
| [Installation](../apps/icloud/src/server/installation.ts), [entry point](../apps/icloud/src/index.ts), [settings](../apps/icloud/src/server/settings.ts) | Explicit `--initialize` creates `master_key_file`; normal startup reads exactly 32 bytes. Owner-only regular files/directories, key/marker outside state, and incomplete initialization fail closed. Runtime does not provision automatically. |
| [Owner store](../apps/icloud/src/storage/owner-store.ts) | Installation UUID, owner and pending/enrolled marker authenticated with HMAC; legacy credential v1 conversion; `mail_accounts` ciphertext v2 bound to owner/account/version. Registry IDs, normalized users, labels, `legacy_account` and revisions survive. |
| Owner-store `provider_sessions` | Photos web session ciphertext bound to owner/account/realm/accountRevision/generation. Rotation/revocation atomically clears session secret and increments generation. Preserve still-valid sessions during custody-only migration. |
| [Application](../apps/icloud/src/server/application.ts), [owner auth](../apps/icloud/src/auth/owner.ts), [connect](../apps/icloud/src/auth/connect.ts) | `owner-auth-v1` and `local-owner-auth-v1` derive the auth secrets; signed OAuth queries, existing sessions and provider auth remain compatible. `icloud-resource-client-v1` derives encryption for `plugin_auth_private`, including issuer/resource-specific internal verifier credentials. Preserve the exact derivations and existing records; do not register replacement clients to hide decryption failure. |
| [Mail module](../apps/icloud/src/mail/module.ts), [outbound ledger](../apps/icloud/src/mail/storage/outbound-ledger.ts) | Selected OAuth account supplies `{user, appPassword}` for IMAP/SMTP. `outbound-ledger-v1` protects owner/account-bound receipts; preserve pending tombstones, message IDs and unknown outcomes. No replay becomes a new send. |
| [Calendar module](../apps/icloud/src/calendar/module.ts), [Calendar ledger](../apps/icloud/src/calendar/storage/ledger.ts) | Same selected-account credential, with credential fingerprint checks before dispatch. `calendar-ledger-v1` protects policy, operations and sync snapshots/tokens with existing hashed owner and owner/account namespaces. Preserve `outcome_unknown` and disabled policy. |
| [Photos cloud setup](../apps/icloud/src/photos/cloud-setup.ts) | Separate private Apple web login/2FA, not the app-specific password. Its saved session uses master-key ciphertext and account-revision CAS. This plan retains that encryption; it does not replace web login with an app password or claim remote Photos readiness. |
| [Readiness evidence](../apps/icloud/src/admin/evidence-state.ts), [admin](../apps/icloud/src/admin/handler.ts) | Evidence depends on account generation, policy epoch, allowed scopes, client grants/tokens and sessions. Backend switching must invalidate stale evidence without expanding scopes or fabricating provider capability. Account selection never silently falls back. |
| [Local owner](../apps/icloud/src/auth/local-owner.ts), application and [setup plan](../packages/tooling/src/setup-plan.ts) | `bootstrap-proof`, `local-owner-proof` and Photos review-directory paths currently derive from `dirname(master_key_file)`. Introduce a stable custody-directory concept without moving or exposing these files implicitly. Preserve local/public origins and Passkey RP context. |
| [Installer](../packages/tooling/src/install.ts), [release CLI](../packages/tooling/src/release-cli.ts), [artifact builder](../packages/tooling/src/build-artifact.ts), [doctor](../packages/tooling/src/doctor.ts) | Immutable version directories/current pointer, stopped-service updates and owned prefix; uninstall retains state/custody/config/marker/logs. Doctor currently checks key-file metadata only. Build has no signed native custody component. |
| [LaunchAgent](launch-agent.plist.example), [deployment lifecycle](../deployment/README.md) | Current user-login service invokes generic Bun with a JS entry point; optional job registration is separate. Linux/container mode uses mounted custody and has no direct macOS Keychain access. |

The inherited architecture/operations documents contain historical proposals.
The current source inventory above controls this plan; this work does not rewrite
unrelated historical sections. Exact key preservation keeps existing cryptographic
contexts intact rather than introducing a re-encryption or key-rotation project.

## Proposed architecture and security gates

### API, signing and caller boundary: K0

Use a native custody component with an explicit Keychain implementation. The
recommended starting candidate is SecItem with the data protection Keychain,
non-synchronizing items and the narrowest approved access group. Apple documents
login-context, app-like packaging and provisioning-profile constraints; access
groups differ from file-based ACLs. The experiment's certificate-pinned ACL result
does not validate this candidate. A SecItem/file-based candidate requires its own
selection rationale and constrained access policy. Do not ship the deprecated
probe APIs unchanged. [Apple TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)

K0 must select accessibility and UI-suppression behavior against the supported
OS matrix. Avoid per-read user-presence requirements, automatic unlock passwords
and synchronization into unrelated devices. Runtime fails explicitly when the
selected store is unavailable. Before macOS user login, and before plugin owner
Passkey login, are different states: background startup after macOS login must
work without a plugin-owner ceremony; pre-macOS-login operation is unverified and
is not promised. Lock/logout/reboot behavior needs its own acceptance.

Production releases need a stable authenticated code requirement and a documented
signer renewal/rotation policy. An identifier or install path alone is inadequate;
ad-hoc signatures identify a particular build. Keep signing keys exclusively in
the release/build custody boundary, never artifacts or installed runtime. No
production identity is assumed available. An exact certificate pin demonstrates
continuity but does not resolve renewal or distribution.
[Apple requirement language](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html),
[Apple signing tasks](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html)

**Accepted design revision (2026-10-05):** official Bun remains the application
runtime. The same macOS user is the local trust boundary; app-only isolation from
arbitrary same-user programs is not an acceptance requirement. Remote owner and
account authorization remain unchanged. This product decision supersedes the
previous mandatory sealed-runtime/authenticated-caller proposal.

Use a small native custody component for the selected standard Keychain API.
Authenticate the helper to Keychain using its approved code/signing policy, and
allow the trusted local Bun application to invoke bounded operations. A helper
returning plaintext to the same local user is permitted under this boundary; it
must never be represented as protecting against other same-user programs. Do not
accept remote connections or expose secrets through HTTP/MCP, argv, environment,
logs or artifacts. Exact installation/account/revision selectors, separate runtime
reads and administrative mutations, caller-owned buffers and explicit unavailable
errors remain required. No generic arbitrary-item Keychain interface is added.

The local channel and helper packaging must be designed against realistic
accidental exposure and cross-user/remote access. Private OS-user access and fixed
protocol operations can implement the accepted boundary; they do not prove app
identity. Helper substitution/signing and ordinary update continuity still need
qualification, without requiring that macOS identify the executing JS payload.
The application retains its own owner/account authorization and journal CAS.

**Retained stronger-boundary findings:** the [stock Bun report](../playground/keychain/runtime-boundary.md)
shows external entry/preload execution under the same signed executable, including
the strict-option follow-up. The [peer report](../playground/keychain/peer-boundary.md)
shows that socket peer-token lookup does not authenticate an earlier message.
These observations remain valid; no credential extraction was demonstrated.
They prevent claims of sealed application/caller isolation, which is now outside
scope, rather than blocking standard Keychain custody. No custom Bun build,
native embedded runtime or XPC app-origin proof is required by revised K0.

**Execution order:** define one bounded experiment question, reuse existing
results, reconcile findings in knowledge, revise this plan/roadmap, then implement
the accepted result. K0 is not automatically passed by changing the threat model.
Its remaining gates are the actual selected Keychain API/access policy, standard
helper/Bun protocol, setup approval, noninteractive failure behavior, signing/update
continuity and supported login/lock contexts. Existing synthetic file-Keychain
results do not prove production signing or untested OS lifecycle behavior.

### Shared storage contract: K1

Propose distinct `MasterKeyCustody` and `AccountPasswordCustody` ports behind the
existing owner/account authorization contract. Versioned settings explicitly
select native Keychain or the existing file backend; container behavior remains
explicitly file-based until a separately authorized host-broker design exists.
No automatic platform fallback or mount of a macOS user's whole Keychain.

Use an installation-scoped namespace and fixed schema version. The master item
uses installation UUID; password items use installation UUID, owner ID, stable
account UUID and credential revision/generation, never email/path alone. Exact
service/account/access-group selectors prevent cross-install collisions. Store
only the app password in its item; retain normalized user/label in SQLite and
reconstruct the existing `{user, appPassword}` consumer shape with identity
checks. Unsupported legacy opaque credential bytes need explicit remediation,
not lossy parsing or an assumed Apple password.

Record nonsecret custody authority, generation, operation ID and cleanup status.
The master-key authority record must be discoverable before opening the
HMAC-dependent owner store; it cannot exist only behind that store. Propose an
owner-private, atomically replaced/fsynced custody manifest whose installation
binding is verified against the marker/DB after obtaining the key. Account
authority/pointers/tombstones are transactionally committed in owner SQLite.
No exported key/password or public password digest belongs in either record.
Manifest tamper/loss never permits reprovisioning or file fallback. Backend mode
and a format/version gate also prevent old binaries from interpreting removed
SQLite secrets as account revocation or recreating a missing key file.

**K1 storage foundation implemented, native activation inactive (2026-10-05):**
[custody contracts](../apps/icloud/src/storage/custody-contract.ts) define both
secret ports and exact installation/account/revision/generation selectors.
The [master authority journal](../apps/icloud/src/storage/master-authority.ts)
implements strict nonsecret metadata, original-key HMAC verification, phase and
generation CAS, exclusive installation leases and fsynced atomic replacement.
Discovery is untrusted until original-key verification; backend/generation
expectations can reject an authentic older file-mode snapshot. Complete snapshot
rollback is not detected if its independent policy is rolled back too. The HMAC
uses a new metadata-only context without changing any existing consumer context.
Lost replies require readback; unresolved staging and interrupted locks stop new
writers. Runtime does not select Keychain; startup now imports master discovery/
verification for file-mode compatibility checks only. Synthetic
process-death and cross-process lock tests are retained in
[storage verification](../apps/icloud/src/storage/master-authority.test.ts).
The inactive [account journal](../apps/icloud/src/storage/account-authority.ts)
adds original-key-authenticated SQLite authority/cleanup records and epoch CAS.
Explicit preparation baselines existing accounts together. Cutover atomically
commits the exact pointer and removes ciphertext without changing account revision
or provider sessions; real revocation advances revision and invalidates sessions
before external cleanup. Missing pointers cannot be rebaselined; unavailable native
custody retains authority without fallback. Synthetic tests cover competing writers,
stale results, tamper/mixed snapshots and process death before/after commit.
Caller authentication, leases, fresh native verification/deletion and asynchronous
read revalidation are still required; no runtime account adapter imports this component.
The inactive [exact master-copy coordinator](../apps/icloud/src/storage/master-key-migration.ts)
now supplies original-key intent/create/readback/fresh-validation/cutover sequencing
through injected ports and held journal/maintenance assertions. It blocks unresolved
staging before native requests, preserves exact bytes and rejects post-cutover file
requests. The full consumer validator, actual stopped maintenance, native startup/
settings transition, protected restore and file retirement remain unimplemented;
synthetic coordinator tests are not a K2 exit gate or native activation.
The owner portion of that validator now exists as
`SqliteOwnerStore.validateExistingCiphertexts`: supplied-handle read snapshots
authenticate marker, explicit legacy-v1/accounts-v2 format, all account ciphertext
and all retained Photos ciphertext using stored AAD, without schema repair or
plaintext output. Populated fixtures prove corrupted Photos state prevents
synthetic master cutover. Complete auth compatibility, Mail/Calendar and custody
journal validation/composition plus product maintenance wiring are still required.
The auth/internal-client crypto portion now has a supplied-handle snapshot validator
in [shared key contexts](../apps/icloud/src/auth/key-contexts.ts), also used by the
actual application derivations and private-client writer/reader. Original context
strings, hex encoding, storage ID and no-AAD envelope are preserved. It requires
the selected baseline v2 record and decrypts all retained private clients without
registering replacements. This establishes crypto/shape/presence checks only,
not row-slot authentication, OAuth-registry consistency or live Passkey/token/cookie
acceptance. Mail and Calendar now supply existing-handle snapshot validators:
`SqliteOutboundLedger.validateExistingReceipts` checks every finalized receipt
under unchanged owner/operation AAD and counts pending tombstones without
claiming they authenticate the key; `SqliteCalendarLedger.validateExistingPayloads`
checks retained policy/operation/sync ciphertext under stored owner/kind/id AAD.
They share normal decryption, require baseline-approved retained namespaces,
return counts and never create schema, repair state or replay operations. Complete
encrypted snapshots prevent cached Bun iterator advancement after an error from
skipping failures on retry; repeated-rejection fixtures cover auth and both ledgers.
The inactive [composed validator](../apps/icloud/src/storage/master-consumer-validation.ts)
now also authenticates every account custody state/cleanup HMAC and registry link.
An explicit authenticated stopped-snapshot baseline declares known consumer table
presence and exact count reports; missing, undeclared, partial or wrong-DB tables
and row-count omissions fail without rebaselining. Nested read snapshots require
real cross-store stopped-maintenance exclusion supplied by the caller. Populated
memory-port fixtures prove late internal-client corruption blocks master cutover.
An inactive [baseline store](../apps/icloud/src/storage/master-consumer-baseline.ts)
now validates and persists explicitly selected metadata in a create-only private
HMAC record bound to installation, operation and original master generation.
Format-2 master metadata now records exact planned baseline MAC/operation/original
generation before file creation, then CAS-marks establishment after fsync,
readback and fresh checks. An intent only permits its exact planned metadata;
established-file loss cannot recapture. Lost results reconcile retained readback
with file/directory resync and consumer validation; unresolved manifest staging
remains read-only evidence. The format-2 master coordinator authenticates the
established file before native requests. Current format-1 startup explicitly
rejects format-2 metadata even under file authority; no format-2/native runtime
adoption is enabled. Legacy format-1 administrative primitives remain fixture
contracts; actual operations must establish format-2 first. This is not a recovery
backup or full durability/rollback proof. An inactive
[initial capture coordinator](../apps/icloud/src/storage/master-baseline-capture.ts)
now requires the same installation's maintenance and authority leases and an
independent minimum authority generation. Explicit
authenticated selection declares consumer presence and the required auth slot;
all retained registry accounts (including revoked entries) supply current
Mail/Calendar namespaces. Independently approved historical identities cover
retained namespaces outside that registry without reviving accounts/sessions.
Each consumer validates before its counts are captured, full presence checks
apply, and durable baseline establishment follows with fresh state checks.
Format-2 history forbids recapture. The inactive
[existing-file adapter](../apps/icloud/src/server/master-baseline-preparation.ts)
now opens and authenticates the private nofollow single-link original key under
maintenance exclusion, then acquires authority mutation access before marker/DB
opens and capture. It supplies held inode/key/marker checks throughout
capture. SQLite create:false/readwrite permits normal hot-journal recovery; no
application factories/schema repair/provisioning/native backend run. Owned
handles/key buffers are closed/cleared before release. Bun/SQLite pathname opens
do not exclude hostile same-user filesystem races. The operator selection/
authentication command and exclusion of old/custom writers,
protected backup/restore, same-count/historical rollback protection, operational
maintenance, live auth/session compatibility and actual native acceptance remain
pending; composition/persistence are not the K2 exit gate.
The inactive [password-copy coordinator](../apps/icloud/src/storage/account-password-migration.ts)
now drives exact noninteractive readback, create-only provisioning, verification
and fresh-read cutover through injected ports. Lost create replies never cause
blind mutation retries; missing/changed verified items prevent cutover. It checks
maintenance/epoch after awaits and clears owned byte buffers. Caller authentication,
actual stopped leases and K0/K2 acceptance remain prerequisites; no native port or
runtime entry point is wired. Synthetic memory-port tests are not Keychain proof.
Read-only master interruption inspection now distinguishes the committed manifest
from one authenticated next staging record, retaining all evidence and locks.
It never proves a writer stopped, grants a lease, reconstructs a missing manifest
or promotes an uncommitted cutover. Account cancellation preserves SQLite authority
and queues exact staging cleanup; native availability restoration requires the
retained exact selector and epoch after fresh caller validation. Neither restores
revoked access or changes credential revision/session state.
The inactive account cleanup coordinator now checks an authenticated exact cleanup
item and current epoch before and after native calls. A delete reply retains
intent; only a separate noninteractive read reporting exact-item absence
acknowledges it. Synthetic cancellation, revocation, lost-result and concurrency
checks do not authorize a live backend or prove operator exclusion.

The inactive account journal additionally supports explicit format-2 rotation
intent and verification. An original-key HMAC pins replacement bytes to the exact
next revision/generation/operation without storing the password. Pending rotation
retains the old active pointer and provider sessions; commit atomically advances
the registry revision/pointer, invalidates sessions and queues the old selector.
Cancellation preserves the old authority and queues the next-revision staging
selector; revocation tombstones both dependencies. The header upgrade makes old
format-1 journal implementations refuse opening it; ordinary runtime still
rejects all account journals. These are storage primitives: provider validation,
operational add/rotation adapters remain pending. The inactive injected-port
rotation coordinator now creates, freshly verifies, then freshly rechecks and
commits a replacement. Lost create replies resume by exact read; verified-item
loss never causes recreation. Resupplied input must match the durable HMAC and
private per-call copies prevent caller buffer changes during awaited requests.
Synthetic tests cover reopen, cancellation/revocation races, loss/conflict and
input ownership; no live native backend or runtime integration is selected.

The inactive format-3 account addition/reconnection journal and injected-port
coordinator reserve a stable registry UUID with no readable pointer, pin password
bytes by original-key HMAC and publish authority only after separate fresh native
verification and commit. Existing duplicates conflict; reconnect requires the
revoked UUID/epoch and preserves its label with a new revision. Cancellation and
revocation retain exact staging cleanup without generation reuse. Header upgrades
make older journal implementations refuse opening new intent; rotation preserves
format-3 headers. Provider validation, authenticated stopped operation, custody-
aware account availability and native/runtime routes remain unintegrated. All
acceptance here uses synthetic state and an injected memory backend.

The inactive async account credential reader derives stored-credential metadata
from authenticated authority rather than SQLite ciphertext presence. Its status
describes authority/pending/revoked/recovery, not native reachability. It reads the
exact native selector noninteractively after cutover, never SQLite or another
account on failure. Supported strict UTF-8 Apple provider envelopes (at most 65536 bytes) retain exact
bytes; opaque, malformed or mismatched-user legacy payloads fail closed. Native raw UTF-8
passwords are losslessly wrapped in the same provider fields. Revision/custody-epoch
snapshots fence late reads and can guard dispatch/readiness/session acceptance;
this consistency check does not authenticate callers. Returned buffers belong to
callers; parsed JS strings cannot be securely erased. Admin credential mutations still need transactional custody adapters before
this port can be selected in production. Readiness evidence now accepts an optional custody
snapshot and includes authority/epoch as well as semantic revision; synthetic
in-flight evidence checks reject late reads after custody changes even when
revision is preserved. The current runtime factory does not select this option.
No runtime authority or recovery is changed.

Calendar now accepts the reader as an optional module dependency and awaits
credential loading through its registered tool factory. Injected custody metadata
permits native-authoritative accounts with cleared SQLite ciphertext. Snapshots
are rechecked before provider dispatch and after reads, preventing stale sync
commits/readiness; observed write outcomes remain durable after dispatch even if
revocation follows. Credential backend failures are bounded provider errors, not
OAuth scheduling step-up challenges. Policy activation fences each provider discovery request and validates account
reads, then rechecks all snapshots/owner/policy/account selection after awaited
validation. Retained service access also rechecks the snapshot before ledger
status/policy use.
Synthetic registered-module checks exercise these branches; the runtime factory
still passes no reader and K0/native activation remain unpassed.

Mail now accepts an optional async reader through a monitored per-tool execution
hook after schema/identity checks. A per-invocation async context holds the loaded
credential and snapshot; concurrent accounts retain separate contexts. Profile and
persistent-access confirmation use metadata only. IMAP session methods fence
snapshots before dispatch and after reads; stale selection/download results release
leases or cancel streams. Observed mutation replies remain publishable after
dispatch. Outbound claims require current custody, while receipt finalization uses
the already-admitted exact account namespace so revocation cannot discard a
confirmed or unknown SMTP result. This is method-level/provider-call fencing, not
proof of each internal protocol packet or sealed native caller identity. Registered
module tests use synthetic providers; the runtime factory selects no reader.

Admin dashboard status now accepts an optional custody metadata reader. It
projects only stable account identity/display fields and stored-credential status,
without password IO or journal metadata. Native-authoritative accounts remain
visible after ciphertext retirement; revoked/recovery accounts are unavailable.
Reader errors deny status without SQLite fallback. When selected, this reader
blocks existing add/rotate/revoke routes before provider validation or legacy
writes until transactional custody maintenance adapters are integrated. Actual
authenticated authority fixtures cover native and revoked status and this gate.
Production composition supplies no reader; this checkpoint does not activate
native custody or complete account administration.

OAuth account connection now accepts an optional custody metadata reader for
chooser listing, selection and persisted consent lookup. It retains existing
account UUID/session/request binding and one-time consent consumption without
secret IO or journal fields. Snapshot fences after awaited continuation and signed
consent verification reject late publication after revocation/custody changes.
Unavailable authority cannot use SQLite status as fallback. Account addition
with this reader returns CREDENTIAL_MAINTENANCE_UNAVAILABLE until a transactional
custody writer is integrated. Synthetic signed OAuth requests with actual journal
state cover successful native selection and revocation during continuation.
Owner-auth now accepts the same optional reader for grant reference checks,
refresh response authorization, bearer account validation and client recovery.
Exact owner/account metadata is fenced through assertCurrent; reader errors or
revoked authority deny access without SQLite/another-account fallback. Existing
legacy mapping, grant references, scopes, Passkeys and auth derivations remain
unchanged. The full local HTTP/Passkey/OAuth fixture runs in legacy and injected
custody modes with cleared legacy credential metadata, exercising refresh,
recovery, restart and account isolation. Epoch-only changes preserve existing
grants; unavailable/revoked custody denies bearer and revoked refresh issuance.
These custody ports are synthetic metadata, not real Keychain availability or
sealed caller proof. Snapshot checks do not establish atomicity between provider
token issuance and concurrent custody mutation; operational exclusion/acceptance
remains required. Production application composition still supplies no reader.

An inactive AccountCredentialMaintenance adapter now composes provider validation
with addition/reconnect, rotation and revocation journals. It holds the supplied
stopped-maintenance guard across validation, rechecks owner/epoch before intent,
privately snapshots borrowed password/operation metadata, and redacts provider
rejections. Known duplicates and malformed inputs cannot initiate provider work
or an intent. Each native coordinator guard includes the per-call owner binding,
so owner loss during a read cannot add, verify or commit a staged item. Native advancement remains one explicit reconciled step per call with
exact password resupply; revocation records a local tombstone and exact cleanup
dependencies rather than deleting items or revoking Apple credentials. Synthetic
actual-journal fixtures exercise rejected/late validation, lease/owner loss,
rotation, reconnect identity, input mutation and staged advancement. Caller
authentication, real stopped-operation orchestration, K0/K2 and HTTP/command
integration remain required; no runtime route selects this adapter.

Stopped owner authorization now has an inactive read-only verifier using the
installed Better Auth HMAC-SHA256 signed session cookie and existing session/user
rows. It requires the real InstallationAccess maintenance lease for the exact
custody directory, configured origin/cookie name/auth derivation and authenticated
owner binding. Reusable guards reject expiry, deletion, owner/session replacement
or lost exclusion without invoking auth migrations, session refresh/cache or
enrollment. Genuine local Passkey/OAuth fixtures stop HTTP and validate their
issued cookie while preserving persisted session rows; synthetic negative cases
cover scope/signature/duplicate-cookie/schema failures and runtime-lock denial.
This is a session-authorization primitive, not a sealed native caller or an
operational migration command. Safe retained DB/key/marker opening, operator
selection, older-writer exclusion, K0 and command composition remain required.

Operational stopped recovery, account add/rotation adapters, settings/format gates, custody
paths and backend integration are still required for K1 completion.
No all-consumer or Keychain validation is implied by advancing a fixture phase.

**Product startup compatibility slice (2026-10-05):** stable `custody_directory`
now routes retained proofs/reviews without changing their default location.
Explicit `[custody]` format-1 file selection binds installation UUID and a minimum
manifest generation. Startup checks authority/unfinished intent before key access,
verifies the original-key manifest before owner open, and rejects unsupported
account custody tables. Keychain selection remains disabled before file/DB access,
never a fallback; containers reject it at parsing. No automatic migration or
manifest provisioning occurs. Operational maintenance coordination, native account
adapters and qualified installer/release compatibility acceptance remain pending.
The current installer now requires a candidate custody declaration for initialized
state and inspects selected/default configuration before deployment writes.
Format-2/native master authority, account custody journals, partial installations,
running cooperating runtimes and owner-DB recovery/checkpoint requirements reject.
Successful metadata/schema inspection holds maintenance exclusion through release
selection; it reads no key bytes and does not repair state. It does not verify
manifest HMAC, artifact signatures or operator authentication, discover other
custom configs, or prove old/custom writers stopped. Old installers do not gain
these protections. Qualified signed update/rollback/reinstall and native lifecycle
acceptance remain K0/K4 gates, not conclusions from synthetic installer checks.

`credentialStored` means an active authoritative pointer, not `secret != null`.
Expose distinct redacted states for locked, denied, missing, migration-pending,
revoked and recovery-required; unavailable is not revoked or ready. Every read
checks current owner/account/revision/backend. All operations prohibit UI outside
the explicit setup/recovery ceremony. Bound failures and suppress restart/prompt
loops; recovery guidance must remain available through a diagnostic path that
does not require successfully opening master-key-dependent auth state.

## Durable migrations and mutation ordering

SQLite and Keychain cannot share a transaction. Stop/drain the owned service for
initial migration, checkpoint SQLite consistently, and acquire an installation
migration lock with recorded operation identity. Reject concurrent setup, update,
uninstall and credential/session writes. Recovery reconciles recorded intent with
exact items; it never steals a lock by age or blindly retries an ambiguous write.
Hold no SQLite transaction across interactive Keychain work. Use transaction/CAS
checks on expected IDs, revisions and authority after every external operation.

The current Bun runtime entry point additionally holds an installation-wide
`InstallationAccess` lease before installation/database opens and until shutdown
drain, module disposal, database closure and key clearing finish. Maintenance
acquires the same exclusive namespace before the authority mutation lease and
supplies its verified maintenance callback. Crashed/unfinished leases remain
blocking; no PID-based theft or automatic deletion is implemented. This excludes
cooperating new runtimes, including a second process, but cannot establish that
older releases/direct storage users/custom writers stopped. Explicit operator
exclusion, protected crash reconciliation, safe capture and the administrative
command remain required. This does not satisfy K0 or authorize native activation.

### Exact master key: K2

| Durable state | Transition and restart rule |
| --- | --- |
| `file_authoritative` | Existing key/marker/state remain valid. Create a consistent stopped recovery snapshot before migration. Missing/invalid file is recovery failure, not a new key. |
| `copy_intent` | Persist installation, operation ID, expected format and target selector before adding the original 32 bytes. File remains the declared source. Duplicate/missing acknowledgement requires reading and constant-time comparison of the exact target in memory; conflicting value/ownership is a hard stop. Never replace a duplicate blindly. |
| `keychain_verified` | Fresh authenticated reads with UI prohibited return the same bytes. Verify marker HMAC, registry/legacy link, all existing credential/session envelopes, remote/local auth derivations, internal verifier ciphertext and every existing Mail/Calendar encrypted payload using read-only validators. Empty fixture stores do not prove populated consumers. Preserve unknown operation states. |
| `keychain_authoritative` | Durably commit the custody manifest only after validation. New runtime reads Keychain exclusively; a locked/denied/missing item fails closed even if the file still exists. Crash after cutover uses this authority. |
| `file_cleanup_pending` → `complete` | After a restart and recovery/rollback gate, remove only the verified installation's legacy file and record absence. Interrupted unlink is reconciled without deleting Keychain. Deliberate protected recovery backups are tracked separately, never live fallback. |
| `recovery_required` | Any mismatched key, state/manifest/installation binding or unverifiable transition stops dependent operations and preserves evidence. No new key, owner enrollment or auth database regeneration. |

Do not change key bytes, salt/context strings, AAD, installation marker identity,
owner IDs or auth issuer/resource/RP ID. Before authority commits, resumption from
the explicitly declared file state is permitted; after it commits, returning to
file requires an explicit stopped reverse-migration procedure. Do not infer the
backend from whichever source happens to be available.

For a fresh installation, allocate and persist an installation identity before
Keychain provisioning, generate the master key once, and make pending setup
resumable. Partial Keychain/manifest/marker/DB creation must not create another
key or silently adopt an existing item. Configure signing/trust through setup;
ordinary runtime never creates or authorizes its own custody replacement.

### Per-account passwords: K3

Require K2 validation/cutover first so every remaining encrypted session/auth/
ledger still has its exact key. Migrate connected accounts individually with
fixed UUIDs; revoked accounts get explicit tombstones, not new password items.

| Durable state | Transition and restart rule |
| --- | --- |
| `sqlite_authoritative` | Existing encrypted credential remains source. Parse the supported Apple envelope, verify its user matches registry metadata and snapshot the current revision. Never read a different account as fallback. |
| `copy_intent` | Persist operation/target/expected revision; add password to a new immutable generation item. Fresh read must match the original password without logging it. Reconcile duplicate or ambiguous results by exact selector/identity/value, retaining SQLite authority until verified. |
| `keychain_verified` | Recheck revision, owner, account and current authority under CAS. If concurrent mutation won, do not activate this stale item; record exact orphan cleanup. |
| `keychain_authoritative` | One SQLite transaction commits the Keychain pointer and clears legacy ciphertext, preserving semantic revision for custody-only movement. Invalidate readiness via a separate custody epoch/authority input so a late probe cannot revive old evidence. Preserve OAuth grants/account selections and still-valid Photos session generations. |
| `cleanup_pending` → `complete` | Check pointer/state after restart; delete only unreferenced staging/old generation items. Record failures for resumable cleanup. SQLite WAL/backups may retain prior ciphertext; deletion is not secure erasure. |
| `revoked` / `recovery_required` | A tombstone denies reads immediately; missing/denied active Keychain items produce unavailable/recovery state and never a SQLite fallback. Unmigrated accounts remain in their explicitly recorded SQLite mode. |

Account addition and rotation validate through the existing provider boundary
before storing. Addition reserves a stable registry identity in pending state and
publishes availability only after verified Keychain write and pointer commit.
Rotation stages a new generation, then atomically advances the credential
revision/pointer, clears provider sessions and invalidates readiness. Late writes
cannot republish a revoked or changed revision. Retain the old generation until
no reader or recovery dependency exists, then remove it exactly. Duplicate-account
rules and reconnect-to-revoked-account UUID reuse continue to apply.

Revocation commits a new revision and tombstone plus provider-session invalidation
before deleting the previous item. A crash during deletion leaves inaccessible
residual custody with `cleanup_pending`, never a live password. In-flight Mail,
Calendar and Photos work must revalidate revision before provider dispatch/session
commit. If a network action already dispatched, preserve its actual/unknown
outcome; custody migration never authorizes a fresh replay.

## Setup, release, recovery and uninstall: K4

- **Dev/build/release:** use synthetic items in task-scoped namespaces. Ship the
  signed native component/runtime, validated requirement/entitlements, OS/arch
  and protocol versions, checksums and provenance in the artifact contract.
  Keep the Linux artifact separate. Development builds cannot access production
  items automatically. Build/release does not provision runtime custody.
- **Install/setup:** explicit setup provisions trust and both custody ports
  automatically for the owned installation, with a clear one-time authorization
  ceremony where required. Owner setup can finish without Apple credentials;
  each later connect/add provisions that account's password without repeated
  runtime prompts. Cancellation/denial leaves resumable closed state. Never ask
  for passwords in chat or expose them in CLI arguments, logs or MCP output.
- **Ordinary update:** verify installed and candidate signature/protocol/format
  before switching; require stopped backup and compatibility checks. Updates do
  not change ACLs/access groups, regenerate keys or request routine authorization.
  A signer transition is a separately tested recovery/trust event, not an ordinary
  update. LaunchAgent startup and doctor become custody-aware, with redacted status
  and no secret reads by a generic diagnostic process.
- **Rollback:** keep a custody-aware prior release able to read active formats and
  pointers. Rolling back to a pre-Keychain binary requires stopped explicit reverse
  migration or restoring a matching pre-migration release, config, both DBs,
  marker and protected custody snapshot as one set. It is not a symlink-only
  rollback. Account revisions, revocations and grants created since the snapshot
  must be reconciled before restore; do not resurrect access or replay operations.
- **Recovery:** missing/locked/denied items, changed signer and lost manifest have
  different remedies. Unlock/re-authorize only through deliberate owner recovery;
  never loop prompts. Password loss may permit owner-verified provider re-entry
  under the same account ID with normal revision/session invalidation. Master-key
  loss cannot be repaired by re-entering Apple passwords. Restore the exact key
  and consistent bound state from approved recovery custody, or explicitly report
  unrecoverable state. Never reopen enrollment.
- **Backups:** decide an approved protected master-key recovery/export method and
  perform restore acceptance before deleting the legacy file. Preserve DBs,
  marker, config and migration metadata consistently, while keeping recovery key
  custody separate. Do not promise portability from a copied Keychain file:
  Apple's current guidance describes additional backup dependencies. Do not build
  a product around private Keychain file internals or disable SIP for recovery.
  [Apple TN3137 backup guidance](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains#Backing-up-a-file-based-keychain)
- **Retained-state uninstall baseline:** stop/drain owned jobs, remove only owned
  runtime payload and optional owned job, retain installation identity, DBs,
  marker, config and both Keychain stores. A same-identity verified reinstall must
  reopen them without new keys or account IDs. Retention is reported explicitly;
  removing runtime must not strand a key behind an unavailable future signer.
- **Explicit opt-in complete removal:** preview owned installation/account item
  selectors and dependent local state, require explicit selection and recoverable
  removal intent, stop all writers, then retire the dependent state and exact
  Keychain items as one resumable operation. Inventory and verify absence while
  the signed remover still exists; preserve a nonsecret recovery journal if any
  step fails. Do not delete the master key while retained ciphertext/reinstall
  still needs it. No broad service-prefix/search-list sweep, whole Keychain
  deletion, unrelated account/job/route changes or provider-side effects.

Local credential deletion does not revoke an Apple password, and local OAuth
grant revocation is separate. Backup copies remain outside local deletion's
guarantee; no secure-erasure claim. Whether full removal becomes a default is an
unresolved owner decision. Retained state is the baseline until explicitly changed.

## Phases, ownership and next executable slice

The implementation owner owns K1–K4; the release/security owner supplies K0
identity/packaging decisions and signing custody; the installation operator owns
real authorization and lifecycle acceptance. The product owner decides removal
defaults and recovery retention. Independent review must assess each implementation
phase before proceeding. No dates or production signer availability are assumed.

| Phase | Gap, dependency and deliverable | Exit gate |
| --- | --- | --- |
| K0 | Qualify standard Keychain API/accessibility, signed helper, official Bun protocol and signing/update policy under the trusted local-user boundary. | Exact scoped synthetic operations and cross-user/remote denial; accepted setup authorization, unattended reads/changed releases/rollback and explicit supported lifecycle contexts. No app-only caller or custom Bun prerequisite. |
| K1 | Depends on K0 policy; introduce custody ports, explicit authority/format/settings, error model, per-account CAS, stable custody paths and compatibility tooling. Fixture state-machine work can proceed while external K0 inputs remain pending. | Crash/concurrency/authority tests pass for both stores; unchanged IDs/auth contexts and container behavior; installer rejects unsupported formats/signatures. No production migration activation. |
| K2 | Depends on K0 and K1; implement exact master-key migration and fresh setup, all-consumer validation, restart and protected recovery. | Populated fixtures preserve every inventory consumer; targeted native synthetic setup/update/recovery works; file retirement occurs only after restore acceptance. |
| K3 | Depends on K2; migrate each account password and add/rotate/revoke flows with tombstones, readiness/session invalidation and reconciliation. | Stable account grants/routing and CAS race tests; no stale credentials/session resurrection or fallback; both connected and revoked accounts covered. |
| K4 | Depends on K2/K3; integrate lifecycle packaging/doctor/LaunchAgent, update/rollback/reinstall, retained uninstall and opt-in full removal. | Whole-outcome acceptance below, independent review and an explicitly authorized operator rollout. Passing fixture checks do not claim live acceptance. |

**Next ready slice: revised K0 standard-helper contract.** Reconcile the closed
Keychain evidence against a small official-Bun/native-helper design. Specify exact
selectors, local transport, secret buffer ownership, runtime UI suppression and
administrative setup policy. Validate protocol behavior with injected synthetic
ports before implementation of a native backend. Record each actual native or
lifecycle check still missing; do not repeat the closed basic experiment or require
same-user app-only denial. Real Keychain operations, production signing and
installation require applicable authorization before dependent checks. Continue
through knowledge and plan reconciliation before selecting the backend; no real
credential migration or K0-pass claim follows from protocol fixtures alone.

## Whole-outcome acceptance and feedback

All rows are **required future checks, not executed in this planning task**.
Record source/release identity, OS/session context, observed result and redacted
failure status; retain useful durable evidence and independent review. Never
record key/password digests from real credentials or mail bodies in reports.

| Requirement / phase | Observable acceptance |
| --- | --- |
| Both stores / K2–K3 | Populated multi-account fixtures and authorized native acceptance show exact original master key and each selected password in Keychain, legacy active sources retired, all IDs and derivation/AAD contexts unchanged. No connected account is omitted. |
| Setup/no recurring prompts / K0,K4 | Fresh setup and migration cancellation/denial are resumable. Observe the actual one-time approval ceremony; after it, repeated fresh reads, changed signed releases, same-path replacement, rollback and LaunchAgent run without UI. Runtime missing/locked/denied never prompts or falls back. |
| Local trust boundary / K0 | Helper uses approved standard Keychain access/signing policy; local transport denies other OS users and remote access, with exact owned selectors and no generic secret export. Official Bun works without a fork. Same-user helper invocation is accepted, not claimed to be app-only isolation. Remote owner/account isolation remains mandatory. |
| Master consumers / K2 | Verify pending/enrolled marker HMAC, legacy and v2 accounts, Photos awaiting-2FA/authenticated sessions, remote/local auth context, internal verifier record, outbound finalized/unknown receipts, Calendar policy/sync/operation ciphertext and corrupt/wrong-key failure. Existing owner Passkey/OAuth login and refresh do not gain scopes or require reenrollment. |
| Startup/lifecycle / K0,K4 | Test plugin-owner not logged in, macOS lock/unlock, logout/login, sleep/wake, reboot after login and pre-login invocation separately. Establish supported availability; an unsupported context returns bounded unavailable state without restart/UI loops. No implied pre-login service guarantee. |
| Transactions/interruption / K1–K3 | Fault-inject before/after every intent, Keychain write/read, pointer/manifest commit and deletion, including successful mutation with lost reply, duplicate/conflicting items, manifest tamper/loss, SQLite/WAL errors and disk-full. Resume preserves declared authority and secret; no blind overwrite or fresh key. |
| Account concurrency / K3 | Competing migrators, add/rotate/revoke, late probes, Photos session saves and update/uninstall have one consistent winner; new revision/tombstone blocks stale reads/commits. Account A failure never routes to B. Custody-only move preserves sessions; real rotation/revocation invalidates them. |
| Restore/rollback / K2,K4 | Restore populated consistent backup with the exact key and replay-safe operation ledgers; missing key cannot reopen enrollment. Test compatible custody-aware rollback and explicit legacy restoration without reviving post-backup grants/credentials. Reinstall retained state preserves signer/item access and IDs. |
| Uninstall / K4 | Default uninstall retains both stores and bound state. Opt-in full removal removes only previewed owned items/state, verifies absence, and recovers interrupted removal. Retained dependent ciphertext never loses its key; backups and Apple-side revocation limits are disclosed. |
| Build/platform/privacy / K1,K4 | Native artifact signatures/entitlements/provenance verified; no signer private key or credentials packaged. Container/file mode stays explicit and tested. Doctor/setup plan/logs/token/MCP/client artifacts expose redacted status only. Full checkpoint plus meaningful targeted E2E and independent review pass. |

Open decisions/gates: actual production signer and custody owner; renewal/rotation
requirement; data-protection versus file-based implementation and accessibility;
standard helper packaging/local transport and unattended signing continuity;
supported OS/login availability; protected recovery/export/retention policy; and
default versus explicit opt-in complete removal. Missing external decisions block
their dependent activation, not fixture-only storage-contract planning.

Historical reproduction sources stay in `playground/keychain` as evidence, not
production helpers. New K0 prototype artifacts belong to its executor, with exact
synthetic selectors/jobs and task-owned raw logs recorded. Reconcile results into
this plan/knowledge before cleanup; delete only owned transient items/jobs/private
test signing material after verified inactivity and recovery preservation. Never
reuse disposable experiment identities as production signers.
