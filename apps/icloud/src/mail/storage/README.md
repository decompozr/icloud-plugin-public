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

## Master-key custody validation

`SqliteOutboundLedger.validateExistingReceipts` validates an existing supplied
SQLite snapshot without constructor/schema creation, receipt finalization, new
claims, repair or DB close. The authenticated baseline supplies all retained
owner namespaces: legacy owner strings and current JSON owner/account strings,
including revoked accounts. Every finalized receipt authenticates with unchanged
`outbound-ledger-v1` derivation and owner/operation AAD, and its operation/message
identity must match its row. Pending null receipts remain uncertain tombstones;
they are counted and never treated as evidence that a key decrypts successfully.

The validator shares normal receipt decryption, returns only counts and clears
private decryption/key buffers. Parsed JS objects/strings cannot be reliably
erased. Full encrypted snapshots prevent failed cached iterator retries from
skipping earlier rows; repeated failures, wrong keys, swapped AAD and readonly
populated fixtures are tested. Baseline completeness, deleted-row detection,
stopped maintenance and complete installation validation are caller requirements.
This does not enable native Keychain or establish K0/K2 acceptance.
