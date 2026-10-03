# Calendar production module acceptance

The owner accepted production readiness as a registered Calendar module on
2026-10-03. This document governs integration. Historical receipts remain in
[the exploration matrix](calendar-acceptance-matrix.md) and
[feasibility](calendar-feasibility.md). Experiment passes do not establish
production implementation or deployment.

## Composition and permissions

Calendar composes with Mail in the existing `ModuleRuntime`, MCP endpoint,
authentication host and owner credential custody. Calendar owns its module ID,
tool namespace, consent scopes and persisted operator policy. Existing Mail
policy and OAuth grants do not enable Calendar. Upgrades initialize Calendar
disabled; owner activation and client consent are separate requirements.

The service uses a discriminated command gateway, exact calendar/event identities
and typed inputs. Production code must not import playground code or depend on
external temporary dependency installations. Activation validates Calendar
access through shared credential custody without requiring another account.
Credential revocation must also prevent Calendar requests.

The initial worktree base predated the current multi-account application. The
task branch was safely fast-forwarded to `00415c6` with Calendar work restored.
Production integration must use verified owner plus account context, select only
that account's credential and bind operation journals/sync state to the account.
Cross-account identities and operation IDs must not expose or mutate another
account. Shared custody means the existing account-aware store, not a legacy
owner-wide credential lookup.

The registered Calendar source passed independent acceptance: **46 Calendar tests
/ 181 assertions**. Final frozen-source verification passed **243 application
tests / 1,087 assertions in 34 files**, **10 tooling tests / 134 assertions in six
files**, both typechecks and the full application build. Registered account-bound
MCP integration and actual OAuth integration verify that enabling Calendar does
not widen existing Mail refresh grants and that new Calendar-only consent binds
the account without Mail scope.

The user accepted the production-ready registered source-module goal with the
explicit verification limits below. Source/build gates and the production
provider-path smoke pass; final controlled sharing revocation and cleanup are
verified. No active test calendar remains. Read-only enforcement and a read-write
share change were not live-verified and were accepted as limitations by the user.
Nothing was deployed or activated in the installed service.

## Sharing investigation chronology (completed)

The following preserves intermediate states; final disposition is the cleanup
receipt below.

The sharing follow-up worker reported **76 playground tests / 527 assertions in
11 files** after a four-file patch. Independent targeted review passed **21 tests
/ 129 assertions** against exact source copies. One read-only sharing invitation
to the authorized counterpart was approved for the sole live operator. The
live preflight then stopped with `ENROLLED_CREDENTIAL_UNAVAILABLE` before
discovery or network mutation because protected custody metadata did not match
the selected state. No manifest or new remote artifact was created and no
invitation was sent. Recipient acceptance/access was unverified at that stage. These were
playground checks, not production interoperability acceptance.

A read-only v2 custody loader then passed independent **5 tests / 36 assertions**.
A new live sharing attempt submitted exactly one POST. Provider submission was
accepted, then strict readback stopped with `UNVERIFIED_SHARE_ORGANIZER`. No retry
occurred. The root verified the actual join invitation in the authorized
recipient's inbox. The exact organizer-alias correction then passed independent
**17 tests / 115 assertions**. Reconciliation of already-observed evidence made
zero network requests and confirmed `recipientPresent=true`, read access and
`invite-noresponse`; the canonical ledger then had `pending=null`. The strict
organizer guard is resolved, not a current blocker. One marked shared calendar
and its recovery ledger were then retained solely for recipient acceptance/access
verification and subsequent revocation/cleanup. Those gates were outstanding at that stage.
The earlier failed preflight remains a separate result.

The user subsequently reported seeing the sharing invitation but finding the
calendar unavailable after attempting acceptance. A subsequent read-only diagnostic
confirmed the exact marked shared calendar still exists (207), retains its
expected title/owner/marker, was empty, and remained in the five-calendar inventory.
Recipient metadata then reported read access with `invite-noresponse`, and the
ledger remained `pending=null`. No revocation or deletion occurred. The reported
acceptance attempt is not a server-verified acceptance or proof of recipient
access. The exact error, signed-in recipient identity and confirmation that the
current sharing link was used (rather than the earlier cleaned event invitation)
were requested to distinguish the failure.

Browser inspection found no authenticated session for the intended recipient;
the task-created tab was closed without accepting or mutating calendar data.
That check provided no independent browser-based effective-access proof.

The user's latest follow-up reports the shared calendar is now visible and
working. This supersedes the earlier user-reported unavailability, but does not
by itself establish server acceptance or read-only enforcement. The user then
explicitly instructed, "It's fine. Accept it as done." This accepts the remaining
recipient-side verification limits for the source-module goal. It is not evidence
of actual read-only enforcement, write denial or a read-write permission-change
test. No further sharing-permission experiments are required. Controlled
revocation and deletion subsequently completed as recorded below.

## Final acceptance and cleanup

The reviewed cleanup runner revoked the exact test recipient and verified that
recipient absent from the sharing roster, then deleted the dedicated test
calendar and confirmed absence using the runner's 404/410 check. The canonical
ledger is complete with `pending=null` and `senderArtifactsAbsent=true`. A fresh
discovery found exactly **four original calendars** and **zero test markers**.
The separately completed production smoke also has `pending=null`, all 16
invocations complete and its artifacts absent. No new calendar, resend or
read-write permission experiment was performed during cleanup. The exact success
status for the mutation requests was not emitted and is not inferred here.

Recipient-side disappearance and effective read-only/write-denial behavior were
not independently verified. The user accepted those disclosed limits; they are
not recorded as passing tests. The accepted source-module goal and remote
experiment cleanup are complete. Deployment, publishing, installed activation
and a commit are not implied.

Final packaging assembled the native 0.1.20 artifact and tar from the frozen
source. Checks verified compiled registration beside Mail, Calendar disabled by
default, independent scope visibility, the exact current Calendar skill and a
seven-entry client ZIP. The installed-template ZIP check passed **1 test / 8
assertions**. Disposable install/update/uninstall/reinstall preserved dummy
private Mail/Calendar state, custody and policy. Distribution excludes playground
and test modules. Owned artifact copies, temporary logs and the tooling dependency
symlink were removed; app dependencies and WIP were preserved. No real service or
client installation occurred.

## Registered production-path live smoke

The actual registered Calendar module completed **16 registered invocations**
against real iCloud and reported `completed-clean`. It used an isolated synthetic
owner/account fixture with the existing protected provider credential; this
verifies the production registration/service/gateway path, not installed OAuth
or a deployed client connection.

Verified operations were calendar creation; recurring event creation; finite text
query; whole-series and occurrence changes; availability returning three busy
intervals; initial synchronization and event read; event deletion and deletion
sync; collection rename with explicit `preflight-only` concurrency; and an empty
recheck followed by calendar deletion. The final exact calendar inventory matched
the baseline: **five calendars**, consisting of four originals and the separately
retained pending sharing experiment. The smoke created zero notifications and
removed its own calendar/event. No installed policy, grant or service was changed.

This closes the bounded production-path smoke, not every protocol/provider form.
Recipient sharing acceptance, read-only access/write-denial and access changes
remain disclosed unverified limits accepted by the user. Later cleanup verified
revocation and removal of the separately retained shared calendar.

## Live collection concurrency finding

A dedicated empty collection probe established that iCloud does **not** enforce
collection `If-Match` as event-resource concurrency protection. A valid rename
changed collection ETag E0 to E1; another rename using stale E0 returned property
status 200 and actually changed the name. DELETE with stale E0 then returned 204
and subsequent GET/PROPFIND returned 404. The probe was cleaned; inventory was
five calendars: four originals plus the pending shared test calendar.

Production collection rename/delete therefore must declare non-atomic semantics.
Neither a supplied ETag nor an empty preflight may promise protection from a
concurrent collection change. Previously observed event-resource stale PUT/DELETE
412 results remain valid and are a distinct protocol boundary. The reviewed production
interface now reports collection concurrency as `preflight-only` and makes the
destructive confirmation cover concurrent contents.

## Required operation coverage

All rows are included. Unsupported protocol forms must be explicit; omission
from a test suite does not defer an accepted operation.

| ID | Observable acceptance | Production status |
| --- | --- | --- |
| C01 | Discover authenticated principal/home/calendars and privileges; validate iCloud targets; never forward credentials through unchecked redirects. | Implemented/source-reviewed; registered production-path live discovery passed. |
| C02 | Read exact UID/ETag/scheduling revision; finite search filters a complete provider snapshot; report incomplete/unsupported results. Availability requires a complete unfiltered window. | Implemented and source-reviewed; bounded local filtering avoids ignored provider text filters. |
| C03 | Create/edit/delete personal events with typed text/time/status/transparency/category/URL/DISPLAY-alarm fields; preserve identity and untouched fields; stale writes leave content unchanged. | Implemented/source-reviewed; registered production-path live create/update/delete passed. |
| C04 | Edit/cancel series and individual occurrences; retain original recurrence identity and unaffected siblings; reject unsupported recurrence forms explicitly. | Implemented bounded subset; registered production-path recurring series/occurrence edits passed; other prior cases remain separate. |
| C05 | Preserve DATE/floating/UTC/TZID distinctions, exclusive all-day end and explicit DST ambiguity/unresolved-zone outcomes. | Implemented explicit policies and source-reviewed; no general timezone conformance claim. |
| C06 | Create/rename calendars; delete only explicitly selected calendars under declared destructive semantics. Empty preflight is not atomic protection against concurrent creation. | Implemented/reviewed with explicit preflight-only semantics and destructive confirmation; live stale collection conditions were ignored. |
| C07 | Invite/update/cancel/respond accepted/tentative/declined with exact identity and concurrency checks. Generic edits/deletes detect scheduling side effects and require scheduling permission. Separate stored/submitted/delivered/accepted states. | Implemented/source-reviewed; prior actual invite/acceptance evidence. Other response paths not live-accepted. |
| C08 | Inspect/add/change/remove private shares; verify recipient access/read-only denial, revoke and clean tests. Unavailable roster data must not silently mean empty. | One share POST and delivery verified; organizer guard resolved by reviewed exact-alias reconciliation. Recipient previously present with read/invite-noresponse; user accepted unverified effective access/change limits. Final revoke/roster absence/calendar absence and four-original inventory verified. |
| C09 | Persist complete sync state; advance token atomically after validated changes/deletions and ETag-matched hydration. Failure retains state; invalid token resynchronizes. | Implemented durable account-bound sync; registered live initial/deletion sync passed; failure/CAS fixtures remain separate. |
| C10 | Journal operation identity before submission; repeated IDs do not duplicate writes; changed-input ID reuse rejected; restart retains unknown outcomes and bounded reconciliation. | Implemented encrypted account-bound journal; restart, concurrency, no-replay and cross-account tests pass. |
| C11 | Register accurate tools/schemas/annotations/consent; missing scopes step up without provider calls. Mail-only, Calendar-only and combined capability configurations are independent. | Registered account-bound MCP and real OAuth integration pass; independent source gate passed. |
| C12 | Separate persistent enablement; recheck policy before submission; observe revocation; drain work accurately; diagnostics exclude private content/addresses/credentials/tokens. | Implemented and source-reviewed; disabled-default, current-policy/credential checks and lifecycle fixtures pass. |

Permissions are `calendar.read`, `calendar.write`, `calendar.schedule` and
`calendar.share`. Scheduling/sharing require read/write plus their permission.
Raw ICS and attendee-bearing resource edits must not bypass scheduling controls.

## Accepted verification limits

The source gate and bounded live smoke do not mark every C-row fully live-tested.
The remaining dispositions are explicit. The user accepted C08's unverified
recipient permissions and access-change limits; owned-resource revocation and
cleanup subsequently passed, completing the accepted scope.
The other unexecuted live permutations below are evidence limits covered by
bounded source/fixture acceptance, not newly introduced requirements to repeat
every permutation against a real account. Deployment remains outside this goal.

- **C03–C05:** the production-path smoke covers a recurring event and series/
  occurrence changes. Broader field, alarm, DATE/floating/DST and weekly/monthly
  cases have prior playground live evidence plus source fixtures, not a repeated
  production-path live matrix. Unsupported forms remain declared limitations.
- **C07:** one earlier invitation delivered and was accepted. Live tentative and
  declined responses, organizer rescheduling, scheduling concurrency and
  recipient-visible cancellation remain unverified; implemented source paths
  and fixture acceptance do not replace those observations.
- **C08:** delivery and the prior owner-side read-share metadata were verified.
  Server-verified recipient acceptance, actual read-only access/write denial and
  access changes remain unverified and were accepted by the user. Final recipient
  removal and calendar absence are verified; no outstanding remote test resource
  remains.
- **C09–C10:** initial/deletion sync passed through the registered live module.
  Invalid-token recovery, concurrent snapshot completion and uncertain-write
  restart/no-replay have fixture evidence; no live fault was injected to establish
  those failure paths against iCloud.
- **C11–C12:** account-bound protocol/OAuth, policy, credential and lifecycle tests
  pass. The smoke uses synthetic local owner/account state with real provider
  access. Installed OAuth/client activation and deployed service behavior were
  not exercised and no deployment is claimed.

## Lifecycle coverage

| Stage | Acceptance | Status |
| --- | --- | --- |
| Dev | Declared dependencies, reproducible tests/typecheck, provider/service failure fixtures and Mail regression. | Final source suites and both typechecks pass. |
| Build | Built server registers Calendar; browser/types succeed; no playground imports; packaged plugin includes Calendar instructions. | Final application/browser/types, compiled registration and packaged instructions pass. |
| Release | Local immutable artifact closes dependencies/assets, excludes secrets and experiment ledgers, records tested source. | Final native artifact/tar assembled and inspected; not published. |
| Install | Isolated owned installation starts built registration/protected endpoints without implicit provider writes. | Disposable built-artifact installation verified; real installation not performed. |
| Update | Preserve Mail state/grants/policy; Calendar initially disabled; journal/sync survive restart; failure never resets ownership or expands access. | Final disposable artifact lifecycle preserves dummy state/custody/policy; actual service not updated. |
| Uninstall | Scoped local removal retains declared private state and never deletes remote calendars/events. | Disposable artifact uninstall/reinstall preserves state; no production uninstall performed. |

## Verification and cleanup

Source tests, built-runtime checks and live receipts remain distinct. Unobserved
recipient-side behavior is an explicitly user-accepted verification limit, not a
passing test. Final review reconciled every C-row and lifecycle stage against the
accepted source-module goal. Remote experiment cleanup is complete.

Use fresh marked calendars for authorized live experiments, record owned
identities before mutation, reconcile uncertain writes without replay and remove
all experiment resources after useful recipient observations. Prior experiments
were cleaned and the owner's inventory restored to four calendars; that receipt
is not a future cleanup guarantee. Source readiness does not imply deployment,
publication or deleting unrelated remote data.

## Release candidate 0.1.21

The accepted Calendar module is prepared for release 0.1.21 on the current
Mail account-bound runtime. This version includes the optional Calendar module
and client guidance while preserving disabled-by-default permissions. Publication
and local production upgrade require their own release and installation receipts;
the source and earlier isolated artifact checks do not claim those outcomes.
