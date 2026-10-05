# Engineering knowledge from the experiments

## macOS Keychain custody and update identity (2026-10-05)

The Keychain experiment is closed as a feasibility investigation. Its
[report and reproduction recipes](../playground/keychain/README.md) and
[bounded acceptance evidence](../playground/keychain/evidence.json) retain the
useful results. Verification was performed by the same agent, not independent
review. No production credential migration, setup/uninstall implementation or
deployment resulted.

The user accepts setup-time macOS authorization but requires unattended ordinary
reads without recurring prompts. Automatic setup and uninstall are intended
product behavior; preserve-state uninstall versus complete data removal remains
an unresolved choice. These requirements do not establish untested OS behavior.

| Verified knowledge | Evidence boundary | Design consequence |
| --- | --- | --- |
| Native code can create, repeatedly read and delete a Keychain item automatically. | Synthetic 32-byte values in an already-unlocked file-based Keychain; reads explicitly prohibit UI. | Provision once during setup. Runtime must report unavailable/denied state instead of repeatedly requesting interactive authorization. |
| Bun and a user LaunchAgent can invoke the authorized reader unattended. | Existing logged-in GUI session; no reboot, logout or lock transition. | Background-service integration is feasible in that session; startup-before-login and locked-session behavior need separate acceptance. |
| A stable path and identifier do not preserve an ad-hoc executable's access after rebuilding. | Changed v2 is rejected with `-25293`; unchanged copies and restored v1 succeed. | Do not use path stability as an upgrade trust guarantee. |
| Changed v1/v2/v3 binaries can share access when the certificate-authenticated designated requirement is stable. | One pinned temporary self-signed certificate plus one identifier; distinct hashes, repeated reads, same-path replacements and rollback all pass without UI. | Sign updates under a deliberately stable identity/requirement; production signing and rotation policy still need validation. |
| Access remains restricted under the tested stable requirement. | Different signer, different identifier and ad-hoc controls are rejected; the authorized v3 still succeeds. | Do not broaden ACLs to all applications or use identifier-only rules merely to eliminate prompts. |
| Trusting a helper does not authenticate its caller. | Copied-helper and Bun-child reads succeed. No caller-authenticated broker was implemented. | A general-purpose helper returning plaintext cannot claim isolation from other same-user processes. Define the production caller boundary before adoption. |

The current master key protects more than Apple account credentials. Moving
Apple passwords alone does not permit deleting it. A master-key custody migration
must preserve the exact key and installation identity, verify dependent state
before cutover and prevent silent fallback after Keychain becomes authoritative.
Keep signing private keys on the release/build side, not in the distributed
runtime. The disposable self-signed identity demonstrates continuity, not public
distribution eligibility or a production signer.

The passing result pins one exact certificate; renewal/replacement under another
fingerprint, Developer ID releases, actual “Always Allow” approval, locked
Keychain access, reboot/login, recovery and real application upgrades are not
verified. The probe uses deprecated file-based APIs for interaction control;
select the production Keychain API and signing/caller model separately. Removing
a Keychain master key while retaining dependent ciphertext can prevent reinstall
or recovery. Uninstall must distinguish retained-state and complete-removal modes.

All synthetic items, transient jobs, isolated signing keychains and private
signing files were removed and their absence verified. The preserved evidence
contains no exported key or production credential. Raw temporary files have no
remaining knowledge/recovery dependency; their disposal follows the task's
publication and cleanup gates. Reproduction source remains historical evidence,
not an active experiment or production acceptance check.

## Calendar integration decision (2026-10-03 UTC)

Final disposition: the registered source module passed independent review,
source/build/artifact checks and a bounded registered real-iCloud smoke. The user
accepted remaining recipient-side sharing verification limits. Reviewed cleanup
verified recipient revocation, test calendar absence and a fresh inventory of
four originals with zero markers. No installed service or policy was changed;
unverified recipient enforcement is not promoted to a passing test.

The owner now requires production Calendar as a registered module. Keep shared
runtime/authentication/custody while separating Calendar enablement and client
scopes from Mail. Existing Mail grants must not gain Calendar access. Scheduling
permission applies to updates/deletes of existing attendee-bearing events too.
The missing sharing roster property remains unknown, not evidence of an empty
roster. [Production coverage](calendar-production.md) retains these gates; source
integration does not establish deployment or live sharing support.

The later live empty-collection probe showed that iCloud accepted a stale-ETag
rename and stale-ETag DELETE, despite sending `If-Match`. Production collection
operations must describe their non-atomic semantics; an empty listing or
collection ETag is not protection against concurrent additions/changes. Event
resource stale writes separately returned 412 in earlier tests. The probe was
removed and only the four original calendars plus the pending shared test
calendar remained. See [current evidence](calendar-production.md).

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
selected architecture. Calendar remains outside production scope; its later
bounded experiments are recorded below. Other providers remain outside scope.

[Current architecture](architecture.md) records implemented feature ownership,
registration and shared-host boundaries. Historical provider comparisons and
protocol experiments remain in [research](research.md) and
[experiments](experiments.md); they do not establish current deployment behavior.

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
unconfirmed stage. `apps/icloud/src/mail/icloud/adapter.move.test.ts` exercises fourteen
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

## Production installer boundary

Production installation is explicitly `~/.decompozr/plugins/icloud`, selected by
the release-provided `icloud-plugin install` command. Root `releases/` stores
versioned distributions. Installed immutable versions live under `releases/` with
an atomic `current` selector; private configuration, custody and state belong in
`runtime/`. Installation never initializes state or starts the service. Run the
installed `current/icloud-plugin run` only after configuration/state preparation.
The `0.1.19-installer1` packaging revision preserves the previously verified
application byte-for-byte and adds the installer, avoiding accidental deployment
of an unrelated source refactor. See deployment lifecycle for verification and
archive provenance. Neither build nor release should create `.flow-runtime` or
external installation directories implicitly.

## Calendar query completeness and mutation ordering

The [sequential Calendar experiment](calendar-feasibility.md#sequential-application-experiment-2026-10-03-utc)
uses actual ICS parsing and a synthetic application server to connect reading,
search/free-time/summary and personal-event CRUD. Its JSON discovery/query route
is not CalDAV discovery or provider-side search, and no live account was accessed.

An occurrence moved into a search window may have its original RECURRENCE-ID
outside that window. The fixture evaluates detached overrides by actual time
while retaining original identity. DATE end boundaries remain exclusive, with an
explicit UTC interpretation for this experiment. UTC/simple recurrence query
support does not inherit general timezone support from the separate synthetic
VTIMEZONE parser tests.

Free-time computation requires more than successful parsing. Expansion/resource/
result limits and unsupported semantics must expose incomplete coverage. A complete
text search can still omit busy events, and a complete narrow query cannot support
a wider availability window. The fixture records query coverage/filtering and
refuses these inputs; complete here means complete for the supplied synthetic
snapshot, not a remote calendar account.

Conditional mutation checks must occur against current state after asynchronous
request-body consumption. Review exposed a stale-check race; the fixture now
consumes the body before its uninterrupted precondition-check/mutation section,
and delayed-body create/update regressions preserve the competing successful
write. This in-memory ordering does not establish transactional behavior for a
production adapter. Lost responses still require reconciliation before retrying.

The personal-write fixture combines strong ETags with whole-resource scheduling/
recurrence rejection and identity-preserving edits. Conflict and no-retry tests
support that local policy, not provider notification behavior. See C1–C3 in the
[experiment register](experiments.md#calendar-sequential-exploration-2026-10-03-utc)
for observed results and the remaining live acceptance gates.

## Calendar protocol and full-operation boundaries

The [expanded acceptance matrix](calendar-acceptance-matrix.md) separates parsed
data, fixture protocol behavior and provider acceptance. Actual CalDAV XML over
loopback is stronger transport evidence than the earlier JSON fixture, but the
handwritten server remains unable to establish independent interoperability or
iCloud filtering/completeness.

Sync tokens commit with a completely validated replacement snapshot. A partial
multistatus or unsupported pagination must retain the old snapshot/token; an
invalid token starts a fresh sync. Following an uncertain write, exact readback
can establish desired state without establishing causation. Normalizing servers
may prevent byte equality even after a successful write, so unknown must remain
unknown and cannot authorize a blind mutation retry. The playground currently
lacks durable operation journaling and normalized comparison.

Calendar-level deletion has a wider concurrency boundary than event ETags. A
verified empty collection can receive another event before DELETE. In-memory
ownership and a preceding listing do not solve that race; the current collection
helper is fixture evidence, not a safe live shared-calendar deletion mechanism.

Scheduling serialization does not send an invitation or prove recipient state.
Likewise, Apple CalendarServer's historical sharing extension can guide local
request generation without proving current iCloud support. Real scheduling and
sharing need observed capabilities, identities, concurrency semantics and actual
delivery evidence. Preserve the distinction from personal-event editing, which
continues to reject scheduling-bearing resources.

The later dedicated live runner adds a private durable manifest and verifies
semantic event content on provider readback; this does not retroactively add
journaling to the generic client. Its first real calendar creation exposed a
bootstrap-origin versus shard-origin principal identity mismatch. Matching paths
alone were insufficient: authenticated shard current-principal and exact
calendar-home witnesses established the alias before reviewed exact-ledger empty
cleanup. A corrected fresh lifecycle then passed, and separate read-only checks confirmed
both test calendars absent and the original calendar count unchanged. Observed
ACL/invite properties were unavailable, so they did not establish privacy.
The live success covers one isolated UTC personal-series lifecycle, not
scheduling/sharing delivery, arbitrary calendars or complete Calendar support.

The extended provider run exposed three interoperability assumptions: sync can
include collection metadata, changed resources can be ETag-only and require
validated hydration, and calendar-multiget needed path-form hrefs where absolute
forms returned resource404. Treat exact collection rows separately and preserve
resource/ETag identity through hydration; do not weaken unrelated row validation.
The provider also returned the same resource for positive and guaranteed-negative
SUMMARY filters. Successful REPORT is not proof of text-filter execution: local
filtering needs a complete bounded snapshot and must report that server filtering
was ignored. Finally, semantically equivalent timezone normalization should not
be mistaken for byte preservation or a failed event update. These distinctions
were verified on six isolated live cases, not arbitrary provider behavior.

The actual organizer invitation showed another valid provider normalization: an
ORGANIZER principal alias appeared in the authenticated sender address set. A
post-write guard stop retained the acknowledged resource; reviewed read-only
identity reconciliation avoided a duplicate invitation. Mailbox delivery, user
RSVP screenshots and organizer PARTSTAT ACCEPTED are separate evidence channels
that together support end-to-end acceptance. Scheduling status1.1 alone did not
establish delivery or acceptance. A fresh sharing target's CS:invite404 prevented
POST; advertised sharing capability therefore still does not prove a completed
share or effective recipient access.
