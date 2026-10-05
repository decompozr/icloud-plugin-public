# Durable owner and secret storage

This shared server-only SQLite component supports exclusive owner enrollment,
authenticated-encryption of opaque provider credentials, rotation and local
revocation across process restarts. It never authenticates callers itself:
admin must verify Passkey identity/provider connection before enrollment or edits.

The contract requires separate explicit provisioning; ordinary open
never creates state; missing/corrupt database or separately retained marker fails
closed; concurrent enrollment has one winner; completed bootstrap cannot reopen;
wrong keys/tampering fail; no secret output; process restart retains owner/secret.

The caller supplies a 32-byte master key with an independently managed custody
boundary. The installation/configuration layer selects custody paths; this component does
not choose or provision a key-management service.
The marker is HMAC authenticated and retained outside the application data volume.
An enrollment writes its terminal marker before committing SQLite: failure between
those steps requires recovery and cannot silently reopen enrollment. Rotation is
transactional within SQLite. Marker/DB rollback together is not prevented.

Recovery is fail-closed only: no reset/backdoor or automatic backup replay is
provided. Operator recovery requires an independently specified authenticated
procedure. Key loss cannot be fixed by reopening bootstrap. Local revocation does
not revoke Apple credentials or OAuth grants, and SQLite backups/pages may retain
old ciphertext. Keep backup keys separate. No raw credentials are logged.

The authenticated marker binds installation ID, phase and enrolled owner ID;
changing the owner in SQLite is rejected before identity or secret access. Both
pending-marker/enrolled-DB and enrolled-marker/pending-DB mismatches fail closed.
The installation bootstrap proof currently remains valid until successful use;
it has no time-based expiry. Treat it as an offline installation credential,
never a public login token. Proof lifetime/rate limiting at the setup transport
boundary must be explicit. Owner integrity assumes the external marker and master
key cannot both be replaced by an attacker; rollback of both files is not detected.


## API, dependencies and feature ownership

`SqliteOwnerStore.provision` exclusively creates installation state; `open` requires
existing state. `OwnerSecretStore` exposes owner lookup, bootstrap proof validation,
owner-only enrollment, account listing/addition, account-specific opaque secret
read/rotate/revoke, legacy-account lookup and close. The implementation depends
on Bun SQLite, authenticated cryptography and protected local files. Callers own
authentication and provider validation; stored bytes have no Mail schema here.

Use this component to preserve the installation owner and encrypted credentials
across restarts. Data flows from authenticated admin enrollment to encrypted SQLite
state plus authenticated external marker, then through an authorized read into the
feature that interprets the plaintext. Returned temporary secret buffers should be
cleared after use. The caller owns shutdown and closes the store.

Mail capability policy and outbound replay state are owned by
[Mail storage](../mail/storage/README.md). Source placement does not imply a second
copy of the user's mailbox or storage within Apple iCloud. Actual mutable files use
the configured installation state/custody paths. `ports.ts` retains a separate
credential-store type sketch; it is not the concrete owner store API.

## Provider session custody

Photos web authentication has a separate provider-session realm; Mail's app-specific
password is never treated as a Photos session. The owner store can seal bounded
session bytes against owner, stable account ID, account revision, realm and session
generation. Public status contains only revision, generation and stored state,
not tokens/cookies. Callers must authenticate the owner, verify the actual provider
identity and sanitize serialized session material before storage; stored state is
not proof of provider reachability or a ready Shared Album capability.

Session replacement/revocation requires exact account revision and session
generation. Tombstones survive reopen, so delayed login results cannot resurrect
revoked sessions. Account credential rotation/removal invalidates session ciphertext
and increments session generations in the same transaction. Account ciphertext
and existing Mail encryption remain unchanged. Session persistence adds a separate
table under established custody; it does not create accounts, approve OAuth scopes,
read browser cookies or install authentication dependencies.

## Keychain custody contract foundation (K1, inactive)

`custody-contract.ts` defines separate master-key/account-password read ports and
an administrative provisioning view. Runtime reads require prohibited interaction;
there is no selected Keychain backend, fallback or credential parsing.
Exact schema-1 selectors bind installation UUID and, for account passwords,
owner/account/revision/item generation. This does not authenticate the caller or
establish a native signing/API boundary; K0 remains unpassed.

`MasterAuthorityJournal` stores nonsecret pre-owner-store metadata in an existing
owner-private custody directory. `discover` is untrusted routing metadata; the
caller must verify its HMAC using the original 32-byte key before opening bound
owner/auth state. The new manifest HMAC context does not alter existing marker,
credential/session/auth/ledger cryptography or generate a replacement key.
An independently selected backend/generation floor can reject an older snapshot
before fetching custody. An authentic whole snapshot verifies without such a
floor; the journal is not a tamper-proof monotonic counter and does not protect
rollback of all bound state/policy. Format/settings gating is still future work.

Explicit baseline provisioning requires prior validation of the existing file,
marker and bound state by its future caller. Ordinary discovery never creates
missing files. Phase changes require original-key authentication, exact generation
CAS, one operation ID and an exclusive installation lease. Authority changes
only at the verified-to-authoritative transition; ordinary reverse transitions
and skipped cutover are rejected. The state machine records a caller's validation
decision; it does not perform the K2 all-consumer/Keychain validation itself.

Writes fsync a unique private staging file, rename it atomically, then fsync the
directory. Any uncertain write reports `outcome_unknown`; read actual state before
deciding the next step. An uncommitted `.pending` file blocks another write/lease,
even when the old manifest remains readable. Committed writes with a lost reply
are reconciled by verified read and generation CAS. No unknown staging file is
deleted automatically. Existing/incomplete locks cannot be stolen by age or a
reopened process. The fixture worker actually exits at each write checkpoint;
reopen preserves the atomic old/new record and retains the lock.
Pathname checks and lease inode checks support cooperative writer coordination;
they do not establish race-free filesystem access against malicious same-user
replacement or satisfy K0 caller isolation. An independent review verified the
inactive scope and reran the 15 new master-authority tests successfully. The
owner's targeted suite also passed all 31 master/owner/provider-session tests.

`AccountAuthorityJournal` adds an inactive SQLite account authority journal.
Explicit stopped provisioning baselines all existing accounts atomically; ordinary
open never creates or repairs missing pointers. Original-key HMACs bind state and
cleanup intents to installation/owner/account/revision/generation. An epoch CAS
coordinates copy intent, external verification and cutover without changing the
semantic credential revision. Pointer activation and legacy ciphertext removal
commit together, preserving account metadata and Photos sessions. Real local
revocation instead atomically advances revision, invalidates provider sessions and
queues exact native item cleanup. Generation reservations are never reused.

Reads use a SQLite snapshot; mutations use immediate transactions with FULL/EXTRA
synchronous durability and persistent journaling (DELETE/TRUNCATE/PERSIST/WAL)
required; MEMORY/OFF fail closed without changing connection settings.
Authenticated caller/installation leases, native
item validation, asynchronous-read epoch revalidation and actual item deletion
remain caller obligations. Cleanup metadata never authorizes removing a current
pointer; acknowledgement follows fresh external absence verification. Missing
authority cannot be rebaselined, and unavailable native custody retains its pointer
and revision in recovery-required state without fallback. HMACs do not detect a
consistent rollback of all original-key-authenticated state. No add-account/native
rotation adapter or operational recovery path is provided by this foundation.

The 15 new account tests include competing connections, stale replies/rotation,
revocation, tampered/mixed snapshots, ignored/aborted statements, and actual process
exit before/after cutover commit. The combined master/account/owner/session suite
passed 46 tests; typecheck passed. These are synthetic storage checks, not native
Keychain or deployment acceptance.
Independent review identified the persistent-journaling precondition; after its
correction, the reviewer reran all 46 tests and typecheck with no confirmed blocker.

`inspectRecovery` now provides read-only master interruption evidence. It verifies
the committed manifest with the original key and independent authority/generation
expectations, validates a single staging record as the exact next signed transition,
and binds any retained lock to the selected operation. Unknown/duplicate/corrupt
staging, incomplete locks and a missing manifest fail closed without deletion or
reconstruction. An uncommitted Keychain cutover remains file-authoritative. Even a
valid inspection of a live lock returns `external_stop_then_reconcile`, never a
lease or proof of process death. It does not implement lock release/adoption or
authorize promoting staging: the future exclusive stopped-maintenance coordinator
must reinspect and freshly validate the original key, bound state and native items.

Account `cancelCopy` atomically returns only a pending copy to SQLite authority,
queues its exact staging identity, retains the generation high-water mark and
preserves semantic revision/session state. `restoreAvailable` clears an unavailable
native state only with the exact retained selector and epoch CAS; its caller must
freshly revalidate native custody. It cannot replace the item, accept a different
generation or restore a revoked account. These metadata methods do not validate
Apple credentials, release native buffers or execute cleanup. Seven additional
tests and expanded process-death checks cover this reconciliation slice; the
combined suite passes 53 synthetic storage tests and typecheck.
Independent delta review reran the 53 tests and typecheck, found no confirmed
blocker, and confirmed that inspection neither proves stopped service nor creates
operational recovery authority.

Startup now imports master-journal discovery/verification for explicit file-mode
format/binding checks only. Account/native mutation methods remain unwired.
The [server gate](../server/README.md) rejects native selection and unsupported
account custody before current consumers can mistake native pointers for revoke.

These are K1 slices, not the K1 exit gate. Pending pieces include stopped
operational stopped lock/staging resolution, add/rotation adapters, settings/format and installer
compatibility gates, stable custody
paths and actual backend wiring. No journal is automatically provisioned;
successful runtime remains file-based. No native item, provider action, live credential or
existing installation state is accessed by the tests. Colocated master-authority
tests plus existing owner-store/provider-session tests exercise synthetic state
only; process death is not power-loss/disk-full or real Keychain acceptance.

## Verification and limits

Colocated owner-store tests and the worker fixture cover provisioning/open behavior,
exclusive enrollment, tamper/key failures, owner integrity, rotation/revocation and
restart persistence. They do not prove rollback resistance or a production backup
recovery procedure. [Operations](../../../../docs/operations.md) owns deployment and
custody guidance. The account migration adds `mail_accounts` and a `legacy_account` pointer while
retaining installation, owner, state paths and custody. An active original secret
is re-encrypted with account identity/version binding and receives a stable ID.
A previously revoked original secret has no recoverable email; its legacy entry
remains an unusable `legacy-account` tombstone. Add a mailbox and create a new client
connection instead of rebinding that unknown original identity. Older application
binaries cannot be assumed to read the migrated account schema; a rollback requires
compatible state restoration rather than a release-symlink change alone.
