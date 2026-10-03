# Calendar preparation: offline findings and proposed boundary

Current integration goal: [production-ready registered Calendar
module](calendar-production.md). The registered source/build gate now passes;
registered production-path live smoke passed and cleaned its resources. The user accepted remaining recipient verification limits; final sharing
revocation and cleanup restored the four originals with zero test markers.
The historical experiment receipts below do not establish production readiness.

Historical exploration status (superseded for current source by the production coverage linked above): exploratory CalDAV/iCalendar tooling, not a production Calendar feature. Local operation fixtures and authorized live discovery/read-window checks have run; see the latest live receipt below. No Calendar production tools, grants or configuration have been added. Dedicated live calendar/event lifecycles, fields, recurrence/time variants, queries, conflicts and incremental sync have now passed within the tested cases; sharing, invitations and general standards coverage remain open. Earlier sections retain historical evidence and limitations at the time of those runs.

## Expected operations

| Operation | Proposed contract | Protocol candidate |
| --- | --- | --- |
| List calendars | Return discovered calendar href, display name and observed privileges; never infer write permission from name | Principal/home discovery and PROPFIND |
| List/search events | Required finite start/end window, bounded results; explicit recurrence expansion mode | calendar-query REPORT |
| Read event | Calendar href + resource href; return UID, strong ETag and event components | GET or calendar-multiget |
| Create personal event | Explicit calendar, UID, start/end type; conditional create; return actual resource href/ETag | PUT with If-None-Match: * |
| Update personal event | Exact href, UID and required previous strong ETag; conflict returned for review, no blind retry | PUT with If-Match |
| Delete personal event | Exact href and ETag; explicit whole-resource/series semantics | DELETE with If-Match |

A UID is calendar data identity, not a URL. The stable application reference includes calendar href, resource href and UID; recurring instances additionally need RECURRENCE-ID with its original value type/timezone. Preserve server href encoding. Validate discovered targets before forwarding credentials; cross-origin redirects, untrusted hrefs and XML entity/network expansion need dedicated adapter tests.

## Time and recurrence

All-day events use DATE with exclusive DTEND. UTC, TZID and floating local times remain distinct. Never silently interpret unresolved TZID as UTC. The candidate needs embedded VTIMEZONE registration or an explicit maintained timezone source; stock ICAL.js has no IANA database. Require explicit timezone for new timed events unless the user deliberately requests floating time.

Read recurring series without discarding RRULE, RDATE, EXDATE, exceptions, alarms or unknown properties. Expansion must have both time and instance limits. Initial writes should be restricted to non-recurring personal events; recurring series/instance changes require a separate contract and tests for overrides, DST and exception preservation. Do not flatten a series to one VEVENT.

## Invitations and permissions

CalDAV scheduling can have side effects when writing organizer/attendee events. The bounded initial write policy rejects METHOD, ORGANIZER and ATTENDEE-bearing objects, including updates/deletes of existing scheduled objects, rather than assuming that omitting an explicit invite operation prevents invitations. iTIP/iMIP, RSVP, attendee changes, shared-calendar writes and scheduling inbox/outbox are deferred.

Future `calendar.read` and `calendar.write` would be distinct, disabled-by-default capabilities with fresh explicit OAuth consent. Mail grants grant no Calendar access. No scope is currently registered. A server's actual privileges and the local policy must both permit a mutation.

## Experiment evidence

`playground/calendar` pins ICAL.js 2.2.1 and fast-xml-parser 5.11.1 in an isolated package. Run `bun test --cwd playground/calendar`. Tests exercise actual parser libraries for UID/DATE/escaping/property preservation, recurrence exclusion, XML href/ETag extraction, and missing timezone data. Conditional mutations use a handwritten HTTP-shaped in-memory fixture; they prove intended precondition behavior only, not an independent CalDAV server or network transport.

The initial parser experiment did not cover transport bounds, DST or overrides; the follow-up below adds bounded fixtures for those cases. Still unverified: production namespace/propstat mapping, actual iCloud discovery/auth, general timezone resolution, calendar ACLs, sync-token recovery, provider scheduling behavior, transport retries and independent interoperability. These results support a read-first adapter spike, not Calendar readiness.

Primary references: [CalDAV RFC 4791](https://www.rfc-editor.org/rfc/rfc4791.html), [CalDAV scheduling RFC 6638](https://www.rfc-editor.org/rfc/rfc6638.html), [ICAL.js upstream and timezone limitations](https://github.com/kewisch/ical.js).

### Follow-up: transport and calendar semantics

The expanded offline suite passes 10 tests / 55 assertions. Actual loopback HTTP now exercises PROPFIND, REPORT, conditional PUT and DELETE, including conflict preservation/no blind overwrite. Responses retain per-resource 200/404 status, enforce a streamed size cap, reject malformed XML/DTD and wrong namespaces, and never follow redirects. The DAV XML reader accepts root-level prefix bindings but deliberately rejects nested declarations; namespace-stack parsing and per-property propstat mapping remain implementation gates.

Bundled synthetic VTIMEZONE tests verify spring/fall daily 09:00 offsets, and actual ICAL.js exception handling verifies a moved RECURRENCE-ID plus EXDATE and unknown-property preservation. Earlier missing timezone and override limitations are partially resolved for these fixtures only. Ambiguous/nonexistent wall times, RANGE=THISANDFUTURE, complex recurrence edits and invitation behavior remain open. No promise of full Calendar functionality is reduced by these bounded experiments: these are the next explicit gates, not silently dropped features. The fixture server is ours, not an independent CalDAV server, and iCloud remains untested.

## 0.1.16 acceptance audit

On 2026-10-02, the installed `current` release points to `releases/0.1.16-darwin-arm64`; its artifact manifest identifies version 0.1.16. The source and installed MCP server have no Calendar tool registration. Calendar remains an isolated feasibility playground, not an implemented or deployed user capability. A fresh `bun test` in `playground/calendar` passed **10 tests / 55 assertions** under Bun 1.4.2. No real Calendar credentials, events or invitations were accessed.

| Requested behavior | Evidence | Remaining acceptance gap |
| --- | --- | --- |
| List calendars / read events | Loopback PROPFIND and GET fixtures; real ICAL parser | No principal/home discovery or production read adapter; no iCloud acceptance |
| Search events | REPORT reaches a loopback fixture and returns canned resource statuses | Fixture does not evaluate time-range/text filters; search correctness untested |
| Timezones | Synthetic VTIMEZONE daily 09:00 spans spring/fall DST | Real timezone coverage and ambiguous/nonexistent wall times untested |
| All-day events | DATE typing and exclusive DTEND round-trip | Provider read/search boundary behavior untested |
| Recurrence | EXDATE and moved RECURRENCE-ID fixture preservation | General expansion/search, complex series edits and provider interoperability untested |
| Create / update / delete | Loopback ETag create/update/delete preconditions and stale-write preservation | Handwritten fixture, not independent CalDAV or deployed adapter |
| Invitations | Proposed personal-write helper rejects METHOD, ORGANIZER and ATTENDEE | Not a production guard or provider notification test; invitations remain deferred |

Next dependency is a read-first production adapter with isolated protocol contract tests, then separately authorized account authentication/read-only interoperability. Do not describe these playground tests as Calendar end-to-end acceptance. No real event mutations or invitations are needed for the current isolated work.

## Sequential application experiment (2026-10-03 UTC)

The accepted exploration covers three stages in order: connection/calendar reads
and recurrence, search/free time/summary, then personal test-event create/update/
delete. This round exercises all three with synthetic data and an ephemeral Bun
loopback server. Its calendar list and REPORT bodies use application JSON, **not
CalDAV discovery or calendar-query XML**. The earlier canned REPORT fixture is
unchanged; neither fixture establishes iCloud interoperability.

Implementation and independent review each verified **19 tests / 138 assertions
passed** under Bun 1.4.2, and the sequential demo exited successfully in both runs.
The reviewer compared the latest source and verification copy byte-for-byte
before the final run. No blocking findings remain for this bounded fixture scope.
Verification occurred on
2026-10-03 UTC. This checkout had no installed dependencies;
the worker copied its calendar TypeScript files and package manifest into an owned
temporary directory and reused an existing dependency directory containing the
pinned parser versions. No packages were installed. With those dependencies
already available, the normal commands from `playground/calendar` are `bun test`
and `bun run demo`. See the [playground evidence](../playground/calendar/README.md)
for the execution details and latest review result.

The recorded verification commands were
`bun test /tmp/icloud-calendar-experiment.FyqU5K` and
`bun /tmp/icloud-calendar-experiment.FyqU5K/demo.ts`, after copying
`playground/calendar/*.ts` and `package.json` there and linking the existing
`/Users/scottchu/projects/personal/icloud-mail-mcp/playground/calendar/node_modules`.
That directory is a disposable verification copy, not a retained runtime or an
installation destination; use the playground commands above for future runs.

| Stage | Observed fixture behavior | Remaining boundary |
| --- | --- | --- |
| Calendar list and read | JSON list returns a synthetic calendar; GET returns ICS and a strong ETag; series identity and original RECURRENCE-ID survive expansion. | No principal/home discovery, real privileges, authentication or account access. |
| Search and recurrence | Finite half-open window filters real parsed occurrences; summary text matching is case-insensitive; EXDATE and an October 5 instance moved into October 2 are handled. Window-edge non-overlaps are excluded. | Application query over supplied resource snapshots, not provider-side CalDAV filtering or general recurrence support. |
| Free time and summary | Busy intervals are clipped and merged; transparent/cancelled events are excluded from busy time. Incomplete, text-filtered or insufficient-window results cannot support availability. | Completeness is relative to the supplied fixture snapshot; it does not establish a complete remote calendar sync. |
| Personal event writes | Create/read/update/read/stale-conflict/delete/GET-404 sequence succeeds; stale update/delete preserve current content, with no retry. UID, unknown properties and an alarm survive summary edits. Concurrent delayed-body writes recheck current preconditions before mutation. | In-memory fixture only; no real event was created, updated or deleted. Lost-response reconciliation, persistence, independent server behavior and scheduling remain unverified. |

For the demo window **2026-10-02 09:00–13:00 UTC**, the fixture returns five
occurrences and two `PLANNING` search matches. Busy intervals are 09:00–10:00 and
11:00–12:00; free intervals are 10:00–11:00 and 12:00–13:00, totaling 120 minutes
each. The mutation sequence observes 201 create, 204 update, 412 stale update,
204 delete and 404 final GET, with UID and `X-KEEP` preserved.

The query supports UTC timed events, DATE events with explicit `allDay: 'utc'`
interpretation, simple DAILY/WEEKLY rules without BY filters, and DATE/DATE-TIME
RDATE/EXDATE and detached overrides. DATE retains its all-day marker and exclusive
end; UTC interpretation is an explicit experiment policy, not a provider default.
Floating/TZID times, period-valued dates, RANGE overrides, EXRULE and unsupported
rules produce incomplete results. Resource, result and expansion budgets likewise
produce explicit issues rather than silently complete results. Earlier synthetic
VTIMEZONE/DST tests remain separate parser evidence; the new query does not resolve
timezones. Personal writes reject scheduling-bearing and recurring resources.

The application follows the overlap and recurrence principles in
[RFC 4791 sections 7.4 and 9.9](https://www.rfc-editor.org/rfc/rfc4791.html), and the
exclusive DTEND and TRANSP meanings in
[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html). These references guide the
bounded experiment; they do not imply full standards conformance.

Live acceptance remains open for each stage. No Calendar production tools,
Calendar consent/enrollment path or production adapter were added. The next
integration gate remains read-only discovery/authentication and independent
interoperability; account writes additionally need the proposed personal-event
policy, actual privileges and uncertain-outcome reconciliation.

## Full-operation exploration (2026-10-03 UTC)

The user expanded the accepted scope to event fields and recurring changes,
calendar management, invitations/replies/sharing, timezones and synchronization
recovery, including eventual real iCloud verification. The
[full acceptance matrix](calendar-acceptance-matrix.md) retains each requirement
and its live prerequisite. Earlier results above remain historical bounded
evidence; they do not establish completion of the expanded scope.

The new modules remain isolated playground experiments. Calendar collection
operations exercise actual MKCALENDAR, PROPPATCH and DELETE shapes with an owned
loopback collection. Rename checks individual property status and reads back the
name. Removal requires a collection created by the same helper instance and an
empty listing, followed by an absence check. The empty check and DELETE are
non-atomic: this does not establish safe removal of a concurrently writable real
or shared calendar.

`caldav-client.ts` adds real CalDAV XML discovery/query/multiget and conditional
event resource operations. It resolves nested namespaces, preserves property
failures, caps transport bodies/deadlines, restricts target origins and reports
redirects for explicit rediscovery. Sync applies changed/deleted resources to a
new snapshot and advances its token only after complete validation; an invalid
token triggers a fresh sync. Pagination remains unsupported and partial/507
responses fail. This is a client tested against a handwritten loopback server,
not an independent server or proof of provider-side search correctness.

After an uncertain write, the client performs one readback and never replays the
mutation. Exact proposed bytes or deletion absence can establish observed desired
state; they do not establish which request caused it. Other outcomes remain
unknown. Durable operation journaling and normalized iCalendar comparison are
still missing, so provider normalization may leave a successful write unknown.

`advanced-events.ts` adds personal field edits (including description, location,
URL, categories, status/transparency, timing and DISPLAY alarms), bounded
daily/weekly/monthly recurrence with selected BYDAY forms, whole-series and
detached-instance edits/cancellation, and timezone-aware expansion. UID, unknown
properties, embedded VTIMEZONE and original recurrence identities are retained.
DATE/floating interpretations require explicit policy; DST gaps/folds and unknown
TZID fail rather than silently becoming UTC. RANGE=THISANDFUTURE, EXRULE,
period-valued RDATE, multiple RRULEs, timezone DURATION and non-DISPLAY alarm edits
remain unsupported. Editing the series base time retains explicit detached
exception IDs/times; migration of exceptions to the new pattern is not provided.

Scheduling helpers serialize REQUEST, organizer updates, REPLY and CANCEL with
UID/role/sequence/timestamp checks. RSVP covers accepted, tentative and declined.
They do not submit scheduling messages or confirm recipient state; recurring
scheduling and schedule-tag concurrency are not implemented. Sharing tests inspect
OPTIONS, privileges, ACL and scheduling metadata, and generate owner/capability-
gated legacy CalendarServer add/change/remove sharing requests without sending
them. Current iCloud support and actual private-share mutation remain unverified;
no generic ACL write is presented as an iCloud sharing API.

No production Calendar tool, module, scope or enrollment route is added. A stored
Mail credential and existing Mail consent do not themselves create Calendar
consent. The owner has now selected the account for the separate diagnostic;
remaining target selection and isolated scheduling counterparts are separate
acceptance inputs. No current fixture pass should be reported as a real
iCloud event, invitation or sharing operation.

Independent final verification passed **43 tests / 309 assertions in 9 files** on
Bun 1.4.2. Both `demo.ts` and `full-demo.ts` exited successfully. The composed
CalDAV demo made 27 loopback requests and verified calendar/event lifecycles,
query/multiget and changed/deleted sync; it sent zero external messages and
reported `liveICloudVerified: false`. Verification reused the existing exact
pinned parser dependencies in an owned temporary copy; no installation occurred.
An initial integration assertion failed because XML normalizes ICS CRLF to LF;
the comparison was corrected to normalize line endings, and the final aggregate
passed. No independent provider interoperability or live acceptance is claimed.

## Authorized live discovery receipt (2026-10-03 UTC)

After explicit owner account selection, the protected credential was used for
read-only CalDAV authentication, principal/home/calendar discovery and a finite
query window of **2026-10-03 through 2026-10-10 UTC**. Discovery returned **four
calendars** and the complete query returned **zero resources**. This verifies
connection/discovery and an empty-window query, not real event-content parsing,
search correctness, free-time completeness across other windows or any writes.

The home OPTIONS response was 200 and advertised `calendar-access`,
`calendar-schedule`, `calendar-auto-schedule`, `calendarserver-sharing` and
`access-control`. All four calendars reported read/write/property/content/bind/
unbind privileges. These are observed capability/privilege advertisements, not
proof of working scheduling, share mutations or every permitted action. The
observed provider shard was explicitly trusted; redirects did not automatically
forward credentials. No event content was returned and no mutation, invitation or
share was submitted during this receipt. Production enrollment/grants remain
unchanged. The subsequent isolated lifecycle receipt below records actual write evidence.

The separately reviewed dedicated lifecycle runner adds fresh-calendar ownership
checks, recorded exact resource identities and a private durable manifest; it
stops without replay or automatic cleanup when an outcome needs reconciliation.
This does not change the generic client's earlier non-durable behavior. Its
readiness tests expanded the independent aggregate to **49 tests / 341 assertions
across 10 files**; final source/snapshot equality and temporary-copy cleanup were
verified. This is readiness evidence, not a live lifecycle result.

## Authorized live personal lifecycle receipt (2026-10-03 UTC)

The first run created one fresh marked test calendar (201), then stopped before
event creation because the authenticated bootstrap principal and shard-local
owner principal used different origins. No blind replay occurred. Read-only
witnesses established the shard root's current principal and that principal's
exact calendar home. A reviewed recovery path checked the retained ledger,
marker, owner and empty inventory, then deleted that one calendar and verified
absence. This was an observed guard mismatch and bounded recovery, not a
successful first attempt or an arbitrary principal-equivalence assumption.

A corrected fresh run then completed the following real iCloud operations:

- Create a dedicated marked calendar and one personal UTC event with a three-day
  DAILY series; verify the actual server ICS and strong ETag.
- Create summary, description, location, URL, categories, CONFIRMED status,
  OPAQUE transparency and UTC start/end. Update summary, description, location,
  categories and transparency to TRANSPARENT, and remove URL. No alarm was added.
- Move the second instance two hours later while retaining its original
  RECURRENCE-ID; cancel the third instance. Semantic readback matched, and local
  expansion of the actual returned ICS contained two active occurrences.
- Delete the event with its ETag and confirm GET 404; rename the test calendar and
  read back its new name; verify the owned calendar empty, delete it and confirm
  absence.

The runner reported complete, zero invitations and zero pre-existing resources
changed. A separate final read-only check by the same live operator found both experiment-calendar
targets absent (404), both ledgers without a pending operation, and **four
calendars**, matching the initial count. Private recovery ledgers supported reconciliation; account/resource identifiers
are not reproduced here. Optional ACL/invite
properties were unavailable and remain unknown rather than proving privacy.
Fresh UUID ownership, exact marker/principal witnesses, no share writes and exact
resource inventory bounded this run; collection listing and DELETE still are not
an atomic concurrency guarantee for general/shared calendars.

This verifies the listed operations only. Live alarms, non-UTC/DST/all-day/floating
cases, weekly/monthly/BYDAY series, stale-write conflict injection, incremental
sync/failure injection, invitation/RSVP delivery and sharing changes remain open.
The final independent local aggregate is **54 tests / 370 assertions across
10 files** on Bun 1.4.2, with source-copy equality and owned-copy cleanup verified.
Earlier 43/309 and 49/341 receipts describe preceding snapshots; the earlier two
demo passes remain valid because their source was unchanged.

## Extended authorized live operations (2026-10-03 UTC)

The same-account extension completed all six application cases in a fresh owned
test calendar: DATE/all-day, deliberate floating time, spring-DST and fall-DST
TZID cases, weekly BYDAY and monthly ordinal BYDAY. Each case created, read,
updated and deleted its personal resource. The runner exercised start/end and
status changes, URL add/remove and past DISPLAY-alarm add/edit/remove; no reminder
was intentionally scheduled in the future. Provider-normalized timezone
components were compared by equivalent event/time semantics, not literal bytes.

For each case, finite calendar-query and path-form calendar-multiget returned the
known resource with its current ETag; stale conditional PUT and DELETE returned
412, and readback confirmed unchanged current content. Initial/create/update/
delete incremental sync was checked against the exact owned resource inventory.
The provider's bounded SUMMARY text filter did **not** distinguish a matching
query from a guaranteed non-match. Local summary filtering of the complete bounded
known snapshot correctly returned one and zero; this establishes the application
fallback, not successful provider-side text filtering.

Actual provider differences were discovered through guarded stops before the
final successful run:

- Sync included collection-self metadata without event data. The adapter must
  distinguish that exact collection row from event resources.
- Changed-resource sync rows supplied ETags without calendar-data. The extension
  hydrates exact trusted resources and checks matching ETags before accepting a
  complete snapshot.
- calendar-multiget with absolute href values returned 404 for a known resource;
  the same request with validated origin-relative path values returned its
  matching ETag/data. Only the wire href representation was changed.
- Positive and negative bounded text queries returned the same known resource;
  the extension records provider filtering as ignored and uses its explicit
  complete-snapshot local filter.

These were observed response-shape/behavior mismatches, not proof of lost data or
unknown mutation results. Exact owned calendars/resources were preserved in
private manifests, inspected and conditionally cleaned through reviewed recovery
before fresh runs. The final runner reported `lifecycleComplete: true` and
`allCasesVerified: true` for these application checks, zero invitations and zero
pre-existing resources changed. A separate final read-only check by the same operator confirmed all four
extension-calendar targets absent (404), the calendar count restored to four,
three recovery ledgers complete and the successful six-resource ledger complete,
with no pending operations. One recovered attempt had only a planned, never-
created resource (GET 404); no deletion is claimed for that absent resource. The
other created resources were deleted and verified absent. Earlier core-run
targets were already separately confirmed absent. No remote test resources remain. No live invitation, RSVP delivery or sharing mutation
was attempted because no test counterpart was supplied.

Remaining limits include RANGE=THISANDFUTURE, EXRULE, period RDATE, arbitrary
recurrence/timezone conformance, non-DISPLAY alarms, paginated sync, actual invalid
sync-token/transport-failure injection, scheduling concurrency and recipient-side
behavior, shared-calendar permission enforcement and production Calendar
integration. Fixture evidence for these failure contracts is not promoted to live
acceptance.

Authoritative final independent local aggregate: **64 tests / 452 assertions /
10 files** under Bun 1.4.2. All 20 source/manifest files matched the verification
snapshot; owned copy/link cleanup completed without changing existing pinned
dependencies. This supersedes earlier aggregate counts for current source. Demos
were not rerun in this final aggregate; their earlier unchanged-source passes
remain historical evidence. No Calendar production module/tool/scope, build,
installation or deployment change is claimed.

The exact extended cases were `all-day-date`, `floating`, `embedded-dst`
(March 2026), `embedded-fall-dst` (November 2025), `weekly-byday` (MO/WE) and
`monthly-byday` (1MO). DISPLAY alarms changed from 15 minutes before to five
minutes before, then were removed. Floating representation remained distinct;
both DST cases used equivalent bounded-occurrence comparison after provider
normalization, not a claim that TZID or VTIMEZONE bytes were preserved. No live
invalid-token recovery or transport-failure injection was performed.

## Authorized counterpart readiness (subsequent stage)

The owner subsequently provided one exact recipient and authorized invitation and
private-sharing experiments. Read-only checks confirmed the sender's primary
calendar-user address, valid scheduling inbox/outbox types, deliver/send
privileges and private-sharing capability advertisements. Existing shares were
not modified. The connected Gmail identity matches the intended recipient; an
unrelated connected Google Calendar identity is not used.

The next bounded experiment is one clearly marked future event without alarms
and, if fresh-target capability checks permit it, one dedicated private calendar
shared read-only with that recipient. Organizer submission, provider scheduling
status, recipient delivery, actual RSVP and share acceptance/access are separate
acceptance states. No email is not proof of delivery failure when an iCloud
recipient may receive an in-app invitation. Cleanup occurs after useful response
observation and may generate cancellation/revocation notifications. No live
submission in this stage is claimed by this readiness receipt; see the current
[acceptance plan](calendar-acceptance-matrix.md#authorized-counterpart-stage-readiness-and-acceptance).

## Counterpart invitation: actual submission and delivery

A first start stopped at sender-address validation before any remote creation;
the planned calendar was confirmed absent. A later fresh start created one test
calendar (201) and submitted exactly one organizer invitation resource (PUT 201).
Readback confirmed its intended identity, times and exact selected attendee, with
PARTSTAT `NEEDS-ACTION`, SCHEDULE-STATUS `1.1`, a strong ETag and no Schedule-Tag.
The provider rewrote ORGANIZER to a principal-address-set alias, triggering a
guard stop after the acknowledged write. No resend or automatic cleanup occurred.
Alias-witness reconciliation is pending reviewed completion.

The root agent inspected the connected mailbox for the exact
authorized recipient and confirmed delivery of this invitation. This establishes
actual message receipt in addition to sender-side creation; it does not establish
recipient RSVP or organizer acceptance state. The event, dedicated calendar and
private recovery evidence remain retained for response observation. Sharing
submission and cleanup are not claimed by this receipt.

Subsequent reviewed reconciliation used read-only requests only and verified the
provider's ORGANIZER alias against the authenticated sender address set. The
organizer event now reports attendee PARTSTAT `ACCEPTED`, still SCHEDULE-STATUS
`1.1`, strong ETag and no Schedule-Tag. This is observed sender-side RSVP state;
it is separate from the previously verified mailbox delivery.

A separate sharing start created one fresh empty test calendar, then stopped
before POST because CS:invite was unavailable (404). No share request or sharing
notification was submitted by that attempt. Both dedicated calendars remain
retained pending the next controlled phase; no all-artifacts-removed claim applies
to this counterpart stage.

The user then supplied screenshots of the exact test invitation: Apple's RSVP UI
showed Accepted for the intended recipient, and the native calendar showed that
recipient accepted. Together with organizer-side PARTSTAT ACCEPTED, this verifies
actual recipient action and sender-visible RSVP, beyond mailbox delivery alone.
The user explicitly requested cleanup of all experiments; no further share
submission will be attempted. Sharing remains uncompleted because its guard
stopped before POST. Cleanup results are recorded separately when verified.

The subsequent independent aggregate passed **71 tests / 502 assertions across
11 test files** under Bun 1.4.2. All 22 source/manifest files matched the tested
snapshot; the owned verification copy was removed. No dependency installation or
live action occurred in that independent test run. Earlier counts are historical.

Authorized cleanup then conditionally deleted the invitation resource (204,
followed by GET 404), deleted its dedicated calendar (204/PROPFIND 404), and
deleted the separate empty unshared calendar (204/PROPFIND 404). Both operation
ledgers reached complete. This confirms sender-side removal; cancellation may
notify the attendee, but recipient-side cancellation receipt/removal is not
inferred from the sender's 404. A separate final read-only global inventory by the same live operator confirmed
four calendars, matching baseline, and zero experiment-marker, title or path
matches across the calendar inventory. All three current-stage planned calendar
targets (including the never-created first attempt) and the invitation event
returned404. Both created-target ledgers were complete with no pending operation;
the first attempt remained confirmed never-created. No remote experiment
resource remains.

After documentation readback and confirmed remote cleanup, the owned operational
source/receipt copy, dependency link and three reconciled current-stage ledgers
were removed. Existing dependency installations and unrelated work were
preserved. No local recovery artifact remains for this completed stage.
