# Mail persistence

Mail owns the meaning of its durable state. `operator-policy.ts` persists read,
write, send and unsubscribe capability settings and requires confirmation for
capability elevation. `outbound-ledger.ts` persists operation identity, payload
fingerprints and encrypted outcomes used to reject conflicting replays and avoid
duplicate outbound effects after retry or restart.

The module receives a database and custody material from the application. These
classes own their existing table initialization and queries; they do not own the
shared database connection's lifetime. Mail disposal clears the ledger's derived key
and later ledger calls fail closed. Tables remain in the existing SQLite file,
with unchanged names and cryptographic context. This source-layout refactor must
not recreate tables, reset operator choices or discard uncertain outbound records.

The [shared owner store](../../storage/README.md) owns exclusive enrollment and
opaque encrypted credentials. Mail state is separate in responsibility even where
it shares the auth SQLite connection. File access is server-only; credentials,
ledger plaintext and key material must never enter client packages or logs.

Colocated policy and ledger tests cover persistence, authorization-related settings,
replay/fingerprint conflicts and encryption. Database backups may retain ciphertext;
key custody and restore consistency remain operational responsibilities. This is
not a generic schema/migration manager for arbitrary features.
