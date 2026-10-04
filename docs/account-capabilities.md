# Account capabilities and routing

## Accepted contract

Registered services are probed independently with the supplied credential. A
successful read-only probe of any service permits account creation or password
rotation. Generic authentication and transport failures are unknown, not proof
that Mail is unprovisioned. All-failed validation preserves existing credentials.
Capability evidence is persisted against a credential revision; a stale result
cannot replace a newer credential or revive a revoked service. Service enablement
is separate from operator action policy and OAuth scopes.

The MCP tool set is the union of available, enabled services on accounts explicitly
authorized by the caller's grant. Linking an account does not expand any existing
grant. New consent snapshots list every selected account; old single-account
references stay bound to that account. Account metadata never includes credentials.

`icloud_accounts` returns only authorized accounts, stable IDs, labels and registered
service states. Service tools accept `account_id`. An explicit unavailable account
fails without fallback. Without an ID, use a configured service default (only when
authorized and eligible), or the sole eligible account; ambiguity requires a user
choice. Message and event references retain their original account identity.

The current stateless HTTP transport refreshes tool lists on `tools/list` and
enforces eligibility on every call. It does not advertise push list-change support.
See the [MCP tools contract](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Implemented behavior

Mail and Calendar are the registered services. The composition root injects both
read-only probes into account creation, rotation and explicit recheck. Ordinary
IMAP/CalDAV failures are recorded as `unknown / probe_failed`; the adapters do
not currently identify an affirmative unprovisioned response. Unknown Mail is
disabled with an honest explanation while verified Calendar remains usable.
An all-failed creation or rotation is rejected. A failed explicit recheck records
unknown evidence without deleting the credential and disables its affected services.

The owner can toggle each available service, recheck an account, and configure
per-service defaults in private administration. Rechecks and rotation preserve a
previously disabled preference. Every evidence/toggle write checks the credential
revision; failed rotation leaves the old credential and evidence intact. Revocation
invalidates service evidence. The public chooser permits multiple checked accounts
and consent displays exactly that immutable selection. Adding another account
never changes an existing consent snapshot or legacy single-account reference.

`account_id` is added by the shared runtime to service tool inputs and removed
before module validation. The chosen ID is checked against the verified grant;
module policy and OAuth scope checks still apply. Mail references already bind an
account. Production Calendar event references now carry `accountId` too and reject
missing or mismatched identity before provider preflight. List responses annotate
the selected account. The account catalog contains only consented IDs and no
credential bytes, password, or credential revision.

## Storage compatibility

Additive `account_services` and `account_service_defaults` tables retain existing
owner/account records, encryption and custody. Stored evidence is bound to the
credential version. Accounts without prior capability rows retain historical Mail
availability as `legacy_mail`, not a fresh probe result; Calendar starts unknown
until rechecked. Revoked legacy accounts remain unusable. New production account
creation always supplies probe evidence. Existing single-account OAuth grants stay
single-account; explicit multi-account consent uses an immutable server-side grant
reference instead of owner-wide enumeration. No grant or service availability adds
write, send, unsubscribe, Calendar write, or scheduling scopes.

## Integration with main 0.1.27 (2026-10-04 UTC)

This feature is rebased onto `62d2fae` (main 0.1.27). Calendar is already part of
main; this branch adds account capability detection, consent and routing, without
reintroducing the old Calendar release or replacing main's administration shell.
Private account onboarding also persists independent probe results. The existing
credential-generation and concurrent-removal guards, client recovery diagnostics,
client identity display and installation-wide policy controls are retained.

Multi-account readiness observations now record the routed account. Service toggles
and rechecks advance the readiness epoch so off/on cannot revive old successful-read
evidence, including in-flight completions. Independent review identified this
integration issue and confirmed its fix with 24 tests / 232 assertions.

`bun bin/checkpoint` passes application/tooling typechecks, production/browser
build, 301 application tests (1,948 assertions), 10 tooling tests (134 assertions),
and 11 built E2E tests (277 assertions). Declared application/E2E dependencies were
updated from their unchanged lockfiles. Chrome fixture checks on the integrated
bundle confirm service toggle persistence, keyboard Space interaction, two-account
consent and no horizontal overflow at 375px. No live credentials/providers were used
for this integration checkpoint. Earlier evidence below describes the original
pre-main implementation and is retained as history.

## Initial verification (2026-10-04 UTC)

- Application/tooling typechecks and production/browser build passed via
  `bun bin/checkpoint`.
- Application: 248 tests, 1,148 assertions; tooling: 10 tests, 134 assertions.
- Built E2E: `bun bin/e2e`, 11 tests, 271 assertions, including independent
  Calendar-only connection, multi-account OAuth consent, caller-limited union,
  explicit unavailable routing, old-token denial and persistence across restart.
- Focused capability tests cover unknown/all-failed probes, redaction, migration,
  failed/stale rotation, service defaults, ambiguous routing, unauthorized IDs,
  cross-account Calendar references and per-account activation.
- Independent read-only authorization review found no confirmed blocking defect;
  the reviewer also ran 29 targeted tests with 306 assertions. The remaining checks
  were performed by the implementation agent.
- Native Chrome rendered the actual browser bundle with a local synthetic server:
  desktop administration, 375 × 667 chooser/consent/error views, available/enabled
  checkmarks, disabled Mail reason, multiple selected accounts, Space/Tab/Return
  interaction and invalid-consent denial were observed. This is fixture UI evidence,
  not physical-phone, Passkey or live-client acceptance.

The first E2E attempt exposed a pre-existing fixture omission: Mail was stubbed but
Calendar was not, allowing a real CalDAV attempt with synthetic example.invalid
credentials. No real credential was read and this is not live-provider acceptance.
The fixture now explicitly supplies Calendar and rejects/counts non-loopback fetch;
the final E2E run asserted zero external attempts. Its artifact-version assertion
was also updated to the integrated Calendar 0.1.21 version. Earlier failed runs are
retained in the external task evidence directory.

Real iCloud interoperability, client-driven tool-list refresh and phone conversation
visibility remain unverified. The stateless transport supplies no push refresh
channel. Calendar collection concurrency/sharing limitations remain documented in
[Calendar production](calendar-production.md).

Development, build and migration checks are complete locally. The user authorized
commit/push and integration with current main. Release, installation, deployment,
merge to main, worktree deletion and conversation archival remain excluded. Original
WIP was preserved in local recovery commits before rebasing the account-only change;
main already contains the Calendar snapshot from `1b8e0ac`.
