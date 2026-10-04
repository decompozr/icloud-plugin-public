# Engineering knowledge from the experiments

## Main integration and readiness evidence (2026-10-04 UTC)

Before publishing old worktree changes, inspect current remote main. Calendar and
private administration had already advanced to 0.1.27; only the account capability
delta should be replayed. Preserve current credential race and recovery protections.
Readiness evidence needs a monotonic invalidation epoch: hashing boolean service
state alone permits old evidence to reappear after off/on. Record multi-account
reads against the validated routed account, not the unresolved bearer grant.

## Account capabilities and authorization (2026-10-04 UTC)

A generic IMAP failure cannot distinguish absent Mail, bad authentication and
transport failure. Probe each registered service independently; accept credentials
only after a real provider success, and preserve unknown evidence honestly.
Fixture success proves the application contract, not live Apple interoperability.
Bind evidence to credential revision and preserve disabled preferences across
recheck/rotation so delayed responses cannot revive revoked access.

Capability union must use an immutable explicitly consented account set, never all
accounts belonging to the owner. Adding accounts does not broaden old grants.
Resolve defaults only within authorized eligible accounts; reject an explicit
unavailable ID without fallback. Keep account identity on message/event references
and enforce it before provider work. Availability, enablement, operator policy and
OAuth scopes are independent gates.

When composition adds a provider, every application-level fixture must stub it too.
The OAuth E2E fixture originally stubbed only Mail and attempted CalDAV with dummy
credentials. It now supplies Calendar and forbids non-loopback fetch. Preserve this
guard as more services are registered. See [implementation evidence](account-capabilities.md).

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
