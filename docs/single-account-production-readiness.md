# Single-account production readiness — 2026-10-04 UTC

Outcome: local preparation and independent final review are complete. No remaining
blocking regression or demonstrated unauthenticated remote exploit was found in
the reviewed scope. Conditional medium-severity issues are fixed in source; the
running diagnostic 0.1.26 remains affected until an approved rollout. No release,
PR, merge, deployment, restart, reconnect, manual grant/revocation change or user
content mutation occurred. Ordinary client refresh rotation was observed during
read-only checks. Scope is one accepted account through a custom MCP connection.

## Baseline and release identity

The original main checkout was `c3d67dc` (0.1.23). Preparation branch
`production/single-account-readiness` starts at diagnostic source `b85c33f`; PR 14
and 0.1.24 were superseded by diagnostics. Initial preparation commit was
`28b05e7f731ce5601fef12aa1c2a980a5ce7a6b1`; independent review revealed one remaining
Mail credential-removal gap and an inconsistent service-template label. Those
necessary corrections are included in the final follow-up commit supplied with
this report.

Installed selection remains `releases/0.1.26-darwin-arm64`, Bun 1.4.2. All 204
compiled diagnostic artifact files matched installed output. The selected release
and configuration hash were unchanged after preparation. Source and disposable
artifacts retain baseline version 0.1.26 solely for verification; choose a new
version and rebuild before any approved distribution or install.

## Substantiated security findings

1. **Medium — stale credential replacement, fixed.** Installed 0.1.26
   `admin/handler.ts` awaited provider validation then unconditionally stored the
   replacement. Overlapping owner revocation or a faster replacement could be
   overwritten, restoring/replacing credentials contrary to the later operation.
   Requires authenticated owner access to the private admin origin and concurrent
   credential operations; anonymous MCP callers cannot invoke it. The fix captures
   account generation plus handler mutation epoch, compares owner/generation/epoch
   after validation and returns 409 on change before synchronous storage. Tests
   cover active/already-revoked accounts, newer replacement and absent generation
   API. Serialized credential buffers are cleared on storage success/failure.
   This protects one handler/process; it is not a cross-process transactional CAS.

2. **Medium — Mail permission changes after admission, fixed.** Installed 0.1.26
   `mail/services/mail.ts` checked authorization before asynchronous session and
   metadata preflight. An admitted writer could still submit after owner policy
   disablement. `perform()` now rechecks synchronously immediately before mutation;
   forbidden stops later batch items. Tests show zero first writes, preserved
   confirmed completion and preserved unknown outcomes. Prerequisites are an
   already-authorized Mail writer plus concurrent owner policy disablement.

3. **Medium — credential removal during an existing Mail batch, fixed after
   independent review.** Initial commit 28b05e7 passed only `capabilities()` to the
   Mail authorization callback. Therefore removing local credentials after session
   establishment could still allow later batch items. `mail/module.ts:59` now
   checks `selected()` (owner, token-bound account, current credential presence)
   before policy. Two production-module regressions prove zero moves after
   preflight removal and exactly one preserved completed move when removal happens
   between items. Installed 0.1.26 and the first preparation commit had this gap.
   It requires an admitted batch and concurrent owner credential removal.

4. **Medium, conditional local hardening — unsafe custody reopening, fixed.**
   Installed 0.1.26 `server/installation.ts` checked only key type/mode using
   `statSync`, following symlinks; directories, marker, databases and sidecars were
   unchecked. Misconfigured/tampered local paths could reopen or disclose sensitive
   state. Startup now uses `lstatSync` to require current ownership, private modes
   and regular file/directory types for named state/custody paths and sensitive
   files. Tests prove refusal without silent repair. Live checked paths were safe:
   config/databases 0600, state/custody 0700, correct owner and no symlinks. Exploit
   prerequisites are unsafe permissions or local filesystem access/tampering,
   not an unauthenticated MCP request. Checks do not bind subsequent opens to file
   descriptors or inspect every ancestor; same-UID/root hostile path replacement
   is outside this guarantee. Unsafe existing installs deliberately fail startup.

Bearer expiry/revocation is checked at HTTP admission, with scopes captured for
the request. Later OAuth token revocation does not cancel admitted work. Provider
commands already submitted cannot be undone by dispatch guards, including internal
steps of one move; preserving success/unknown evidence is intentional. Local
provider-credential removal, Apple app-password revocation and OAuth grant
revocation are distinct operations.

## Dependency findings and actual pathways

Installed direct Nodemailer is 7.0.13; candidate runtime/E2E pin 10.0.14. The before
scan returned 13 advisories; the candidate scan returned an empty advisory object.
This is a known-advisory snapshot, not proof of absence of vulnerabilities. Both
installed baseline and candidate also contain nested Nodemailer 10.0.13 for
mailparser and 10.0.10 for mailauth; inbound parser resolution uses those nested
copies. The direct upgrade must not be described as closing 13 exposed inbound
email exploits.

Independent source review found no demonstrated exploitable advisory pathway in
the current MCP surface. Application-level residual dependency risk is low:

- Reachable address parsing: `GHSA-2x7j-588g-ccc2`, `GHSA-v53p-9fqp-m79j`.
  MailComposer/SMTP receive validated plain addresses, bounded to 20 recipients
  of 254 bytes; unbounded crafted address lists are rejected.
- Recipient-domain bypasses: `GHSA-wmmp-3585-3rmp`, `GHSA-cc9r-2j5m-2m83`.
  The app does not use a domain allowlist as a security boundary.
- Controls not exposed by strict schemas/manual mapping: `GHSA-p6gq-j5cr-w38f`
  (raw file/URL), `GHSA-268h-hp4c-crq3` (List-* comments),
  `GHSA-wqvq-jvpq-h66f` (jsonTransport), `GHSA-r7g4-qg5f-qqm2` (OAuth token fetch),
  `GHSA-c7w3-x93f-qmm8` (envelope.size), `GHSA-vvjj-xcjg-gr5g` (transport name),
  `GHSA-8m3c-c648-2xjj` (legacy resolveContent), `GHSA-8vvx-rff5-p5rq`
  (nested recipient arrays), `GHSA-6vj9-mwq6-2f5v` (cross-transport DNS/TLS).
  Transport is fixed to smtp.mail.me.com with password authentication and TLS
  verification. Other trusted code exposing those options would change this risk.

The major upgrade has local SMTP/MIME/attachment/threading regression coverage,
including 28 independently rerun fixture tests/45 assertions. Its bundled SMTP
string-array types match runtime results. No live SMTP send was performed.
Retained @types/nodemailer 7 is not an observed blocker; Nodemailer 10 supplies
its own declarations. Supporting advisory examples:
[raw access bypass](https://github.com/advisories/GHSA-p6gq-j5cr-w38f) and
[address-parser DoS](https://github.com/advisories/GHSA-v53p-9fqp-m79j).

## Other fixes and error-contract evidence

UTC query/availability ranges now reject normalized impossible dates and 24:00
before REPORT, with a valid leap-day regression. Container build context and
Containerfile include current font/license and Calendar skill inputs, and create
private state/custody forUID 10001. Linux image execution remains unverified.
Both LaunchAgent examples now use `local.icloud-mail-mcp` and pass plutil lint;
previously the deployment example used a different label than the stop command,
which could leave the service running during operator replacement. This was a
low-severity operational documentation defect. No agent was loaded or unloaded.

Calendar inspect_sharing requires provider capability plus a complete roster;
unsupported means unknown, not private/unshared. Missing provider HTTP 404 maps
to CalendarError(not_found). Two kinds of evidence distinguish the wrappers:

- Installed 0.1.26 code with a synthetic missing-provider error through the MCP SDK
  returns `isError:true`, body `{"status":"rejected","error":{"code":"not_found"}}`,
  and no `error_code`/INVALID_ARGUMENT member.
- A live read-only get of a unique never-created event under an observed calendar
  returned the same inner not_found plus outer structured
  `{"error_code":"INVALID_ARGUMENT"}`. No event was created, edited or deleted.

Therefore the outer classification is added after the application's result,
in the connector/client adaptation path. The exact responsible component is an
inference; its source was unavailable. Preserve the inner typed domain error;
no claim is made that the outer adapter has been corrected.

## Live acceptance and renewal

Parent acceptance at 21:22–21:30 UTC established the correct profile,9 mailboxes,
inbox search/complete read,4 calendars and bounded event query. Authorized
temporary calendar/event CRUD read back updated title/UTC time and verified
cleanup; original four names/hrefs/ETags remained unchanged. These observations
belong to installed 0.1.26, not this candidate.

During this review, read-only profile access succeeded and ordinary client
renewal occurred at 22:06:54 UTC, before prior access expiry 22:16:10. Metadata
confirmed refresh rotation/new access for the same client, authorization-code
lineage, account binding and all existing scopes. Consent created/updated at
21:16:07 was unchanged. New access expires 23:06:54. Subsequent Mail list returned
9 mailboxes and Calendar list returned 4 calendars. At 22:16:42 UTC, after the
original access expiry 22:16:10, an ordinary mailbox read again returned all 9
mailboxes using the same successor grant/client/account/scopes. This verifies one
proactive renewal cycle and continued access beyond the original expiry, without
reconnect, new consent or manual token handling. It does not prove rejection of
an expired live bearer, reactive refresh first attempted after expiry, indefinite
renewal or candidate deployment. Expiry/replay/revocation security has synthetic
integration coverage.

Read-only doctor passed 13 checks; both SQLite integrity checks passed. Diagnostics
are default-disabled, owner-only,30-minute bounded,256 enum-only records, with
expired live marker untouched. Provider debug/loggers are disabled. Telemetry
contains fixed enums/counts. No credential or provider-content logging was added.

## Single-account gates versus excluded scope

For single-account persistent access, the observed proactive renewal and
post-original-expiry continuation close one normal-client cycle. Synthetic tests
cover expiry/replay/revocation security; live expired-bearer rejection and reactive
after-expiry renewal remain unverified security/failure-path evidence, not
expanded feature capabilities.

Required before production rollout: review/integrate the exact final commit,
assign a new version, rebuild and identify hashes; obtain deployment/restart
approval; take a consistent protected stopped snapshot and validate compatible
rollback. Recheck account profile, accepted Mail/Calendar reads and private/public
isolation after rollout. Existing historical backups do not replace that snapshot.

For an unattended availability claim, supervision and recovery remain a required
operational gate. Read-only checks found server PID 34332 alive with about 2 hours 20 minutes
uptime; neither documented LaunchAgent was installed/registered. Both templates
lint successfully. These establish current availability/configuration only.
Reboot, login/logout, sleep/wake or crash-recovery acceptance would require
separately approved service/supervision or host actions; none were induced.
Safe future checks are ordinary read-only calls after natural renewal/expiry,
metadata comparison without token values, periodic anonymous health/isolation
checks and passive uptime/supervisor inspection. These cannot prove fault recovery
without observing or intentionally testing the relevant fault.

Deliberately excluded expanded claims: multiple accounts, invitations/sharing,
recurrence/timezones, live conflict rejection and ambiguous-write recovery. Their
absence of live acceptance does not block the narrower accepted capability claim.
Calendar durable operation IDs/reconciliation and Mail unknown-outcome handling
have fixture coverage; generic Mail mark/move batches have no Calendar-style
durable operation IDs, so clients must inspect unknown results before another
operation. No expanded writes were authorized or tested here.

## Final verification and next approval

Bun 1.4.2/darwin-arm64 full affected checkpoint after the review fix passed:
application/tooling typechecks, production build, 269 application tests/1617
assertions, 10 tooling tests/134 assertions and 11 built E2E tests/253 assertions.
Final disposable frozen artifact assembly passed, and isolated lifecycle
revalidation again passed 1 test/26 assertions. These use dummy state/provider fixtures, never
real credentials. Initial sandbox listener failures were rerun with allowed
fixture access. Independent reviewers found no remaining blocking regression.

Task-local evidence includes checkpoint logs, dependency before/after audit,
installed error fixture/live sanitized error observation, renewal metadata,
supervision observation, runtime health/integrity and source/artifact comparisons.
They support this report; this complete text is intended for inline delivery.

Next approval is review/integration and a newly versioned release plan. Publishing
PR/release, merge, deployment/restart, supervision installation, permission repair,
diagnostic-file cleanup and expanded live writes remain unauthorized. Preserve
all current credentials, accounts, grants and routes through any approved rollout.
