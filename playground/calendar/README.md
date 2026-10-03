# Calendar offline protocol spike

Goal: determine whether Bun can parse CalDAV multi-status XML and preserve iCalendar identity, all-day boundaries and recurrence, before choosing a production adapter. No Apple credentials, external requests or production integration.

Expected: actual parser libraries parse synthetic XML and ICS; conditional resource writes reject stale ETags and duplicate creates; recurrence expansion is bounded; invitation-bearing objects fail closed for the proposed personal-event write subset. A fixture is not an iCloud interoperability test.

Run: `cd playground/calendar && bun install && bun test`.

Initial outcome (superseded by follow-up below): 6 tests / 23 assertions passed under Bun 1.4.2. Actual ICAL.js 2.2.1 and fast-xml-parser 5.11.1 APIs run successfully. The XML fixture uses a fixed prefix (not a production namespace resolver). The ETag fixture is handwritten and makes no socket requests. Invitation blocking is proposed application policy, not provider verification. Missing IANA timezone registration is observed; DST/VTIMEZONE conversion and detached recurring overrides remain untested. See ../../docs/calendar-feasibility.md for the bounded contract and next gates.

Next experiment goal: use an actual loopback HTTP server and client for PROPFIND/REPORT/conditional PUT/DELETE; reject oversized/malformed XML, resolve DAV namespace independently of prefix and retain per-resource failures. Exercise synthetic VTIMEZONE DST and recurrence overrides using the real iCalendar library. This remains a controlled fixture, not an independent CalDAV implementation.

Follow-up outcome: 10 tests / 55 assertions pass. `http.test.ts` now uses real Bun loopback HTTP requests with a 2-second timeout, manual redirects, streamed 4 KB response cap, XML validity/DTD checks, DAV root-prefix resolution and retained 200/404 resource results. Nested namespace declarations are intentionally rejected (including malicious rebinding); valid nested declarations still require a general namespace-stack implementation. Conditional PUT/DELETE conflicts preserve prior content with no retry. Href containment is tested separately before requests; no credentials are attached in this fixture.

`timezone.test.ts` registers a bundled synthetic Eastern VTIMEZONE only for each test, checks spring/fall 09:00 recurrences against expected UTC times, and checks a RECURRENCE-ID moved instance plus EXDATE and unknown-property roundtrip. Timezone registration is removed afterward; HTTP server closes in finally. This establishes the candidate API on those fixtures, not general DST ambiguity handling or independent CalDAV interoperability.

Current verification: rerun on 2026-10-02 against installed release 0.1.16 context: **10 tests / 55 assertions passed**. Calendar is not part of that production release. REPORT responses are canned; they do not prove search filtering. See the acceptance matrix in `../../docs/calendar-feasibility.md` for implemented-versus-experimental distinctions.
