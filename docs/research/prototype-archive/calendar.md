# Calendar offline experiments

> Historical research archived on 2026-10-07. Commands and prototype paths below describe the original experiment, not supported commands in the current checkout. See [retirement and current replacements](../retired-prototypes.md).

Production integration is now separately accepted and in progress; see
[module coverage](../../calendar-production.md). This playground preserves
experimental evidence and is not a runtime dependency of the production module.

Latest status: offline experiments plus a separately authorized, isolated live
personal-event/calendar lifecycle now verified. Final local aggregate is 71 tests
/ 502 assertions. See the live outcome section below; no production Calendar
capability is added. The initial sections preserve earlier offline-only evidence
and limitations at the time of those runs.

Goal: determine whether Bun can parse CalDAV multi-status XML and preserve iCalendar identity, all-day boundaries and recurrence, before choosing a production adapter. No Apple credentials, external requests or production integration.

Expected: actual parser libraries parse synthetic XML and ICS; conditional resource writes reject stale ETags and duplicate creates; recurrence expansion is bounded; invitation-bearing objects fail closed for the proposed personal-event write subset. A fixture is not an iCloud interoperability test.

With the pinned dependencies already available, run `cd playground/calendar`, then `bun test` and `bun run demo`. Dependency installation is a separate explicit setup step; these experiments do not access an Apple account.

Initial outcome (superseded by follow-up below): 6 tests / 23 assertions passed under Bun 1.4.2. Actual ICAL.js 2.2.1 and fast-xml-parser 5.11.1 APIs run successfully. The XML fixture uses a fixed prefix (not a production namespace resolver). The ETag fixture is handwritten and makes no socket requests. Invitation blocking is proposed application policy, not provider verification. Missing IANA timezone registration is observed; DST/VTIMEZONE conversion and detached recurring overrides remain untested. See ../../docs/calendar-feasibility.md for the bounded contract and next gates.

Next experiment goal: use an actual loopback HTTP server and client for PROPFIND/REPORT/conditional PUT/DELETE; reject oversized/malformed XML, resolve DAV namespace independently of prefix and retain per-resource failures. Exercise synthetic VTIMEZONE DST and recurrence overrides using the real iCalendar library. This remains a controlled fixture, not an independent CalDAV implementation.

Follow-up outcome: 10 tests / 55 assertions pass. `http.test.ts` now uses real Bun loopback HTTP requests with a 2-second timeout, manual redirects, streamed 4 KB response cap, XML validity/DTD checks, DAV root-prefix resolution and retained 200/404 resource results. Nested namespace declarations are intentionally rejected (including malicious rebinding); valid nested declarations still require a general namespace-stack implementation. Conditional PUT/DELETE conflicts preserve prior content with no retry. Href containment is tested separately before requests; no credentials are attached in this fixture.

`timezone.test.ts` registers a bundled synthetic Eastern VTIMEZONE only for each test, checks spring/fall 09:00 recurrences against expected UTC times, and checks a RECURRENCE-ID moved instance plus EXDATE and unknown-property roundtrip. Timezone registration is removed afterward; HTTP server closes in finally. This establishes the candidate API on those fixtures, not general DST ambiguity handling or independent CalDAV interoperability.

Earlier verification: rerun on 2026-10-02 against installed release 0.1.16 context: **10 tests / 55 assertions passed**. Calendar is not part of that production release. Those REPORT responses are canned; they do not prove search filtering. See the acceptance matrix in `../../docs/calendar-feasibility.md` for implemented-versus-experimental distinctions.

## Sequential application scenarios (2026-10-03)

`scenarios.ts` exports reusable finite-window querying, availability and personal-event edit guards. `fixture.ts` serves synthetic resource snapshots over actual loopback HTTP; its discovery and REPORT bodies use application JSON, **not CalDAV wire format**. The earlier XML transport tests remain separate evidence. Nothing here registers a production Calendar tool.

`bun run demo` runs all three stages in order and closes the server in `finally`:

1. List the synthetic calendar and GET a recurring resource with its ETag.
2. Query the half-open UTC window 2026-10-02 09:00–13:00, search `PLANNING`, then compute busy/free intervals and a numeric summary from the complete, unfiltered result. Five overlapping occurrences produce two search hits. Busy intervals are 09:00–10:00 and 11:00–12:00; free intervals are 10:00–11:00 and 12:00–13:00 (120 minutes each). One original October 5 recurrence is moved into October 2 while retaining its RECURRENCE-ID.
3. Create a unique synthetic personal event (201), GET, update its summary (204), GET, attempt one stale update (412 with content unchanged), delete using the fresh ETag (204), then GET (404). UID and unknown-property preservation are checked. Tests also verify VALARM preservation and stale deletes.

The application query deliberately supports UTC timed events and DATE values only with explicit `allDay: 'utc'` mapping. This is an experiment policy, not an inference that all-day events belong to UTC. DATE end dates remain exclusive. It supports one UID/master per resource, simple DAILY/WEEKLY rules without BY filters, date-valued RDATE/EXDATE, and detached overrides. Floating/TZID times, period-valued RDATE, RANGE overrides, EXRULE and more complex RRULEs are rejected as incomplete. The older timezone tests still separately exercise synthetic DST conversion; those results are not integrated into this query engine.

Windows must be positive and at most 366 days. Defaults cap resources at 100, iterator steps at 1,000 and result occurrences at 200; each resource is limited to 65,536 string code units and 100 event components. Unsupported or malformed resources and exhausted budgets return explicit issues and `complete: false`. Availability refuses incomplete or text-filtered results and windows beyond their recorded coverage. Within coverage it clips/merges busy intervals, excludes transparent/cancelled occurrences, and scopes summary counts to the requested window. Completeness concerns the supplied fixture snapshot; it says nothing about unsupplied calendars or provider pagination.

Writes accept only a single nonrecurring personal VEVENT with a positive duration. Both current and proposed resources are guarded against scheduling and recurrence. METHOD, ORGANIZER, ATTENDEE, additional top-level components, weak/missing ETags and UID changes are refused. Conditional-create and update/delete preconditions are evaluated after reading the HTTP body, with no async boundary before mutation; a delayed-body regression verifies that concurrent create/update requests cannot overwrite the winner. Duplicate UIDs are compared from parsed components, including LF-only input. No invitations or shared-calendar writes are implemented.

Verification under Bun 1.4.2: **19 tests / 138 assertions passed**, and the complete demo exited successfully. This worktree had no installed dependencies. For verification, the TypeScript files and package manifest were copied to an owned external temporary directory with `node_modules` symlinked to an existing installation of the exact pinned ICAL.js 2.2.1 / fast-xml-parser 5.11.1 dependencies; `bun test <temporary-directory>` and `bun <temporary-directory>/demo.ts` ran there. No dependency installation or production configuration was changed. After evidence reconciliation and independent review, the owned copy and symlink were removed; the existing dependency installation was retained. The tracked sources contain everything needed to repeat the experiment with those dependencies.

Still unverified: independent CalDAV server behavior, iCloud discovery/authentication/ACLs, real account reads or writes, complete timezone coverage, general recurrence, provider scheduling and production transport/recovery. These are application and protocol fixtures, not live Calendar acceptance.

## Expanded operation experiments

The [full acceptance matrix](../../calendar-acceptance-matrix.md) tracks the
expanded request across local experiments and live gates. Earlier test counts
above are historical; new modules do not retroactively expand those results.

`caldav-client.ts` exports bounded XML discovery/query/multiget, conditional event
CRUD and immutable sync snapshots. It rejects partial syncs without advancing the
token and retries an invalid token as a fresh snapshot. Pagination/507 is not
implemented. Uncertain mutations get one readback, never a mutation replay;
matching bytes establish observed desired state, not causation. There is no
durable operation journal or normalized iCalendar comparator. Redirects require
explicit rediscovery and exact target-origin approval.

`advanced-events.ts` exports createEvent, editSeries, editOccurrence,
cancelOccurrence, cancelSeries, expand and instant. Fields include description,
location, URL, categories, status/transparency, start/end and DISPLAY alarms.
Daily/weekly/monthly and selected BYDAY recurrence, moved overrides and embedded
VTIMEZONE DST are exercised. DATE/floating policy is explicit; unresolved TZID,
gap/fold times, RANGE, EXRULE, period RDATE, multiple RRULEs and timezone DURATION
are rejected. A base-time edit preserves explicit detached exceptions rather than
migrating their identities to the changed pattern. Cancellation is an ICS status
change; resource deletion uses the transport's conditional remove operation.

`bun run full-demo` composes these helpers through a loopback CalDAV fixture:
discovery, calendar creation/rename, full-field recurring event creation and
edits, query/multiget, stale-write conflicts, changed/deleted sync and collection
cleanup. Scheduling and sharing produce artifacts only. The demo's server is
owned synthetic state and is closed on completion; it is not an iCloud test.

Independent final verification on Bun 1.4.2 passed **43 tests / 309 assertions in
9 files**, with both `bun run demo` and `bun run full-demo` successful. The full
demo observed 27 loopback requests, two remaining occurrences before resource
cleanup, both calendar/event lifecycles and initial/change/tombstone sync. It sent
zero external messages and reported `liveICloudVerified: false`. Verification
used an owned temporary source copy and the existing exact pinned dependency
installation, with no package installation. The first integration comparison
exposed XML line-ending normalization (CRLF to LF); the corrected comparison
passed in the final aggregate. These counts include prior tests, not 43 new tests.
The reviewer confirmed the final verification copy matched the source files and
removed the owned temporary copy and dependency link afterward; the existing
dependency installation was preserved. To repeat with dependencies available,
run `bun test`, `bun run demo` and `bun run full-demo` from this directory.

`calendar-operations.ts` provides collection list/inspection and owned-fixture
create/rename/remove operations through CalDAV XML. Creation records ownership
only after success; rename checks property status and readback; removal checks
ownership, an empty listing and subsequent absence. Empty-check and DELETE are
not atomic, so this helper is not sufficient for safe real/shared-calendar
deletion. Scheduling helpers produce invitation/update/reply/cancellation ICS
without transmitting it. Recurring scheduling and schedule tags are unsupported.
Sharing inspection and pure legacy CalendarServer request generation do not
create, update or revoke real shares. The historical extension requires observed
capabilities and owner checks; its current iCloud support is unverified.

### Read-only live diagnostic boundary

`live-diagnostic.ts` is a separately gated diagnostic, not part of `bun test` or
the demos. It can read the protected owner credential only when explicitly
invoked with the owner-confirmation flag, a selected protected config, an exact
origin allowlist and a finite date window. It does not reuse a Mail OAuth grant
as Calendar consent, change configuration or submit Calendar writes. It reports
counts instead of event content. Following explicit owner account selection, a
live invocation successfully discovered four calendars and zero resources for
2026-10-03 through 2026-10-10 UTC. This is an empty-window read receipt, not proof
of real event contents or mutations. The initial offline demos remain unchanged.

Diagnostic bounds are 31 days, 25 calendars, 1,000 resources, 2 MB per response
and 10 seconds per request. An unapproved Apple shard yields
`CALDAV_ORIGIN_APPROVAL_REQUIRED` with the exact origin for subsequent approval;
it does not automatically forward the credential.

After owner/account selection and diagnostic authorization, the command shape is:

```sh
bun playground/calendar/live-diagnostic.ts \
  --config /absolute/protected/config.toml \
  --confirm-owner-calendar-diagnostic \
  --start 2026-10-03T00:00:00Z --end 2026-10-04T00:00:00Z \
  --allow-origin https://caldav.icloud.com
```

The first allowed origin is the base; repeat `--allow-origin` only for exact,
explicitly approved discovered provider origins. Redirects are not followed and
wildcard provider trust is not inferred. This example is not an execution receipt
or authorization to decrypt the credential. Production Calendar enrollment and
grants remain absent.

### Dedicated live lifecycle readiness

`live-lifecycle.ts` adds a separately invoked runner for a fresh UUID test
calendar. It checks create success, an ownership marker and owner identity,
rejects observed foreign shares/grants, and operates only on its recorded
resources. The local readiness tests cover its private durable manifest and
stop-on-unknown behavior; missing optional sharing/ACL properties remain unknown
privacy evidence. This is distinct from the generic client's non-durable
readback helper. It is not a general-purpose collection-deletion safety guarantee.

A subsequent independent aggregate including these readiness tests passed
**49 tests / 341 assertions across 10 files**. The reviewer compared all 20
TypeScript/manifest source files against its snapshot and removed its owned
temporary copy/dependency link. Existing pinned dependencies were preserved.
These are code/fixture results; actual live execution is recorded separately in
the Calendar feasibility document.

### Actual live lifecycle outcome

Following owner account selection and reviewed dedicated-runner execution, the
real provider passed fresh-calendar create/rename/remove, personal UTC DAILY
series create/read/edit/delete, second-instance movement and third-instance
cancellation. Actual returned ICS passed semantic verification and expanded to
two active occurrences. Text fields, URL removal, categories and transparency
were exercised; alarms and attendees were absent. No live sync, stale-conflict
injection, timezone variation, invitation or sharing operation was performed.

The first attempt created an empty calendar and stopped on a bootstrap/shard
owner identity mismatch. Authenticated principal/home witnesses and exact-ledger
recovery confirmed ownership, removed that calendar and verified absence. A fresh
corrected run completed. Separate final read-only checks found both experiment targets
404 and four calendars, matching the original count, with no pre-existing
resource changes or notifications. Optional ACL/invite properties remained
unavailable; this is bounded dedicated-calendar evidence, not universal safe
collection deletion under concurrency.

Final independent aggregate: **54 tests / 370 assertions / 10 files** on Bun
1.4.2, with all 20 source/manifest files matching the tested copy and owned-copy
cleanup complete. Both unchanged demos passed the earlier 43/309 snapshot; they
were not rerun as part of the final aggregate. See the feasibility document for
precise live limits and recovery evidence.

### Extended live application cases

A later dedicated run passed six cases: DATE/all-day, floating, spring/fall DST
TZID, weekly BYDAY and monthly ordinal BYDAY. Each exercised personal resource
create/read/update/delete, timing/status/URL changes, past DISPLAY-alarm changes,
finite query/path-form multiget, stale PUT and DELETE 412 with unchanged readback,
and initial/create/update/tombstone sync. Provider timezone normalization was
accepted only through equivalent time/event semantics, not byte equality.

The provider ignored bounded SUMMARY text filtering: positive and guaranteed-
negative queries returned the same known resource. Local filtering over the
complete bounded snapshot passed one/zero matches. The runner reports
`providerTextFilterIgnored` separately from `localTextSearchVerified`;
`allCasesVerified` denotes these application checks, not server-side filtering.

Observed sync collection-self metadata, ETag-only resource rows and absolute-href
multiget 404s first caused guarded stops. Reviewed exact-ledger cleanup preceded
fresh runs; the final implementation recognizes exact collection metadata,
hydrates exact resource ETags and uses validated path-form multiget. No external
recipient or pre-existing resource was changed. Invitations/RSVP/sharing remain
local artifacts; live invalid-token/failure injection and general standards
coverage remain open. See the feasibility receipt for final remote cleanup.

Authoritative final independent aggregate: **64 tests / 452 assertions / 10 files**
on Bun 1.4.2. All 20 source/manifest files matched the tested snapshot; the owned
copy and dependency link were removed, existing pinned dependencies unchanged.
Earlier demo passes remain earlier receipts, not a new replay. No production
Calendar module, tool, OAuth scope, installation or deployment is added.

Final remote cleanup was checked separately by the same live operator: all four
extension-calendar targets were 404 and the original count of four calendars
was restored. Three recovery ledgers and the successful six-resource ledger had
no pending operation. Earlier core targets were already absent; no remote test
resources remain. Floating representation was preserved; spring/fall timezone
normalization was accepted through equivalent bounded occurrences. Live invalid
sync-token and transport-failure injection were not performed.

### Authorized invitation and RSVP

`live-collaboration.ts` provides explicit start/inspect/cleanup phases; it does
not automatically execute. One future no-alarm organizer invitation was submitted
exactly once and delivered to the authorized recipient's connected mailbox. The
provider's ORGANIZER rewrite was reconciled against the authenticated sender
address set using read-only requests. User-supplied exact-event screenshots show
recipient acceptance, and organizer readback shows PARTSTAT ACCEPTED. This is
actual delivery/recipient-action/sender-RSVP evidence. No Schedule-Tag was present;
strong ETags remained available.

A separate fresh calendar for sharing stopped at CS:invite 404 before POST. No
share notification or recipient permission change is claimed. The user then
requested cleanup of all experiments, so no further share submission is planned.
Final cleanup evidence is recorded separately.

Latest independent aggregate: **71 tests / 502 assertions / 11 test files** on
Bun 1.4.2, 22 source/manifest files matching the verification snapshot, owned
copy removed, no package installation. Earlier counts/demos are historical.

At the user's cleanup request, conditional invitation deletion returned204/GET404;
both its calendar and the separate empty unshared calendar returned204/PROPFIND404.
The same operator's separate final global inventory found four baseline calendars
and zero experiment-marker/title/path matches. All current-stage planned targets
were absent; ledgers were settled. No remote experiment resource remains. These
checks do not claim deletion of delivered mailbox messages or recipient-side
cancellation receipt. Sharing remains uncompleted because no share POST occurred.
