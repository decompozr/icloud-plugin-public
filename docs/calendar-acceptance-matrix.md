# Full Calendar exploration acceptance plan

The subsequent accepted goal is a production-ready registered Calendar module.
[Production coverage](calendar-production.md) tracks each operation and lifecycle
gate. The receipts below describe experiments, not completed production scope.

The subsequent source-module goal is now user-accepted and final experiment
cleanup is verified: four original calendars, zero test markers, sharing
recipient revoked and test calendar absent. Recipient-side permission limits
were explicitly accepted, not reported as passing tests. See the production
coverage for final source/build/live evidence and the no-deployment boundary.

The user accepted exploration of every operation listed below on 2026-10-03. This
plan expands the earlier bounded experiment; it does not report these operations
as implemented or verified. The starting evidence is recorded in
[Calendar feasibility](calendar-feasibility.md). Existing 19-test evidence covers
synthetic application behavior, not iCloud interoperability.

## Execution order and observable acceptance

| Stage | Included requirement | Observable acceptance | Live prerequisite |
| --- | --- | --- | --- |
| 1 | Discovery and authentication | Resolve principal, calendar home, calendars and actual privileges from CalDAV XML. Correctly map nested namespaces and individual propstat failures. Reject untrusted targets and prevent credential forwarding on redirects. | Selected account and Calendar credential-use route. |
| 1 | Read, search and summarize | Read ICS and ETag; use actual calendar-query/multiget XML; compare finite-window and text results against known events. Explicitly report incomplete results. Availability requires an unfiltered complete snapshot covering its window. | Readable selected calendars. |
| 2 | Full personal event fields | Create and edit title, description, location, URL, categories, status, transparency, start/end and alarms; round-trip UID, unknown properties and timezone components. Read back every proposed change. | Writable dedicated test calendar. |
| 2 | Event create, update and remove | Conditional create rejects collisions; conditional update/delete reject stale ETags without changing current content. Successful deletion is confirmed by subsequent absence. | Same isolated target; ownership recorded. |
| 2 | Recurring series | Create DAILY/WEEKLY/MONTHLY examples, change whole series and remove whole series. Preserve exceptions and recurrence rules unless explicitly edited. | Dedicated recurring test resources. |
| 2 | Individual recurring instance | Move one instance retaining its original RECURRENCE-ID; cancel/remove only one occurrence; demonstrate unchanged siblings and moved-in/moved-out search windows. Explicitly track THISANDFUTURE support separately. | Same isolated target. |
| 2 | Timezones and all-day events | Preserve UTC, DATE, TZID and deliberate floating time distinctions. Test DST transitions, explicit gap/fold handling, unresolved TZID rejection, exclusive all-day end and timezone round-trip. | Known timezone cases confirmed against provider reads. |
| 3 | Calendar create, rename and remove | Create a uniquely owned calendar, rediscover it, rename with PROPPATCH, verify returned property status and name, remove only that dedicated calendar after resource cleanup. | Account calendar-creation privilege and recorded exact href. |
| 3 | Invitations and replies | Validate organizer/attendee identity, REQUEST/REPLY/CANCEL, accepted/tentative/declined responses and sequence/timestamp handling. Confirm actual delivery and recipient-side state separately from local serialization. | Explicit test counterpart identity and scheduling support. |
| 3 | Shared calendars and permissions | Discover provider sharing/ACL capabilities, inspect granted privileges, demonstrate read-only mutation denial and requested sharing changes on an isolated calendar. Unsupported generic ACL is not evidence that every provider sharing path is unavailable. | Explicit test counterpart and provider-supported sharing route. |
| 4 | Incremental synchronization | Initial snapshot plus token; apply changed and deleted resources; advance token atomically only after complete success; invalid token triggers complete resync; partial/failing responses preserve prior usable state. | Provider sync capability and isolated remote changes. |
| 4 | Failure recovery | Inject timeout after mutation, reconcile via exact resource identity/read-back, report confirmed/conflict/unknown outcomes and avoid blind retries. Preserve operation identity across reconciliation. | Safe live failure injection only if available; otherwise retain fixture-only status. |

All rows are included in this exploration. A blocked live prerequisite does not
defer the corresponding local protocol or semantic experiment. It does prevent
claiming live completion. Invitations and sharing need actual test identities;
ordinary personal events must not accidentally acquire scheduling side effects.

## Evidence and completion rules

Record each result as `fixture_verified`, `live_verified`,
`provider_unsupported_with_evidence`, or `unverified`, with the exact check and its
limitation. Keep source-level tests, handwritten server contracts, independent
server interoperability and actual iCloud results separate. Unsupported
recurrence forms, missing timezone data, unavailable permissions and incomplete
syncs must remain explicit, not silently omitted from an apparently complete
result.

Implementation is additive to the existing playground and preserves prior work.
Suggested independent modules are a bounded XML CalDAV transport, pure event and
recurrence transformations, and calendar/scheduling/sharing operations. Shared
resource identity is calendar href, resource href, UID and strong ETag; individual
instances also preserve the original RECURRENCE-ID type and timezone.

Development and local verification apply to this experiment. Production Build,
Release, Install, Update and Uninstall changes are not required by the exploration
scope. No production Calendar tool, consent flow or installed capability should
be inferred from playground results. Any later production integration needs its
own observable acceptance across those lifecycle stages.

## Current expanded experiment status

This table records narrower evidence within each requirement. It must not be read
as declaring the entire requirement complete. The latest independent aggregate
is **71 tests / 502 assertions across 11 files**; live receipts below cover the
listed same-account cases. An earlier 43-test / 309-assertion snapshot passed
under Bun 1.4.2 and both demos exited successfully. The composed demo made 27 loopback requests, sent zero
external messages and reported `liveICloudVerified: false`.

| Requirement | Observed status | Remaining live or semantic gate |
| --- | --- | --- |
| Discovery, read and search transport | `fixture_verified`: XML query/multiget, namespace/propstat mapping and bounded transport. Later `live_verified`: authentication/discovery, empty-window query and actual created-event GET/semantic readback. | Live finite queries/path-form multiget and local bounded-snapshot text filtering pass. Provider SUMMARY filtering was observed ignored, not verified. Redirects require explicit rediscovery, not automatic credential forwarding. |
| Personal event fields and CRUD | `fixture_verified`: listed fields, DISPLAY alarms and conditional writes. Later `live_verified`: listed text fields, URL/categories/transparency and UTC recurring resource CRUD with semantic readback. | Later live start/end/status/URL and DISPLAY-alarm changes plus stale PUT/DELETE 412 pass. Non-DISPLAY alarms remain unsupported. |
| Recurrence and timezones | `fixture_verified`; later `live_verified` for daily instance edits/cancellation, weekly/monthly BYDAY, DATE/floating and spring/fall DST cases, using semantic timezone-normalized readback. | No general recurrence conformance, RANGE/EXRULE/period RDATE/multiple RRULE support or complete timezone database. Series base-time edits preserve explicit detached exceptions and may orphan their former IDs; exception migration is not implemented. |
| Calendar create, rename, remove | `fixture_verified`; later dedicated runner `live_verified` for fresh marked create/rename/remove and separately confirmed absence. | Empty check and DELETE remain non-atomic; isolated ownership evidence does not establish safety for concurrently writable real/shared calendars. |
| Invitations, organizer updates, RSVP and cancellation | `fixture_verified` serialization; later `live_verified`: one invitation submitted/delivered, actual recipient acceptance plus organizer PARTSTAT ACCEPTED, then authorized conditional deletion and absence. | Live tentative/declined responses, schedule-tag behavior, recurring scheduling and recipient cancellation receipt remain unverified. |
| Shared calendars and ACLs | `fixture_verified` for OPTIONS/ACL/privilege inspection and pure legacy CalendarServer share/add/change/remove request generation. | A fresh sharing target stopped on CS:invite404 before POST and was cleaned up at user request. No share was submitted; effective recipient sharing permissions remain unverified. |
| Incremental sync and invalid-token recovery | `fixture_verified` failure contracts; later `live_verified` initial/create/update/delete sync for all six cases, including exact ETag-only resource hydration. | Live invalid-token and transport-failure injection remain open; paginated sync is unsupported and partial results must not advance a token. |
| Uncertain write reconciliation | `fixture_verified`: one readback after a lost/failed response, exact desired bytes or deletion absence, no mutation replay. | Readback proves observed desired state, not causation. The generic client lacks a durable journal; dedicated runners add private manifests/semantic comparisons. Live lost-response injection remains open. |

Apple documents private sharing and participant read-only/edit controls through
its [iCloud Calendar UI](https://support.apple.com/en-gb/guide/icloud/-mm6b1a9479/icloud).
That documents a product capability, not a verified CalDAV sharing endpoint.
The experiment does not invent a generic ACL mutation as a substitute. It also
serializes capability/owner-gated requests from the historical
[Apple CalendarServer sharing extension](https://raw.githubusercontent.com/apple/ccs-calendarserver/master/doc/Extensions/caldav-sharing.txt).
That 2012 specification is not evidence of current iCloud endpoint support.
Generated requests flag potential recipient notifications and are not sent.

## Later authorized live discovery

After explicit owner account selection, discovery/authentication and a finite
2026-10-03 through 2026-10-10 UTC query are `live_verified`: four calendars, zero
resources, complete within that diagnostic window. At that stage actual event-content reads and mutations remained `unverified`;
an empty result did not exercise those behaviors. The subsequent lifecycle below
adds bounded event-content and mutation evidence.

The provider advertised calendar access/scheduling/auto-scheduling, CalendarServer
sharing and access-control; all four calendars reported read/write/property/
content/bind/unbind privileges. These observations reduce capability uncertainty
but do not verify scheduling delivery, share mutation or concurrency behavior.
No event content, invitation, share or calendar mutation was submitted by this
diagnostic. The subsequent isolated lifecycle below records bounded write evidence.

Subsequent dedicated-lifecycle readiness tests bring the independent local
aggregate to **49 tests / 341 assertions across 10 files**. That runner adds a
private durable manifest, fresh-calendar ownership/identity checks and explicit
stop-on-unknown behavior. Those readiness results preceded the live lifecycle receipt below and do not
establish universal collection concurrency safety.

## Later authorized live lifecycle

`live_verified` for a fresh dedicated calendar: create/rename/remove; one UTC
DAILY-count-3 personal series create/read/update/delete; listed text fields, URL
removal/categories/transparency; one instance moved two hours and one cancelled;
semantic server readback and two remaining active occurrences. Conditional delete
was followed by GET 404. No alarms, attendees or invitations were used.

The initial calendar creation stopped before events on a bootstrap/shard owner
identity mismatch. Authenticated principal/home witnesses and reviewed exact-
ledger recovery removed that empty calendar; a corrected fresh run completed.
Separate final read-only checks confirmed both experiment targets 404 and the original
four-calendar count. No pre-existing resource changed. Optional ACL/invite
properties remained unavailable; general shared-calendar deletion safety is not
established by this isolated run.

At this earlier core stage, still `unverified` live: stale-write conflicts, incremental sync/recovery, timezone/
all-day/DST/floating variations, editable alarms, wider recurrence forms,
scheduling delivery/RSVP and share changes. Pure local scheduling/sharing artifacts
do not satisfy those live gates. Final independent local aggregate: **54 tests /
370 assertions / 10 files**; source equality and owned-copy cleanup verified.

## Extended live application cases

`live_verified` for six owned cases: DATE/all-day, floating, spring-DST TZID,
fall-DST TZID, weekly BYDAY and monthly ordinal BYDAY; create/read/update/delete,
start/end/status/URL and past DISPLAY alarms, finite query/path-form multiget,
stale PUT/DELETE 412 with unchanged readback, and initial/create/update/delete
sync. Timezone-normalized provider data passed semantic equivalence checks.

Provider SUMMARY filtering was observed ignored (positive and guaranteed-negative
queries returned the same known resource). Explicit local text filtering over
the complete bounded snapshot passed one/zero-match checks.
`allCasesVerified` therefore describes application behavior, not provider text
filter support or full Calendar conformance.

Guarded provider-shape discoveries and exact-ledger recovery preceded the final
successful run: collection-self sync metadata, ETag-only resource hydration and
path-form multiget. No pre-existing resource or external recipient was changed.
Live invitations/RSVP/sharing require a counterpart and remain unverified; live
invalid-token/failure injection, general recurrence and production integration
are also not established.

Authoritative final independent local aggregate: **64 tests / 452 assertions /
10 files** on Bun 1.4.2. All 20 source/manifest files matched the snapshot; owned
verification copy/link cleanup completed and existing dependencies were preserved.
Earlier demo receipts are historical, not a new final replay.

Separate final read-only checks by the same live operator found all four extension
test-calendar targets 404 and four remaining calendars, matching the initial
count; earlier core targets were already absent. Three recovery ledgers and the
successful six-resource ledger had no pending operation. A planned resource that
was never created was confirmed absent, not reported deleted. No remote test
resource remains; no invitation was sent, share changed or pre-existing resource
modified. Floating
representation was preserved; DST comparison accepted equivalent bounded
occurrences rather than identical timezone bytes.

## Authorized counterpart stage: readiness and acceptance

The owner subsequently supplied and authorized one exact recipient for invitation
and private-sharing experiments. The earlier lack-of-counterpart statements are
historical. No recipient credentials or account login are inferred from that
authorization. The connected Gmail identity matches the selected recipient; a
different connected Google Calendar identity is excluded.

Read-only sender discovery found its primary address in calendar-user-address-set,
valid scheduling inbox/outbox resource types and delivery/send privileges.
CalendarServer allowed-sharing-modes advertised private/public sharing; existing
sharing properties varied and ACL was unavailable. This establishes readiness,
not a new invitation or sharing result. Existing shares must not be changed.

| Controlled step | Observable acceptance | Distinct unresolved evidence |
| --- | --- | --- |
| One future, clearly marked, no-alarm event | Conditional create of a METHOD-free organizer resource with exactly the authorized attendee; GET validates UID/roles/times and captures ETag, schedule tag and scheduling status. | Resource creation/provider scheduling status does not prove inbox delivery or RSVP. No duplicate explicit outbox/iMIP send. |
| Recipient receipt and response | Exact recipient message/event identity; actual recipient action through the correct authenticated identity, followed by organizer PARTSTAT update. | No email may mean iCloud in-app routing, not failure. Sender-side edits cannot fabricate recipient acceptance. |
| One fresh private test-calendar share | Owner/capability validation, exact-recipient read-only share submission, then observed invite state/access. | Pending invite is not acceptance; effective recipient read/write permissions need actual recipient access. |
| Cleanup after response observation | Refresh current identity/tags, cancel/remove the owned event, revoke the exact share, confirm owned calendars empty and absent. | Cancellation/revocation may notify. Sender absence does not prove recipient-side cancellation receipt. Unknown outcomes retain their ledger without replay. |

This plan follows [CalDAV scheduling](https://www.rfc-editor.org/rfc/rfc6638.html)
and the historical CalendarServer sharing extension already cited above.
Live submissions/results are pending separate receipts; the current completed
source aggregate remains 64 tests / 452 assertions.

### Actual invitation receipt

One organizer invitation was submitted (PUT 201 in a freshly created calendar)
and its exact recipient's connected Gmail mailbox received it. Server readback
remains `NEEDS-ACTION` with SCHEDULE-STATUS `1.1`, strong ETag and no Schedule-Tag.
The provider's ORGANIZER alias rewrite caused a post-write guard stop; reviewed
principal-address-set reconciliation is pending. No duplicate send occurred.
Actual delivery is verified, recipient RSVP is not. The marked event/calendar and
private ledger are intentionally retained for response observation; this stage
has not yet returned to a zero-artifact cleanup state.

Read-only reconciliation subsequently verified the organizer alias, with no
duplicate submission. Organizer readback now shows attendee `ACCEPTED`; mailbox
receipt and sender-observed RSVP are verified separately. A sharing attempt
created a separate empty calendar but stopped at CS:invite 404 before POST, so
sharing submission/delivery is not established. Both dedicated calendars remain
retained for controlled continuation.

The user's exact-invitation screenshots show recipient Accepted in Apple's RSVP
UI and the native calendar. Combined with organizer PARTSTAT ACCEPTED, actual
recipient action and sender-visible RSVP are verified. The user then requested
cleanup of all experiments, ending further sharing attempts. Sharing remains
uncompleted (no POST). Current independent aggregate: **71 tests / 502 assertions
/ 11 files**, with 22 source/manifest files matching and owned-copy cleanup done.

Authorized cleanup is verified for both retained targets: invitation conditional
DELETE 204 then GET 404, invitation calendar DELETE 204/PROPFIND 404, and empty
unshared calendar DELETE 204/PROPFIND 404. Both ledgers are complete. Recipient
cancellation receipt is not inferred from these sender-side absence checks.

Final same-operator read-only global inventory returned four calendars (baseline
four), with zero experiment-marker/title/path matches. All three current-stage
planned targets and the invitation resource returned404; created-target ledgers
were complete with no pending operation. No remote experiment resource remains.
No recipient mailbox message or recipient-side event is claimed deleted.
