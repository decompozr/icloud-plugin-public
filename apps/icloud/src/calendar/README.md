# Calendar module

Calendar owns its domain/codec, iCloud CalDAV gateway, policy-backed service,
encrypted account-bound operation/sync ledger, MCP tools and owner controls.
`module.ts` composes those parts into the shared `ModuleRuntime`; application
authentication, server lifecycle, monitoring and account credential custody stay
outside this feature. Production code does not import the Calendar playground.

## Boundaries

- `domain/`: typed discriminated commands, exact resource identities and bounded
  iCalendar transformations. Preserve UID, unknown fields, recurrence identity
  and timezone representation; unsupported semantic forms fail explicitly.
- `icloud/`: trusted CalDAV discovery and bounded requests, actual metadata,
  ETag/Schedule-Tag checks, complete queries/sync hydration, scheduling/sharing.
  Never automatically replay a mutation after a transport failure.
- `services/`: policy checks, durable intent, operation replay/reconciliation and
  atomic token/snapshot advancement. Scheduling side effects found on existing
  events require scheduling permission even through generic edits/deletes.
- `storage/`: encrypted journal and sync state bound to verified owner/account.
  A pending dispatch survives restart as unknown; another account cannot read or
  reuse its private operation state.
- `mcp/`, `admin.ts`, `module.ts`: typed public tools, independent consent and
  owner capability policy. Existing Mail grants never gain Calendar permission.

Calendar starts disabled. `calendar.read`, `calendar.write`,
`calendar.schedule` and `calendar.share` are independent of Mail; scheduling and
sharing also require read/write. Provider credentials come only from the
authenticated account context. Activation validates CalDAV; subsequent calls
observe current policy and credential revocation.

## Master-key custody validation

`SqliteCalendarLedger.validateExistingPayloads` reads a supplied existing SQLite
snapshot, without invoking the constructor, creating schema, rewriting policy,
converting dispatch state or closing the caller's DB. The authenticated migration
baseline supplies policy owners and every retained owner/account namespace,
including revoked accounts. All policy, operation and sync rows must authenticate
under the unchanged `calendar-ledger-v1` derivation and stored owner/kind/id AAD;
unknown namespaces/kinds, malformed payloads and wrong keys fail with redacted
recovery errors. It returns only counts and clears private decryption/key buffers.
Parsed JS objects/strings cannot be reliably erased.

The validator shares decryption with normal reads. Its complete encrypted row
snapshot also prevents a failed validation from leaving a cached Bun iterator at
the next row on retry. Fixtures cover populated readonly snapshots, retained
accounts, every ciphertext kind, AAD mismatch and repeated wrong-key rejection.
Caller-owned baseline completeness, stopped maintenance, missing/deleted-row
detection and complete installation validation remain separate requirements;
empty stores provide no cryptographic key evidence. This does not enable native
Keychain custody or establish K0/K2 acceptance.

## Supported semantics and limits

Commands cover calendars, finite event queries/availability, event/series/instance
changes, synchronization, invitations/responses and sharing. Typed fields cover
DATE/floating/UTC/TZID times and DISPLAY alarms. Recurrence is a bounded subset,
including daily/weekly/monthly patterns and supported BYDAY forms; arbitrary RFC
conformance, unsupported RANGE/EXRULE/period-RDATE forms and arbitrary timezone
resolution are not promised. Multiple RRULEs, unresolved TZID, ambiguous or
nonexistent DST instants, TZID with DURATION instead of DTEND, expansions over
10,000 occurrences and windows over 366 days fail explicitly. DATE/floating
expansion and edits require an explicit UTC interpretation policy. Incomplete
results must not establish availability.

Unknown or ambiguous sharing rosters fail closed. Initial share creation accepts
only the specifically checked invite-404/unshared-resource shape plus owner and
capability witnesses; a generic missing property is not an empty-roster proof.

Event resources use conditional identity/revision checks. iCloud was observed
ignoring collection `If-Match` for rename/delete; those operations explicitly
report `preflight-only` concurrency. Calendar deletion confirms all contents,
including concurrently added contents; an empty preflight is not atomic safety.

Source/build tests and disposable packaging checks pass. A registered real-iCloud
smoke passed and cleaned its own resources. The user accepted remaining recipient-side sharing verification limits. Final
sharing revocation and cleanup restored four original calendars and zero test
markers. The accepted source-module goal is complete. No installed application was changed by this implementation.
See [production coverage](../../../../docs/calendar-production.md) for exact
evidence, live findings and unresolved gates.
