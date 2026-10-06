# Experiment register

> **2026-10-04 closeout:** Experiments are closed. See [Photos capability plan](photos-capability-plan.md) for the authoritative current evidence, accepted local provider architecture, comparison limits and implementation phases. Older checkpoints below are historical.

## Calendar production follow-up (2026-10-03 UTC)

Final disposition: the user accepted the registered production source module and
the disclosed recipient-verification limits. Controlled cleanup revoked the
exact test recipient, verified roster absence, deleted the shared test calendar
and confirmed absence. Fresh discovery returned four original calendars and zero
test markers; both the sharing and production-smoke ledgers are complete without
pending operations. Recipient-side disappearance/read-only enforcement was not
independently verified and is not claimed. No active remote experiment remains;
no deployment, resend or read-write share experiment occurred. Earlier stage
receipts below retain their chronology; [current coverage](calendar-production.md)
is authoritative for final status.

Production integration is accepted and in progress. The next bounded provider
question is whether a fresh private calendar with unavailable `CS:invite` can
support verified private sharing without interpreting missing data as an empty
roster. Success requires actual share submission, recipient access/read-only
denial and revocation/cleanup. No new live result is claimed here. See
[production coverage](calendar-production.md) for source and lifecycle gates.

The reviewed follow-up passed 21 targeted tests / 129 assertions. Its live
preflight stopped with `ENROLLED_CREDENTIAL_UNAVAILABLE` before discovery or any
network mutation: selected protected state and custody metadata did not match.
No invitation, manifest or new remote resource resulted. This was a credential-use
prerequisite failure, resolved by the later v2 loader; it was not evidence that
iCloud sharing failed.

After the independently checked v2 custody loader, a subsequent attempt submitted
one share POST and received provider acceptance. Strict readback stopped with
`UNVERIFIED_SHARE_ORGANIZER`; no replay occurred. The authorized recipient's inbox
contains the actual join invitation. Acceptance and read-only access are not yet
verified. A subsequent exact organizer-alias correction passed independent
17 tests / 115 assertions. Zero-network reconciliation confirmed recipientPresent,
read access and invite-noresponse and cleared the canonical ledger pending field.
The guard failure is resolved. The marked calendar/ledger remain retained for
recipient verification and controlled cleanup, not an unknown submission; no
all-artifacts-clean claim applies to this new stage.

The user later reported that the shared calendar was unavailable after an
acceptance attempt. Read-only diagnosis confirmed the exact marked calendar
exists (207), is empty and remains in the five-calendar inventory; the recipient
still has read/invite-noresponse metadata and the ledger pending field is null.
No revoke/delete occurred. Recipient acceptance/effective access is unverified;
the exact error, current link and authenticated recipient identity remain open
diagnostic inputs. No matching authenticated recipient browser session was
available for independent verification.

A subsequent dedicated empty-collection concurrency probe found that iCloud
accepts stale collection `If-Match`: rename changed E0 to E1, a stale-E0 rename
returned property status 200 and changed the name, and stale-E0 DELETE returned
204 followed by GET/PROPFIND 404. The probe is cleaned. Final inventory was five
calendars (four originals and the pending shared test). Event-resource stale
412 evidence is unaffected. Production collection semantics now explicitly report preflight-only concurrency;
no atomic rename/delete guarantee is supported.

The subsequent registered-source gate passed independent Calendar checks
(46 tests / 181 assertions). Final app243/1087 and tooling10/134 checks, both
typechecks, full build, native artifact/client ZIP inspection and disposable
install/update/uninstall/reinstall passed. These source/artifact results do not
close the production-path live smoke or recipient sharing/access/cleanup gates.
Exact coverage is recorded in [Calendar production](calendar-production.md).

The subsequent actual registered Calendar production path passed 16 real-iCloud
invocations and cleaned its own event/calendar. Exact inventory remained five
(four originals plus the separate pending shared test); no notifications were
generated. Creation, recurring series/instance changes, query, availability,
read/sync, deletion sync and preflight-only collection rename/delete passed.
This used isolated synthetic owner/account state with real protected provider
credentials, not installed OAuth. Recipient sharing permissions and cleanup of
the remaining shared test remain open.

Record questions, observable acceptance and evidence before turning an experiment
into a product decision. Never record an unexecuted check as passing.

## Photos metadata preparation (2026-10-03)

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Question: can upstream-shaped asset/master metadata preserve scoped identity,
explicit renditions and bounded pagination in Bun? The
[acceptance and source notes](photos-feasibility.md) define the paired-page subset
and provider limitations; the [isolated package](../playground/photos/README.md)
contains executable synthetic fixtures and a loopback demo. This is independent
of the historical E/L-series counts below and does not establish live iCloud
access or a selected production provider.
Initial loopback result under Bun 1.4.2: **16 tests / 71 assertions passed**; the demo read three
synthetic assets in three requests, ending on an empty page. Streaming/cumulative
byte limits, timeout, redirect refusal and truncated reads are exercised locally.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Historical experiment register

| ID | Question | Acceptance / observation | Evidence and status |
| --- | --- | --- | --- |
| E01 | Is Bun available in the current shell? | The installed executable reports its version without installation or configuration changes. | Observed 2026-10-01: `bun --version` returned `1.4.2`. This does not validate the draft application. |
| E02 | Is this directory already a Git repository? | Inspect before initializing; preserve existing files and repositories. | Observed 2026-10-01: initial `git status --short --branch` reported no repository. Local `git init -b main` then succeeded. No commit or remote was created during that experiment. Subsequent repository initialization is recorded in project status. |
| E03 | What does documentation as source mean? | User agrees the source format and relationship to implementation. | Resolved by user: prose specs first; implementation follows the specs. Normal Bun compilation, no custom docs compiler. No experiment required. |
| E04 | Can Bun support the proposed MCP client/server flow? | After scope agreement, define a credential-free protocol handshake and tool-discovery check with explicit expected results. | Local runtime experiment assigned in the systematic round below; no client/provider verification claimed. |
| E05 | Which Tailscale connection route fits the initial Codex and ChatGPT clients? | Compare client reachability and exposure requirements before choosing Serve, Funnel or another route; any live exposure requires separate authorization. | Proposed only; no network or Tailscale check executed. |
| E06 | Which upstream behavior is safe to adapt? | Review selected upstream mail operations against agreed message targeting, read limits and tool correctness and agent/server responsibility boundaries before reuse. | Pinned three-reference source review completed; hazards and limits recorded in [research](research.md). No live mailbox verification. |
| E07 | Does iCloud support usable tags independently of folders and flags? | After authorization, test supported keyword advertisement, add/remove persistence and client visibility on a designated message; document unsupported behavior without relabeling folder moves as tags. | Proposed; not executed. |
| E08 | What do junk and not-junk operations actually do? | Establish supported special-folder operations and distinguish movement from spam classification/training; compare selected and unrelated messages and record destination semantics. | Proposed; not executed. |
| E09 | Which unsubscribe mechanisms can be offered precisely? | First use fixtures to classify mailto, one-click and ordinary links, malformed headers, redirects and absent mechanisms. Specify safe supported requests and observable outcomes before any live request; distinguish submission from confirmed removal. | Offline MIME/header sketch passed under Bun; no link visited or email sent. Supported execution contract remains unresolved; see [research](research.md). |
| E10 | How should trash/restore, archive and flags map to iCloud state? | Establish special-folder discovery, supported flag behavior and post-move identity; define restore behavior when the original folder is unknown without guessing. Verify reversible effects only on selected messages. | Proposed; not executed. |
| E11 | What does full versus summary reading return? | Agree content/summary representation, bounds, truncation and unread preservation; use fixtures to verify truthful output and stable actionable identities. | Proposed; not executed. |

The initial isolated credential-free playground ran six tests successfully (Bun 1.4.2);
see [research](research.md) for fixture limits and observed hazardous fallbacks.
Production feature tests, mailbox access, authentication interoperability and
Tailscale/Codex/ChatGPT connectivity were not exercised. Historical reports are
summarized in [project status](project.md); they were not rerun here.

Dots and other providers are deferred; no initial experiment or acceptance check
is required for them. No generic provider framework is proposed.

P0–P2 protocol experiments additionally observed PEEK/exact UID commands, move
fallbacks, UIDVALIDITY and folder/keyword metadata. These partially inform E07,
E08, E10 and E11, but do not fulfill their live provider acceptance criteria.

## Accepted setup flow: experiments still required

The [setup/authentication flow](setup-and-auth.md) is accepted intended behavior.
These experiments are proposed, not executed; the earlier IMAP/MIME playground
does not verify them.

| ID | Question | Observable acceptance | Status |
| --- | --- | --- | --- |
| E12 | Can private Tailscale enrollment and public OAuth login share the intended Passkey? | Demonstrate WebAuthn RP ID/origin alignment using the chosen addresses, including rejection of an invalid origin. | Unexecuted; origin design unresolved. |
| E13 | Do Codex and ChatGPT complete the chosen OAuth flow? | Verify client redirects, owner Passkey login, usable plugin tokens, revocation and rejected anonymous/invalid-token mailbox calls. | Unexecuted; compatibility not claimed. |
| E14 | Is first-owner bootstrap controlled and one-use? | Prove ownership before enrollment; demonstrate failure recovery and permanent bootstrap disablement after completion/restart. | Unexecuted; ownership mechanism unresolved. |
| E15 | Are stored mail credentials protected, recoverable and revocable? | Demonstrate server-only storage, no secret leakage, restart persistence and explicit rotation/revocation/recovery behavior. | Unexecuted; storage/key design unresolved. |
| E16 | Which Mac/Apple-container/Tailscale topology works? | Verify connectivity, private setup boundaries, persistence, restart and scoped shutdown for the selected topology. | Unexecuted; host/container placement unresolved. |

## Systematic local experiment round

Finite scope: complete or explicitly report limits for L1–L10 below. These local
experiments cannot satisfy live provider, browser, client or deployment acceptance.
An observed unsafe library result is a completed investigation with failed safety
expectations, not a product pass. Owners record actual commands and outcomes.

| ID | Goal | Expected observation / acceptance | Result / current status |
| --- | --- | --- | --- |
| L1 | MCP runtime under Bun | Actual SDK handshake, tool discovery and synthetic call with no production import or mailbox. | Completed actual SDK loopback handshake/discovery/tool checks; runtime worker reports 2 tests/19 assertions across L1 and process L10. |
| L2 | Message identity | Observe missing UID and changed UIDVALIDITY; a separate sketch rejects stale/mixed-mailbox targets before writes. | Completed locally: missing UID/rollover observed; sketch guard rejects stale/mixed-folder inputs. No production guard or live evidence. |
| L3 | Move failures | Capture COPY/STORE failure and lost-response behavior; identify partial or uncertain outcomes and no blind retry. A safe implementation must not delete after failed copy. | Completed with failed safety expectation: COPY rejection still triggers STORE/EXPUNGE; STORE rejection also expunges; dropped reply fails without retry. See research. |
| L4 | Folder/keyword/restore capabilities | Expose special-use and permanent flags; sketch explicit unknown/ambiguous folder and restore outcomes rather than guessed folders or training. | Completed local metadata/sketches: missing and ambiguous folders/unknown restore explicit; iCloud support unverified. |
| L5 | MIME bounds | Decode Unicode and multipart fixtures; distinguish full parse from explicitly bounded excerpt/omissions. | Completed local Unicode/attachment parsing and explicit excerpt sketch. Parser does not establish completeness or streaming bounds. |
| L6 | Unsubscribe discovery | Classify missing/malformed/duplicate headers and mechanisms; offline policy sketch rejects unsupported URLs and private-address redirects without making requests. | Completed header fixtures and fixed fake-resolver/redirect policy sketch. No complete network policy or request execution. |
| L7 | Passkey verification | Actual verifier accepts synthetic valid cryptographic fixtures and rejects wrong origin/RP/challenge; distinguish browser enrollment from verification. | Completed synthetic auth playground; see linked evidence below. |
| L8 | OAuth primitives | PKCE and signed-token verification accept valid synthetic data and reject wrong/expired inputs; no claim of full client interoperability. | Completed synthetic auth playground; see linked evidence below. |
| L9 | Bootstrap/storage | One-use ownership enrollment, restart persistence and protected synthetic secret storage/rotation; explicit recovery limits. | Completed local SQLite/encryption sketch: 4 tests/26 assertions; real identity/storage provisioning/recovery remain unresolved. |
| L10 | Lifecycle/container | Read-only runtime/topology evidence and local restart/shutdown feasibility; record unavailable container/live networking rather than install or activate them. | Process and container restart/persistence passed locally; direct container-IP HTTP worked, published localhost port failed. See outcome below. |

Goals precede dependent tests. The original M1–M4 mail goals predate their first
run; the table above groups those investigations into the shared L-series.

### Recorded outcomes for this round

- **Mail L2–L6:** `cd playground && bun run test`: 15 tests/67 assertions passed after review strengthened two checks
  on Bun 1.4.2. This includes prior baseline coverage. Unsafe fallback assertions
  reproduce failed safety expectations, not safe mailbox behavior. See
  [research](research.md) and [mail goals](../playground/extended-goals.md).
- **Auth L7–L8:** worker reports `bun test playground/auth`: 30 tests/49 assertions passed on
  Bun 1.4.2. Actual SimpleWebAuthn synthetic cryptographic verification and jose
  token checks are combined with clearly identified grant/PKCE models. An actual ephemeral loopback HTTP authorization redirect/token/resource roundtrip
  was also tested with a fake client. No real browser enrollment or Codex/ChatGPT
  OAuth connection was tested. See
  [auth goals and results](../playground/auth/README.md).

Remaining deployment/provider E-series criteria do not become verified merely
because their related local L-series investigation completed.

- **Setup L9:** worker reports `bun test playground/setup`: 4 tests/26 assertions
  passed. Separate processes raced one-use SQLite enrollment; synthetic credentials
  were encrypted, recovered after restart, rotated and locally revoked. Passkeys,
  real provider validation, production key provisioning and recovery are excluded.
  See [setup evidence and limits](../playground/setup/README.md).
- **Runtime L1/process L10:** worker reports 2 tests/19 assertions using actual MCP
  SDK loopback transport and a dummy process restart/persistence fixture. No cloud
  client or provider interoperability is implied. The corrected Apple-container fixture passed direct-IP HTTP and stop/start
  persistence; localhost port publication still reset. Bun-container compatibility
  remains unverified. See [runtime goals](../playground/runtime/README.md).

- **Container portion of L10 — partial success:** worker used only the running
  Apple container service and cached Alpine image. After correcting the temporary
  `nc` responder to consume request headers, HTTP returned counter `1` inside the
  container via loopback/container IP and from the host via the direct container
  IP. Stop/start preserved the bind-mounted counter and inside HTTP returned `2`.
  The host's published `127.0.0.1` port still reset connections (Errno54), despite
  the expected inspected mapping; the underlying cause remains unresolved.
  Alpine had no Bun, so no Bun-image/MCP container test occurred. Owned containers
  and temporary mounts were removed and final inventory was zero. No daemon,
  host-network or Tailscale changes were made. See
  [runtime evidence](../playground/runtime/README.md).

The finite local round L1–L10 has recorded outcomes, including unsafe behavior
and the unresolved localhost publication expectation. Live iCloud capabilities, real Passkey browser
setup, ChatGPT/Codex account linking, Tailscale/public routing and deployment
lifecycle are **not completed** by this round. Their E-series criteria remain open.

Independent review reran `bun test ./playground` after the mail assertion fixes:
**51 tests passed, 161 assertions, nine files** (mail 15, auth 30, setup 4,
runtime 2). This count covers executable local suites, not the failed manual
container experiment or any live acceptance requirement.

## Requirements derived from this evidence

| Evidence | Authoritative requirements | Acceptance still required |
| --- | --- | --- |
| L2–L6 and pinned sources | [M01–M11 mailbox contracts](mailbox-tools.md#required-behavior-derived-from-evidence) | Eventual implementation failure/concurrency checks and authorized live provider behavior. |
| L1/L7–L9 | [A01–A07 setup/auth contracts](setup-and-auth.md#required-authentication-and-storage-outcomes) | Real browser/client enrollment, production sessions/tokens/revocation, key management and recovery. |
| L1/L9/L10 | [D01–D07 lifecycle contracts](deployment-lifecycle.md#required-observable-outcomes) | Actual build, deployment routes, keys/state, host lifecycle and scoped uninstall. |

[Engineering knowledge](knowledge.md) distills observations and implications.
Requirements are intended outcomes; these links do not promote sketches or
candidate libraries to a selected implementation. Local outcomes above remain
unchanged; no tests were rerun for this documentation conversion.

## Follow-up resolution work

Reference architecture and standards research now inform
[concrete contract defaults and routing recommendations](architecture.md).
These close unspecified internal formats without claiming live provider support.
The local setup follow-up reports **5 tests/37 assertions**, adding fail-closed
missing-state/marker behavior, authenticated same-owner recovery and one-use proof
replay checks. See [setup evidence](../playground/setup/README.md). The earlier
51-test aggregate is historical; it does not include this follow-up or subsequent
auth-provider/runtime follow-ups. No aggregate rerun is claimed here.

Auth-provider follow-up: [isolated candidate evidence](../playground/auth-provider/README.md)
reports **1 test/15 assertions** for Better Auth 1.7.7 on Bun 1.4.2: real migrations,
HTTP discovery, native public-client registration, anonymous login redirect and
invalid-grant rejection. Successful owner/code/refresh/client integration remains
unverified. This narrows framework feasibility without selecting it.

Runtime follow-up completed: [final evidence](../playground/runtime/README.md)
records successful host-loopback proxy → direct container IP, restart/IP
rediscovery, and verified official Linux Bun1.4.2 dummy HTTP/persistence/shutdown
inside disposable Alpine. Required runtime packages were installed only inside
the owned disposable container. Native published-port forwarding still failed
with backend no-route evidence; its permission-related cause is unconfirmed.
All owned containers/proxy/binary/state were removed, inventory zero. No MCP/auth
application-in-container or Tailscale route verification is claimed. Runtime Bun
suite remains 2 tests/19 assertions; these manual follow-ups are separate evidence.

Independent review reran the current setup and auth-provider suites together:
**6 tests/52 assertions passed** (setup5/37, provider1/15). No new aggregate run
or manual runtime replay by the reviewer is claimed.

## Calendar sequential exploration (2026-10-03 UTC)

Accepted order: calendar connection/read/recurrence, search/free-time/summary,
then personal test-event create/update/delete. All three were exercised against
synthetic loopback fixtures; live iCloud acceptance remains open for all three.
The application fixture uses JSON discovery/query responses and is not an
independent CalDAV server. See [Calendar findings](calendar-feasibility.md#sequential-application-experiment-2026-10-03-utc)
and the [runnable playground](../playground/calendar/README.md).

| ID | Question | Observable acceptance | Evidence and status |
| --- | --- | --- | --- |
| C1 | Can bounded calendar reads preserve useful event identity and recurrence? | Read calendar/resource metadata and actual ICS; distinguish UID/href/ETag and original instance identity; honor EXDATE and moved overrides. | Fixture passes, including an original October 5 instance moved into the October 2 window. Real calendar discovery, ACLs, authentication and timezone coverage remain unverified. |
| C2 | Can searches and summaries support truthful free-time results? | Finite half-open overlap and text filtering; merge/clip busy intervals; transparent/cancelled events do not occupy time; refuse availability when result completeness or coverage is insufficient. | Fixture passes for UTC and explicit all-day UTC policy. Demo returns five occurrences, two planning matches, 120 busy minutes and 120 free minutes in its four-hour window. Unsupported semantics and budgets return explicit issues. Provider-side search and complete remote snapshots remain unverified. |
| C3 | Can personal-event mutations preserve identity and reject conflicts? | Conditional create/update/delete, readback, unchanged content after stale writes, final GET 404, no blind retry; reject scheduling and recurring writes. | Fixture lifecycle passes with UID/unknown-property/alarm preservation and delayed-body concurrency checks. No real event or invitation was changed; lost-response reconciliation and independent provider behavior remain open. |

Implementation and independent review each verified **19 tests / 138 assertions
passed** on Bun 1.4.2 and a successful sequential demo, on 2026-10-03 UTC.
Review confirmed the verification copy matched current source;
no blocking findings remain within this bounded fixture scope.
Normal commands with dependencies present are `bun test` and `bun run demo` from
`playground/calendar`. This run used a temporary copy and existing pinned
dependencies because this checkout had no dependency directory; it installed
nothing. These counts include the earlier ten calendar parser/transport tests,
not a repository-wide rerun. Calendar production integration, release, installation
and live account testing are outside this completed fixture slice.

## Expanded Calendar operation contracts (2026-10-03 UTC)

The accepted request now includes all Calendar operation families. The
[full coverage matrix](calendar-acceptance-matrix.md) distinguishes narrower
fixture checks from still-open live and semantic acceptance. New modules remain
isolated; no production Calendar capability is installed.

| ID | Question | Observed local evidence | Remaining gate |
| --- | --- | --- | --- |
| C4 | Can actual CalDAV transport discover/read/mutate and preserve sync state? | XML principal/home discovery, query/multiget, strong ETag CRUD, namespace/propstat handling and atomic snapshot/token replacement. | Real provider filters, privileges, paginated sync and independent interoperability. |
| C5 | Can full personal fields and recurrence be edited without losing identity? | Fields, DISPLAY alarms, simple daily/weekly/monthly and selected BYDAY rules, detached edits/cancellations, original IDs and unknown data. | General recurrence, RANGE and migration of exception identities after base-pattern changes. |
| C6 | Can timezone distinctions survive edits and queries? | Embedded VTIMEZONE DST, explicit DATE/floating policy, unknown zone and gap/fold rejection. | General timezone coverage, timezone DURATION and real provider round-trip. |
| C7 | Can owned test calendars be managed? | Create, rename/property-status/readback and owned empty collection delete/absence. | Live deletion is unsafe against concurrent writes because empty-check and DELETE are separate. |
| C8 | Can scheduling and sharing contracts be represented accurately? | Pure REQUEST/update/REPLY/CANCEL serialization, all three RSVP responses; capability inspection and legacy CalendarServer share request generation. | Actual notifications/recipient state, schedule tags, recurring scheduling and current iCloud sharing support. |
| C9 | Can uncertain writes and stale sync tokens recover without blind retries? | Single readback reconciles exact desired bytes or deletion absence; unknown remains explicit; invalid-token refresh and partial-sync preservation. | Durable operation identity/journal, semantic normalized comparison and live failure behavior. |

The separately gated `live-diagnostic.ts` is read-only and reports counts. After
explicit owner account selection, it authenticated and discovered four calendars;
the finite 2026-10-03 through 2026-10-10 UTC query returned zero resources. Home
OPTIONS advertised scheduling/sharing/access-control and calendar privileges
included read/write. These are discovery/advertisement observations, not event
content, mutation, delivery or sharing acceptance. Existing Mail enrollment does
not imply Calendar consent; isolated lifecycle and scheduling counterpart gates
remain. See the playground README for commands and limits.

Independent final verification: **43 tests / 309 assertions across 9 files**,
Bun 1.4.2; sequential and composed demos both exited successfully. The composed
demo made 27 loopback requests, sent zero external messages and explicitly
reported no live iCloud verification. A first integration comparison failed on
XML-normalized line endings; the corrected comparison and final aggregate passed.
Existing pinned dependencies were reused in an owned temporary copy without
installation. This is the Calendar playground aggregate, not a repository-wide
or deployed-product test result.

The subsequent dedicated live-lifecycle readiness suite expands the independent
aggregate to **49 tests / 341 assertions across 10 files**, with final source-copy
equality and owned-copy cleanup verified. It adds a private operation manifest
and fresh-calendar identity checks; this is local readiness evidence only.

The later authorized live run verified dedicated calendar create/rename/remove
and one personal UTC DAILY-series create/read/update/delete, one moved instance
and one cancelled instance. Actual provider readback matched semantics and
expanded to two active occurrences. The initial empty-calendar owner-origin
guard stop was reconciled with authenticated principal/home witnesses and exact-
ledger cleanup before a fresh successful run. Separate final read-only checks found
both experiment targets absent and the original four-calendar count unchanged.
No invitations, shares or pre-existing resources were changed; live timezone,
alarms, sync and stale-conflict cases remain unverified. Final independent local
aggregate is **54 tests / 370 assertions / 10 files**; source equality/cleanup
verified. The unchanged demos retain their prior pass, not a new final replay.

The final live extension passed six application cases (DATE, floating, spring/fall
DST TZID, weekly BYDAY, monthly ordinal BYDAY), personal create/read/update/delete,
timing/status/URL/DISPLAY-alarm changes, stale PUT/DELETE 412 with unchanged data,
finite queries/path-form multiget and initial/create/update/delete sync. Provider
SUMMARY filtering was observed ignored; local complete-snapshot filtering passed
matching/nonmatching checks. Equivalent timezone-normalized readback is semantic
evidence, not byte preservation. Guarded sync-shape and href incompatibilities
were reconciled with exact-resource cleanup before fresh successful runs.

Authoritative independent final aggregate: **64 tests / 452 assertions / 10 files**,
Bun 1.4.2, with 20 source/manifest files matching the snapshot and owned-copy
cleanup complete. Existing dependencies and production installation are unchanged.
Live invitations/RSVP/sharing, invalid-token/transport failure injection and general
standards coverage remain open; production Calendar integration is not delivered.

The same operator's separate final read-only check confirmed all four extension
calendar targets 404 and the original four-calendar count; all created test
resources were removed and ledgers settled. A planned never-created resource
was confirmed absent rather than called deleted. Earlier core targets were
already absent. No remote experiment resource remains.

The authorized counterpart stage subsequently submitted one invitation, verified
its delivery in the exact recipient's mailbox and reconciled the provider's
ORGANIZER address-set alias without resending. User screenshots of the exact
invitation show Accepted; organizer readback independently supplies the sender
PARTSTAT ACCEPTED evidence. A separate sharing calendar stopped before POST on
CS:invite404, so sharing remains uncompleted. The user requested all-experiment
cleanup rather than further sharing attempts.

Latest independent source aggregate: **71 tests / 502 assertions / 11 test files**,
Bun 1.4.2; 22 source/manifest files matched the snapshot and owned verification
copy was removed. No installs or live actions occurred during that test run.

User-requested final cleanup verified invitation DELETE204/GET404 and both
dedicated calendar DELETE204/PROPFIND404. A separate final global read-only check
by the same operator found the original four calendars and no experiment-marker,
title or path matches. Ledgers were settled and all planned current-stage targets
absent, including the never-created first attempt. No remote experiment resources
remain; recipient mailbox history/cancellation receipt is not inferred removed.

## Native Keychain custody — 2026-10-05

Investigation paused and consolidated into [Keychain retained knowledge](keychain.md).
That document contains the original native/signing results, later protocol/query
fixtures, negative findings, limits and recovery references. Experimental programs
and duplicated reports were removed from checkout after preservation in Git. No
production credentials or installed runtime were migrated.
