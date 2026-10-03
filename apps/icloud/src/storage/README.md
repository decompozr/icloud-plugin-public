# Durable owner and secret storage

Goal: a typed server-only SQLite component supports exclusive owner enrollment,
authenticated-encryption of opaque provider credentials, rotation and local
revocation across process restarts. It never authenticates callers itself:
admin must verify Passkey identity/provider connection before enrollment or edits.

Acceptance before implementation: separate explicit provisioning; ordinary open
never creates state; missing/corrupt database or separately retained marker fails
closed; concurrent enrollment has one winner; completed bootstrap cannot reopen;
wrong keys/tampering fail; no secret output; process restart retains owner/secret.

The caller supplies a 32-byte master key with an independently managed custody
boundary. No default key location or production key-management method is selected.
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
