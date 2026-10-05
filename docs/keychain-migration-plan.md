# Dual macOS Keychain migration plan

Status: **K0 investigation, K1 storage foundations and product startup compatibility started; migrations not implemented or deployed**
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

**Recommended caller design, feasibility unverified:** a native broker accepts
requests only from a dedicated, signed application runtime over a peer-identity
channel. Evaluate XPC/audit-token based identity with the chosen API, rather than
assuming support. Validate the peer's live code identity against the approved
signer, identifier and release policy; same UID, caller-provided PID/path, a socket
permission or checking a generic signed Bun executable cannot establish it.
No generic CLI returns plaintext to arbitrary callers, and no endpoint accepts
arbitrary Keychain selectors, item deletion targets, code, shell commands or a
path supplied as identity.

**Bounded peer-channel finding (2026-10-05):** the
[Bun-run native fixture](../playground/keychain/peer-boundary.md) rejects unapproved
same-user programs using a socket audit token and exact CDHash. A controlled
shared-FD interleaving nevertheless authenticates a later approved writer for an
earlier unapproved request. Do not treat this Unix socket lookup as message-origin
authentication. Message-bound XPC identity, mutual authentication and the actual
sealed application remain unverified; K0 has not passed. No Keychain operation
or production signer was involved, and no product runtime was adopted.

The authorized runtime must distinguish this application from another script:

- Ship a dedicated executable/app bundle with the JS payload, native dependencies
  and runtime sealed under its release signature; verify sealed resources before
  credential access. The generic installed Bun plus mutable `dist/index.js` is
  insufficient. A launcher that later executes arbitrary Bun is insufficient.
- Use fixed application entry points; reject `eval`, alternate scripts, inspector,
  preload hooks, unsealed plugin/module loading and caller-selected library paths.
  Sanitize environment and code-loading inputs; use hardened execution without
  debug/task-access or unsigned-library escape entitlements where applicable.
  Prove these restrictions for the actual Bun packaging, not just a native stub.
- Treat config/state as data with a validated, installation-bound schema. They
  cannot override broker identity, signer policy or executable/module paths.
  Bind each broker session to one installation and allowed operation set;
  authorize owner/account/revision on every account operation. Setup/removal is
  a separate interactive administrative mode, unavailable to ordinary runtime.

Current user-owned releases and symlinks remain writable by that user. File modes
are not a same-user code-authentication boundary. Replacing code must invalidate
the signature and broker authorization; the installer must verify the complete
signed payload before pointer switches. Prove no race or substitute generic Bun
can obtain a broker session. If this packaging/channel cannot be made credible,
pause formal migration and revise the architecture; do not silently weaken the
gate to same UID or all-application access. A smaller generic-helper design is
eligible only after an explicit product decision accepting its same-user exposure,
with correspondingly limited security claims.

The compatible first implementation may return the exact master key and account
password to the verified runtime over the authenticated channel. This protects
custody/access selection, not a compromised authorized application, admin/root
or plaintext already in application memory. Retain short buffer lifetimes and
best-effort wiping; do not promise reliable erasure of JS strings. Keeping keys
inside a crypto broker would require moving all consumers and is a separate
architecture choice, not an implicit consequence of this plan.

**K0 update — observed stock Bun boundary failure (2026-10-05):** the
[isolated runtime experiment](../playground/keychain/runtime-boundary.md) shows
that Bun 1.4.2 standalone compilation still executes an external script through
`BUN_BE_BUN` and an external preload through `BUN_OPTIONS`, with unchanged
executable bytes/designated requirement and passing signature verification.
This reproduced with hardened runtime, only `allow-jit`, all config autoload
disabled and an entry-point JS environment guard. The guard runs too late;
ordinary launcher environment cleanup does not restrict direct same-user starts.
No Keychain operation or credential extraction was tested. Stock compilation and
signing alone are rejected as the K0 caller boundary. Before broker activation,
select and demonstrate a native pre-JS boundary that removes/rejects these paths
and other external code-loading inputs. A dedicated audited runtime build or a
compatible native embedded host remains an unverified architecture candidate;
new-runtime build/maintenance scope requires an explicit decision. K2/K3 activation
remains gated, while K1 fixture-only work is independent of native feasibility.

The Bun-first embedded-strict follow-up also reproduced external CLI/preload
execution. On the tested `1.4.2+744846f84` revision the exact strict string-code
option is present in `execArgv`, yet indirect eval succeeds. This source/raw-evidence
reviewed result is version-specific; it rejects a flags-only workaround rather
than establishing a new runtime policy. The report records the proposed bounded
dedicated-Bun scope; building/maintaining that runtime has not been authorized or
adopted by this result.

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
adapters and installer/release format compatibility are still pending.

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
| K0 | Resolve API/accessibility, signed caller packaging/channel, signing requirement and renewal; use only isolated synthetic items. | Credible boundary demonstrated on actual intended runtime: unauthorized same-user scripts/modified payloads denied, intended changed releases and rollback unattended; first authorization and OS lifecycle limits recorded. |
| K1 | Depends on K0 policy; introduce custody ports, explicit authority/format/settings, error model, per-account CAS, stable custody paths and compatibility tooling. Fixture state-machine work can proceed while external K0 inputs remain pending. | Crash/concurrency/authority tests pass for both stores; unchanged IDs/auth contexts and container behavior; installer rejects unsupported formats/signatures. No production migration activation. |
| K2 | Depends on K0 and K1; implement exact master-key migration and fresh setup, all-consumer validation, restart and protected recovery. | Populated fixtures preserve every inventory consumer; targeted native synthetic setup/update/recovery works; file retirement occurs only after restore acceptance. |
| K3 | Depends on K2; migrate each account password and add/rotate/revoke flows with tombstones, readiness/session invalidation and reconciliation. | Stable account grants/routing and CAS race tests; no stale credentials/session resurrection or fallback; both connected and revoked accounts covered. |
| K4 | Depends on K2/K3; integrate lifecycle packaging/doctor/LaunchAgent, update/rollback/reinstall, retained uninstall and opt-in full removal. | Whole-outcome acceptance below, independent review and an explicitly authorized operator rollout. Passing fixture checks do not claim live acceptance. |

**Next ready slice: K0 design/prototype gate.** The gap is helper trust without
caller trust, plus unchosen production API/signing. Inputs are the retained report,
current Bun/installer topology, the negative stock-runtime result above and Apple
references above. The assigned security/
release implementer may design signed runtime packaging and a narrowly bounded
synthetic broker prototype after implementation authorization. Editable scope is
new isolated prototype/packaging design and evidence docs; no production credentials,
signer installation, broad trust changes, runtime adoption or migration. Success
requires demonstrating that an arbitrary same-user Bun script and modified sealed
payload cannot retrieve a synthetic value, while the approved runtime can do so
after a changed signed release. Record setup denial, channel/identity checks,
code-loading constraints and cleanup absence. Stop if the actual runtime cannot
meet the boundary or production signing/provisioning inputs are unavailable;
return that precise gate instead of enabling the helper. Effort ends at one
bounded, reviewable design/prototype result; later implementation details stay
provisional until K0 passes. No prototype runs are part of this document change.

## Whole-outcome acceptance and feedback

All rows are **required future checks, not executed in this planning task**.
Record source/release identity, OS/session context, observed result and redacted
failure status; retain useful durable evidence and independent review. Never
record key/password digests from real credentials or mail bodies in reports.

| Requirement / phase | Observable acceptance |
| --- | --- |
| Both stores / K2–K3 | Populated multi-account fixtures and authorized native acceptance show exact original master key and each selected password in Keychain, legacy active sources retired, all IDs and derivation/AAD contexts unchanged. No connected account is omitted. |
| Setup/no recurring prompts / K0,K4 | Fresh setup and migration cancellation/denial are resumable. Observe the actual one-time approval ceremony; after it, repeated fresh reads, changed signed releases, same-path replacement, rollback and LaunchAgent run without UI. Runtime missing/locked/denied never prompts or falls back. |
| Caller isolation / K0 | Different signer/identifier, ad-hoc build, copied generic helper use, arbitrary Bun scripts, alternate entry/preload/module/inspector, modified resource, environment injection and peer-identity spoof/reconnect are denied. Valid signed application works. State explicitly which same-user compromise cases remain outside the boundary. |
| Master consumers / K2 | Verify pending/enrolled marker HMAC, legacy and v2 accounts, Photos awaiting-2FA/authenticated sessions, remote/local auth context, internal verifier record, outbound finalized/unknown receipts, Calendar policy/sync/operation ciphertext and corrupt/wrong-key failure. Existing owner Passkey/OAuth login and refresh do not gain scopes or require reenrollment. |
| Startup/lifecycle / K0,K4 | Test plugin-owner not logged in, macOS lock/unlock, logout/login, sleep/wake, reboot after login and pre-login invocation separately. Establish supported availability; an unsupported context returns bounded unavailable state without restart/UI loops. No implied pre-login service guarantee. |
| Transactions/interruption / K1–K3 | Fault-inject before/after every intent, Keychain write/read, pointer/manifest commit and deletion, including successful mutation with lost reply, duplicate/conflicting items, manifest tamper/loss, SQLite/WAL errors and disk-full. Resume preserves declared authority and secret; no blind overwrite or fresh key. |
| Account concurrency / K3 | Competing migrators, add/rotate/revoke, late probes, Photos session saves and update/uninstall have one consistent winner; new revision/tombstone blocks stale reads/commits. Account A failure never routes to B. Custody-only move preserves sessions; real rotation/revocation invalidates them. |
| Restore/rollback / K2,K4 | Restore populated consistent backup with the exact key and replay-safe operation ledgers; missing key cannot reopen enrollment. Test compatible custody-aware rollback and explicit legacy restoration without reviving post-backup grants/credentials. Reinstall retained state preserves signer/item access and IDs. |
| Uninstall / K4 | Default uninstall retains both stores and bound state. Opt-in full removal removes only previewed owned items/state, verifies absence, and recovers interrupted removal. Retained dependent ciphertext never loses its key; backups and Apple-side revocation limits are disclosed. |
| Build/platform/privacy / K1,K4 | Native artifact signatures/entitlements/provenance verified; no signer private key or credentials packaged. Container/file mode stays explicit and tested. Doctor/setup plan/logs/token/MCP/client artifacts expose redacted status only. Full checkpoint plus meaningful targeted E2E and independent review pass. |

Open decisions/gates: actual production signer and custody owner; renewal/rotation
requirement; data-protection versus file-based implementation and accessibility;
feasibility of signed sealed Bun application and authenticated peer channel;
supported OS/login availability; protected recovery/export/retention policy; and
default versus explicit opt-in complete removal. Missing external decisions block
their dependent activation, not fixture-only storage-contract planning.

Historical reproduction sources stay in `playground/keychain` as evidence, not
production helpers. New K0 prototype artifacts belong to its executor, with exact
synthetic selectors/jobs and task-owned raw logs recorded. Reconcile results into
this plan/knowledge before cleanup; delete only owned transient items/jobs/private
test signing material after verified inactivity and recovery preservation. Never
reuse disposable experiment identities as production signers.
