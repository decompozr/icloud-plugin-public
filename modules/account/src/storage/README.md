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
[Mail storage](../../../../apps/studio/server/mail/storage/README.md). Source placement does not imply a second
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
