# Single-account production readiness — 2026-10-04 UTC

Preparation outcome: source fixes are tested and ready for review. No release,
PR publication, merge, live install, restart, reconnect, grant change or provider
mutation was performed. Production rollout and further live acceptance require
separate approval. Scope is one accepted account using a custom MCP connection.

## Baseline and live evidence

The main project checkout was `c3d67dc` (older 0.1.23 source). The running Mac
installation selects `releases/0.1.26-darwin-arm64`, Bun 1.4.2. This local branch
`production/single-account-readiness` starts at diagnostic commit `b85c33f` from
the diagnosis checkout; PR14/0.1.24 was superseded. Preparation retains version
0.1.26: its disposable artifact must not overwrite the installed diagnostic
release. Assign a new version and rebuild only in the next approved release step.
All 204 compiled diagnostic artifact files matched the installed output during
read-only comparison. Final doctor checks still pass, with the selected release
and configuration hash unchanged.

Parent-reported custom MCP acceptance at 21:22–21:30 UTC: correct account profile,
9 mailboxes, inbox search/complete read, 4 calendars and bounded queries. Temporary
calendar/event CRUD read back the changed title and UTC time; event deletion
returned not_found and empty sync, calendar deletion had durable succeeded status.
The original four calendar names/hrefs/ETags remained unchanged, with no remnants.
These are live provider observations of installed 0.1.26, not this candidate.

Read-only audit at 21:56 UTC: all 13 doctor checks passed (installed runtime,
private custody, discovery, anonymous MCP 401, public private-route isolation and
private health). Both SQLite databases passed integrity_check. Config/state/
custody and databases were current-user-owned, nonsymlinked and 0600/0700 as
appropriate. The diagnostic enable marker was already expired; no files were
removed or retimed. Existing backups include pre-0.1.26; no stopped snapshot,
restore rehearsal or unattended service acceptance was performed.

## Concrete fixes

| Finding | Preparation change and verification |
|---|---|
| Credential validation can overwrite a concurrent revoke/replacement | Compare account generation and local mutation epoch after asynchronous validation; return 409 on change. Tests cover active and already-revoked accounts, newer replacement, missing generation support and unchanged newer credential. Temporary serialized credential buffers are zeroed on success/failure. |
| Mail batch preflight can outlive write permission | Recheck authorization synchronously at dispatch; forbidden stops remaining items. Tests preserve completed/unknown evidence while preventing later submissions. |
| Existing unsafe custody can be reopened | Startup rejects foreign ownership, group/other access, symlinks or wrong file types for dedicated state/custody directories, key, marker, databases and existing sidecars/bootstrap proof. It never chmods existing paths. Tests widen permissions or substitute symlinks and prove rejection without repair. |
| UTC query dates normalize to a different date | Roundtrip validation rejects impossible dates and 24:00 before REPORT. Query/availability regressions plus valid leap-day case pass. |
| Direct Nodemailer 7.0.13 has known advisories | Pin direct runtime and E2E dependency to 10.0.14; use its bundled SMTP string-array types. Frozen production assembly succeeds. Before scan reports 13 advisories; after scan returns an empty advisory object. Transitive Nodemailer 10.0.10/10.0.13 remain locked; the scan reports no known advisories for them. |
| Container packaging misses current build inputs / private default directories | Include Calendar workflow and font assets in allowlisted context/Containerfile; make state/custody 0700 for UID10001. Reviewed source only; no Linux image/release acceptance claimed. |
| Entry documentation describes outdated deployment/scope | README/current-status now point here; corrected inconsistent LaunchAgent label in deployment guidance. Historical evidence is retained. Dependency symlinks are ignored as build inputs. |

## Audit conclusions and limits

Authentication enforces owner, issuer/resource, expiry, PKCE, registered scope
ceilings and token account binding. Refresh/revoke/replay and account-isolation
checks have synthetic fixture coverage. Local provider-credential removal blocks
provider calls and further refresh while retaining OAuth grant records; Apple
app-password revocation and OAuth revocation remain distinct owner operations.
This connection's expiry/refresh is not live verified. Multiple accounts are
outside the production claim despite synthetic isolation tests.

Provider logs/debug are disabled. Operation telemetry emits fixed enums/counts;
reconnect diagnostics are disabled by default, owner-only, expire after 30 minutes,
retain at most 256 enum-only records and swallow I/O errors. The expired live
capture may be removed after separate authorization; no diagnostic content was
read or retained in this report.

Calendar inspect_sharing requires provider capability plus complete roster
evidence. unsupported means unknown; it must not be translated into private or
unshared. Missing-event HTTP 404 becomes CalendarError(not_found) and the MCP
error body includes error.code=not_found. No INVALID_ARGUMENT/error_code literal
exists in this application's source: the observed outer classification belongs
to client/connector translation. Its correction cannot be verified by local
fixtures; clients must retain the inner typed error and never treat it as a
retryable write failure.

Calendar mutations use account-bound durable operation IDs and never replay
unknown dispatches; read-only reconciliation does not resubmit writes. Concurrent
operation replay and sync commit rules have fixture coverage. Mail ambiguous
acknowledgements preserve unknown and stop the batch; outbound receipts/policy
rechecks have fixture coverage. Generic Mail flag/move batches do not supply
Calendar-style durable operation IDs; the client must inspect unknown results
before deciding another action. Live conflict rejection, ambiguous-write
recovery, recurrence/timezones, invitations, sharing and multi-account workflows
remain unverified and outside the accepted release claim.

## Checks and supporting evidence

On Bun 1.4.2/darwin-arm64, final `bun bin/checkpoint` passed application and tooling
typechecks, production build, 267 application tests/1608 assertions, 10 tooling
tests/134 assertions and 11 built HTTP/protocol E2E tests/253 assertions. Disposable
frozen production artifact assembly passed; installed artifact lifecycle test
passed 1 test / 26 assertions (explicit init, isolated startup/restart/shutdown and
preserved dummy custody). No real provider credentials were available to those
fixtures. Initial sandbox-denied listeners were rerun successfully with fixture
network access. `git diff --check` passed.

Task-local supporting files (outside this repository): `runtime-before.json`,
`runtime-doctor.log`, `runtime-doctor-final.log`, `runtime-after.json`,
`baseline-runtime-match.json`, `baseline-checkpoint.log`, `final-checkpoint.log`,
`dependency-audit.json`, `dependency-audit-after.json`, `artifact-build.log`,
`artifact-lifecycle.log`. `production-artifact/` is an isolated verification
artifact, not an approved distribution. Logs contain synthetic fixtures only.

Advisory evidence: the npm bulk advisory endpoint queried the locked production
dependencies. Examples returned for the former direct package:
[raw access bypass](https://github.com/advisories/GHSA-p6gq-j5cr-w38f),
[address-parser denial of service](https://github.com/advisories/GHSA-v53p-9fqp-m79j).
An empty scan is a point-in-time known-advisory result, not a guarantee of safety.

## Next approval

Approve review/integration and preparation of a newly versioned release first.
Publishing a PR/release, merge, live deployment/restart, diagnostic-file cleanup,
security/settings changes or new live provider writes each remain outside this
request. For deployment approval, present the reviewed exact commit/version and
artifact hashes, consistent stopped backup and compatible rollback plan; retain
all current accounts, grants, credentials and routes. Recheck live health and
accepted single-account reads after the approved rollout. Any expanded capability
claim needs its own scoped acceptance; do not reconnect merely to obtain it.
