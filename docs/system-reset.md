# Confirmed system reset

The System & diagnostics page offers two distinct, owner-confirmed resets:

- Connections: remove stored accounts, provider web sessions, application login
  sessions, OAuth registrations/grants and module settings; preserve owner
  identity, Passkeys, master key, installation and Tailscale configuration.
- Factory: additionally remove owner identity and Passkeys, rotate the master key
  and bootstrap proof, and return to initial owner setup. Installation and
  Tailscale configuration remain unchanged.

Each requires its own explicit confirmation phrase. Neither is executed by the
agent against the live installation. These are local application resets, not
revocation of Apple's passwords or operating-system Photos permissions.

Implementation acceptance: exact private owner/Origin/JSON guards; graceful drain
of accepted operations; encrypted-state recovery backup before mutation; fail-closed
handling of incomplete reset; restart and completion status; disposable native
fixture evidence for Passkey preservation and factory key rotation. Existing
Photos source libraries and unrelated configuration/files must survive.

Current status: implemented and verified with disposable data; no production
reset has occurred. Both confirmations use fixed phrases (RESET CONNECTIONS and
RESET ALL). Lost responses remain unconfirmed rather than prompting blind retry.

The private completion receipt uses an unguessable 256-bit token obtained from the
owner-confirmed request and exposes only mode/phase. It survives session deletion
and restart. Unknown supervisor identity rejects before queuing. Known launchd
jobs restart their managed process; direct processes start one detached successor.

Protected backup files and directory entries are fsynced before mutation. New
state/custody files are fsynced before the completed receipt. Incomplete receipts
stop normal startup rather than silently continuing with mixed state. For recovery,
stop the instance through its existing supervisor, verify the receipt's local backup,
restore its state directory and custody entries (0 = master key, 1 = installation
marker, 2 = bootstrap proof, 3 = local-owner proof if present), verify custody modes
and database integrity, then clear the incomplete receipt and restart. Preserve
current data separately before recovery. The recovery backup retains old keys and
should be managed as private credential material.

Connections reset also clears the internal resource-verifier cache alongside its
registration, so restart creates a valid verifier. It revokes pending local-owner
proofs without removing existing Passkeys. Factory reset replaces owner storage,
rotates the master key/bootstrap proof and revokes old local-owner proofs.

Verification: 456 application/Studio/tooling tests (4,155 assertions), 11 built HTTP
E2E tests (245 assertions) and 45 isolated browser checks pass. Reset-specific
coverage uses the real owner-auth schema, failure injection, supervision simulation
and disposable processes for both reset modes. Accepted fixture work finishes
before reset; both successor processes serve completed receipts and expected owner
state. This is not live Apple, physical Passkey or production-reset evidence.

