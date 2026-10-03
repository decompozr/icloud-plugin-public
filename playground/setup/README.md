# Owner setup and credential storage experiment

Goal: evaluate a small Bun/SQLite candidate for exclusive first ownership and
restart-safe encrypted credential storage before selecting a production design.
This is an isolated state-model experiment, not an authentication implementation.

Run from the repository root: `bun test playground/setup`.

Expected acceptance:
- A random bootstrap proof is necessary and accepted for one successful owner
  enrollment only. Only its hash is stored. Wrong proof and fake provider
  validation failure create neither ownership nor stored credentials.
- Two separate processes racing enrollment produce exactly one owner; the
  transaction atomically consumes bootstrap and stores the owner/credential.
- Process restart preserves completed enrollment and never reopens bootstrap,
  including after the stored provider credential is revoked.
- AES-256-GCM protects dummy credential bytes at rest; a wrong key or modified
  ciphertext fails closed. An independently launched process can decrypt with
  the original key. Rotation replaces the usable value; revocation removes it.
- Test output never contains dummy credential values; owned temporary directories
  are removed after each test.

Fake provider validation is a local callback. The owner ID represents an already
verified identity; no Passkey, browser, OAuth, Tailscale, Apple API or real credential
is involved. Keys are random in-memory test bytes supplied externally to the store.
No dependencies are installed and no host configuration is changed.

Limitations: this does not choose production key provisioning, keychain/container
boundary, recovery or backup policy, authenticated administration, provider-side
revocation, secure deletion from SQLite/WAL/backups, crash/power-loss durability,
or public/private routing. SQLite commit persistence is tested across process
restarts, not a Mac reboot or container lifecycle. Error paths must remain closed;
a missing database in production must not silently recreate bootstrap. Resetting
ownership, provider credential revocation, and OAuth token revocation are separate
operations. Lifecycle coverage here is local dev/test, process restart, local
credential update and owned fixture cleanup; build/release/install/uninstall of
the deployed service remains outside this experiment.

Observed result (2026-10-01, Bun 1.4.2): `bun test playground/setup`
passed 4 tests with 26 assertions. Separate Bun processes competed for one SQLite
owner claim; exactly one succeeded. Another process recovered the fake credential
using the original in-memory test key. Invalid proof, failed fake validation,
post-completion bootstrap, wrong encryption key, and tampered ciphertext were
rejected. Rotation and local credential revocation survived reopening the store.
No real-world integration or deployment conclusion follows from these results.

## Missing-state and offline recovery follow-up

Goal before implementation: use a separately retained installation marker to
refuse normal startup when the service database disappears, and rehearse recovery
from an authenticated backup without reopening owner enrollment. Expected:
missing DB is blocked; wrong recovery proof and changed backup are rejected;
one valid offline proof restores the same owner; proof reuse fails even after
another deletion. The marker and backup are dummy files in owned test directories.
This model authenticates recovery with a high-entropy offline bearer proof, not a
boolean “admin authenticated” flag. No network recovery endpoint is created.

The marker must live outside the replaceable application/container volume. Its
loss must fail closed too. A privileged attacker able to alter both marker and
backup remains outside this model. Proof consumption precedes restore, so a crash
can require explicit operator recovery; replay safety takes precedence over
automatic retries. This is not a production backup/restore implementation.

Follow-up result (2026-10-01): `bun test playground/setup` passes 5 tests and
37 assertions. Missing service state and missing external marker fail closed;
a changed backup or wrong offline proof is rejected. Restored ownership remains
locked, and proof reuse is rejected after reopening the external marker.

## Key custody candidates (research, not configured)

Apple's [Keychain Services](https://developer.apple.com/documentation/security/keychain-services/)
stores small secrets in an encrypted keychain. Its
[macOS keychain note](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)
describes platform-specific keychain implementations. Candidate A: retain a
service-specific wrapping key on the Mac via a narrow native helper, supplying
only the necessary runtime key to the container. This is the preferred candidate
for this Mac because durable key custody stays outside the application volume;
helper access controls, login/locked/reboot behavior and in-memory transfer still
need host validation before selection. It does not make the plaintext runtime key
inaccessible to the application itself.

Apple's [container volume documentation](https://github.com/apple/container/blob/main/docs/volumes.md)
documents host mounts, persistent named volumes, and guest-memory tmpfs that is
lost on stop. Candidate B: owner-managed protected key file, separately mounted
read-only from host storage, with an independent encrypted/offline backup. This is
simpler plumbing but puts file access and backup protection on the owner; a mount
is not itself a secrets manager. Never bake keys into images or store the only
key beside the encrypted database. These choices are engineering inferences from
the documented primitives, not proven container/Keychain integrations.

Recovery candidate: host-retained install marker + authenticated, versioned
backup + separately retained offline recovery proof. The rehearsal restores the
same owner and ciphertext; the original encryption key is still required. Lost
keys cannot be recreated by a Passkey. Production recovery should invalidate
restored client grants/session state and explicitly handle backup age and marker
rollback; OAuth state and rollback resistance are not modeled here. User custody
choice remains: Mac Keychain-managed key with separately held recovery material,
or owner-managed key file and backup. No keychain access was attempted.
