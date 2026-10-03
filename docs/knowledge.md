# Engineering knowledge from the experiments

This document records what the evidence supports and why it matters. Requirements
live in the linked specifications; experiment code and the [register](experiments.md)
retain reproducible evidence. Observed behavior is not a production implementation.

| Knowledge | Evidence and boundary | Consequence for the specification |
| --- | --- | --- |
| Mail UID alone is not a durable identity. Missing fetches return no message, and new selections expose changed UIDVALIDITY; the tested client does not enforce prior validity on mutations. | L2, actual ImapFlow transcript plus a separate guard sketch; [mail experiments](../playground/extended.test.ts). | M01–M03 require scoped identities, preflight validation and selected-mailbox isolation. |
| Library move success/failure cannot be trusted without understanding each stage. The tested fallback continued deleting after COPY rejection, and expunged after STORE rejection. | L3 actual server NO responses and emitted commands; ImapFlow 1.7.8 only, not a claim about every version. Native MOVE lost acknowledgement was not retried. | M04–M06 require no unsafe fallback, stop after failed prerequisite and explicit partial/unknown outcomes. |
| Global EXPUNGE can affect unrelated deleted messages. The Python reference's writable CLOSE cleanup adds another implicit-expunge path. | L3 and pinned [source research](research.md#how-the-reference-implementations-work). No live mailbox was used. | Cleanup and moves must not broaden effects beyond selected messages. |
| Read-only selection and PEEK are available under Bun. Full MIME parsing allocates attachment content; a cut source can still parse successfully. | L2/L5 actual protocol and mailparser fixtures; no general memory/streaming proof. | M07–M08 require non-mutating reads and explicit bounds/completeness. Semantic summaries stay with the agent. |
| Folder roles and keyword permission are discoverable metadata, not proof of provider behavior. | L4 scripted special-use/PERMANENTFLAGS and separate destination sketches. | M09–M10 require capability-based behavior and explicit unknown/unsupported results. iCloud tags and spam training remain open. |
| Unsubscribe headers expose candidates, not authorization or confirmed removal. | L6 real MIME parsing plus a narrow fake-resolver policy sketch; no URL visited. | M11 separates discovery/execution/outcome and requires destination validation. |
| Bun supports the tested MCP, WebAuthn and token-verifier paths. Synthetic Passkey verification checks origin/RP/challenge; a fake OAuth HTTP roundtrip works locally. | L1/L7/L8; [auth boundaries](../playground/auth/README.md). No real browser, owner login or Codex/ChatGPT linking. | A01–A04 specify binding and access checks; actual client/domain acceptance remains required. |
| Atomic one-owner enrollment and encrypted dummy storage survived process restart in a SQLite candidate. | L9 [setup experiment](../playground/setup/README.md); no production key provisioning, provider validation, crash durability or recovery proof. | A05–A07 require the outcomes without selecting SQLite, an algorithm or key location. |
| Process restart/shutdown can preserve state and release listeners; container evidence is mixed. | L10 [runtime evidence](../playground/runtime/README.md): direct-IP HTTP and bind persistence worked; published localhost forwarding reset; cached Alpine lacked Bun. | D01–D07 specify deployment acceptance. Container placement and forwarding are not decided or validated. |

The independent local aggregate passed 51 tests/161 assertions. Some assertions
intentionally reproduce hazardous behavior; this count does not mean all safety
expectations passed. No live provider or deployed product acceptance follows.

Open decisions: safe move behavior when extensions are absent; production validation of the now-defined read and
batch defaults; iCloud keyword/junk support; unsubscribe execution policy; WebAuthn
RP/origin layout; complete OAuth/provider arrangement; credential key/recovery
strategy; and container/Tailscale topology. Candidates and sketches are not
selected architecture. Calendar and other providers remain outside current scope.

[Architecture comparison](architecture.md) now records concrete internal defaults
and sourced protocol/auth-routing recommendations. These refine what remains
unknown without turning live provider or deployment assumptions into facts.

Later [runtime follow-up](deployment-lifecycle.md#follow-up-a-working-candidate-route-and-linux-bun)
established basic Linux Bun container execution and a host-loopback proxy
alternative. Earlier Alpine/no-Bun limits are historical; actual application,
auth and Tailscale deployment remain unverified.

## Current iCloud move capability (2026-10-02)

An authenticated, TLS-verified CAPABILITY-only diagnostic against the enrolled
account observed UIDPLUS and no MOVE. It logged only capability names, then
logged out; no mailbox or content was requested. Thus native-MOVE-only gating
explains unsupported_capability for this account's organize operations.

Installed ImapFlow combines COPY/delete in its MOVE fallback and can return the
copy result without checking deletion success. Its deletion command also ignores
the STORE boolean before expunge. Simply enabling that fallback would violate
our failure contract. UIDPLUS supplies the necessary *targeted* expunge protocol,
but our adapter must check each stage separately. This is an observed current
account capability, not a permanent claim about every iCloud account.

The new adapter protocol fixtures confirm explicit COPY/STORE/UID EXPUNGE stages
can preserve unrelated Deleted messages while refusing to continue after an
unconfirmed stage. `apps/icloud/src/icloud/adapter.move.test.ts` exercises fourteen
success/failure cases against the actual library. The built HTTP MCP tests in
`apps/e2e/src/imap.e2e.test.ts` separately confirm service batch outcomes and
remaining-target cancellation. These do not prove a real iCloud move succeeded:
only the capability observation used the live provider.

## Outbound uncertainty and operation receipts

SMTP recipient acceptance and final DATA acceptance are different stages. The
outbound wire fixtures show that explicit refusal of every RCPT (4xx or5xx)
can return rejected with no DATA, while a connection lost after DATA is unknown.
A partial accepted/rejected recipient set with final acknowledgement is partial
submission, never confirmed delivery. IMAP APPEND without a verified APPENDUID
is likewise unknown even if the server may already have saved the draft.

The owner-bound SQLite ledger claims a unique operation ID before effects,
retains unfinished tombstones across restart and encrypts completed receipts.
Concurrent duplicate requests do not produce another submission. A failure to
persist the final receipt after provider success remains unknown; automatic
retry would risk duplicates. Tests cover actual SQLite reopen and a failing
receipt-write trigger. No exactly-once provider guarantee is claimed.

Reply lookup now uses a bounded BODY.PEEK[HEADER] request through the actual
adapter, checks original UIDVALIDITY and complete headers, and validates explicit
recipients against Reply-To/From. The built HTTP fixture traverses the SDK,
service, actual IMAP header lookup and SMTP/APPEND protocol adapters. These are
local synthetic peers, not a real outgoing message or draft in the owner's account.
