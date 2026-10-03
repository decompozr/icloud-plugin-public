# Calendar preparation: offline findings and proposed boundary

Status: preparatory experiment only, after Mail in the roadmap. No Calendar production tools, live Apple authentication, grants, or configuration have been added. The candidate is CalDAV with iCalendar, using Bun. Apple discovery, shared-calendar ACLs and actual write behavior remain unverified.

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
