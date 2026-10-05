# Engineering knowledge from the experiments

> Photos experiments closed 2026-10-04. The [capability plan](photos-capability-plan.md) supersedes historical cloud-only constraints and unresolved local-read claims below. No production Photos provider is implemented yet.

## macOS Keychain custody and update identity (2026-10-05)

### Accepted local trust boundary and workflow revision

The product owner accepted official Bun as the default and the same macOS user
as the local trust boundary. Moving both credentials into Keychain does not require
proving that every same-user caller is the sealed application. Remote owner,
account, OAuth and operation authorization remain mandatory. A locally callable
native helper may release the exact owned secret to this trusted local user; this
must not be described as isolation from other same-user processes. Keep selectors
installation-scoped, operations bounded, channels local/private and diagnostics
redacted; do not expose a generic Keychain or public plaintext-export endpoint.

Keychain access is item-controlled, not automatically granted to every process in
an unlocked user session. File-based ACLs and data-protection access groups differ.
Standard helper identity/signing, setup approval and unattended read/update behavior
still need acceptance with the selected implementation. See [Apple access control](https://developer.apple.com/documentation/security/access-control-lists)
and [Apple authorization prompts](https://support.apple.com/en-ie/guide/keychain-access/kyca1243/mac).

The earlier Bun external-entry and socket sender findings remain valid evidence
about a stronger app-only boundary. They do not invalidate the closed Keychain
experiment or block the accepted user-level design. No custom Bun fork/build or
message-bound application authentication is a prerequisite under this decision.
New unacceptable risks require a concrete finding and product decision before
expanding that boundary. This revision is a product decision, not a passed native
experiment: K0 API/signing/lifecycle acceptance remains incomplete.

Work order is experiment -> reconcile knowledge -> revise plan -> implement.
Every experiment has a bounded question and acceptance result. Reuse existing
evidence, distinguish fixtures from native/lifecycle proof, and report phase gates
separately from source commits. Do not grow inactive integration work to replace
missing native acceptance. No live secrets, real Keychain operations, installs,
production signers or releases are authorized by this decision.

Before implementing the standard helper adapter, the [official Bun protocol
experiment](../playground/keychain/helper-protocol.md) exchanged thirteen requests
with a separate synthetic memory-helper process. It preserved exact master and
password bytes, fixed selectors/request binding, create-only behavior and absence
without fallback; malformed frame decoding and interactive reads were rejected.
No secrets were placed in process arguments or inherited environment. This is
process transport evidence, not native Keychain or cross-user/signing acceptance.
Production stream collection must be bounded as bytes arrive, with termination
and unknown-mutation handling. The native backend remains unselected; K0 is not
passed. The experiment and standalone TypeScript check passed, with no real
Keychain operations or new toolchain.

The inactive [Bun-side adapter](../apps/icloud/src/storage/custody-helper.ts)
implements that candidate with collection-time stdout/stderr caps, strict response
identity/schema/length checks, copied request bytes and caller-owned read outputs.
Abort cancels pipe readers, terminates the owned child when needed and observes
its terminal state before returning. Explicit helper error enums are preserved;
transport failures after launching add/delete return outcome_unknown without
automatic retry. Real subprocess fixtures model an applied mutation with a lost
reply, oversized/malformed/stderr/nonzero output and stalled reads/deletes. No
native Security API or Keychain backend is selected, and child termination does
not roll back an already-applied mutation. The journal must reconcile exact items.
Buffer wiping cannot erase every Blob/Bun transport copy. The subprocess fixtures
prove direct-child cleanup, not descendant-process, native or cross-user lifecycle
acceptance; the native helper topology remains a separate qualification gate.

The [modern SecItem query experiment](../playground/keychain/secitem-policy.md)
compiled with warnings-as-errors and compared eight native/Bun query cases without
Keychain calls. Read/delete use LAContext.interactionNotAllowed and the data
protection target; non-synchronizing selector strings match Bun, including slash,
quote and Unicode owners. Initial wire `password` versus stored `account` tag
mismatch was caught and corrected. Query properties do not prove native UI/access
behavior. Apple TN3137 requires authorized access-group entitlements, app-like
packaging/profile and a user login context for this candidate. Those remain
unqualified; compilation does not approve a production backend or signer.
The SDK deprecates legacy Allow/Fail UI constants; the prior file-Keychain probe
cannot be treated as equivalent evidence for this modern candidate. No silent
backend fallback or custom Bun requirement follows. Native qualification remains
the critical next gate.

The [native helper source checkpoint](../playground/keychain/native-helper.md)
adds strict one-request dispatch and modern SecItem add/read/delete source using
the accepted query policy. A compile-time memory branch cannot route to native
storage; twenty-one cases through the real Bun adapter pass, including malformed
identity/type/extra fields and bounded status/unknown-mutation handling. Production
source typechecks without being executed. No Keychain call or profile/signing
acceptance follows; helper bundle/release integration and actual native lifecycle
qualification remain the next gate. CoreFoundation/Swift transport wiping remains
best effort, and remote/journal authorization is a surrounding caller obligation.

The app-like bundle fixture now passes five packaging checks plus the same
twenty-one dispatch cases: valid plist, strict ad-hoc signature, exact fixture
identifier, sealed-resource modification rejection and restoration acceptance.
No embedded profile, restricted entitlement or production signer is present;
this does not qualify data-protection item access or ordinary-update continuity.
The [release contract](../apps/icloud/src/storage/native/README.md) records real
identity/profile/access-group inputs and requires the future release pipeline to
reject fixture artifacts; that production pipeline is not implemented here.
No signer/profile configuration was found in the searched existing tooling files;
host identity availability is not inferred. The owner has been asked for existing
release inputs; no keychain identity listing or installation was performed.

### Historical stronger-boundary findings

K0 follow-up: the [stock Bun runtime boundary experiment](../playground/keychain/runtime-boundary.md)
reproduced external-script and preload execution on Bun 1.4.2 without changing
the signed compiled executable or designated requirement. Hardened runtime,
disabled config autoload and an entry-point JS environment guard did not establish
a fixed-entry application. This used synthetic test labels, no broker/Keychain or
real credentials; it is a negative caller-boundary finding, not an extraction or
production signing test. A native pre-JS restriction would need separate feasibility
evidence if app-only isolation were later adopted. The
[migration plan](keychain-migration-plan.md#api-signing-and-caller-boundary-k0)
and roadmap retain both migrations behind revised K0; stock compilation alone
cannot claim app-only isolation, which is outside the accepted local boundary.

The later Bun-first runner also embedded the documented strict string-code flag.
On revision `1.4.2+744846f84` it appears in `execArgv`, but the tested indirect eval
still succeeds; external CLI and file preload also run. This version-specific
negative finding was independently reviewed from source/raw evidence, not rerun
by the reviewer. See the report's embedded-strict follow-up. Current documentation
or an accepted flag string must not substitute for observed policy enforcement.
Dedicated-runtime build/maintenance was not adopted and is no longer required by
the current plan; no new runtime or toolchain was installed.

The Keychain experiment is closed as a feasibility investigation. Its
[report and reproduction recipes](../playground/keychain/README.md) and
[bounded acceptance evidence](../playground/keychain/evidence.json) retain the
useful results. Verification was performed by the same agent, not independent
review. No production credential migration, setup/uninstall implementation or
deployment resulted.

The user accepts setup-time macOS authorization but requires unattended ordinary
reads without recurring prompts. Automatic setup and uninstall are intended
product behavior; preserve-state uninstall versus complete data removal remains
an unresolved choice. These requirements do not establish untested OS behavior.

| Verified knowledge | Evidence boundary | Design consequence |
| --- | --- | --- |
| Native code can create, repeatedly read and delete a Keychain item automatically. | Synthetic 32-byte values in an already-unlocked file-based Keychain; reads explicitly prohibit UI. | Provision once during setup. Runtime must report unavailable/denied state instead of repeatedly requesting interactive authorization. |
| Bun and a user LaunchAgent can invoke the authorized reader unattended. | Existing logged-in GUI session; no reboot, logout or lock transition. | Background-service integration is feasible in that session; startup-before-login and locked-session behavior need separate acceptance. |
| A stable path and identifier do not preserve an ad-hoc executable's access after rebuilding. | Changed v2 is rejected with `-25293`; unchanged copies and restored v1 succeed. | Do not use path stability as an upgrade trust guarantee. |
| Changed v1/v2/v3 binaries can share access when the certificate-authenticated designated requirement is stable. | One pinned temporary self-signed certificate plus one identifier; distinct hashes, repeated reads, same-path replacements and rollback all pass without UI. | Sign updates under a deliberately stable identity/requirement; production signing and rotation policy still need validation. |
| Access remains restricted under the tested stable requirement. | Different signer, different identifier and ad-hoc controls are rejected; the authorized v3 still succeeds. | Do not broaden ACLs to all applications or use identifier-only rules merely to eliminate prompts. |
| Trusting a helper does not authenticate its caller. | Copied-helper and Bun-child reads succeed. No caller-authenticated broker was implemented. | A general-purpose helper returning plaintext cannot claim isolation from other same-user processes. Define the production caller boundary before adoption. |

The current master key protects more than Apple account credentials. Moving
Apple passwords alone does not permit deleting it. A master-key custody migration
must preserve the exact key and installation identity, verify dependent state
before cutover and prevent silent fallback after Keychain becomes authoritative.
Keep signing private keys on the release/build side, not in the distributed
runtime. The disposable self-signed identity demonstrates continuity, not public
distribution eligibility or a production signer.

Custody validation must restart from every retained row after failure. On the
tested Bun 1.4.2 SQLite runtime, a cached `query().iterate()` interrupted by a
callback throw continued at later rows on subsequent calls (synthetic three-row
control observed first rows 1, 2, 3, then none). The auth, Mail and Calendar
validators use complete encrypted `.all()` snapshots instead; repeated wrong-key
and corrupt-state regressions require rejection on every invocation. See
[ledger fixtures](../apps/icloud/src/storage/ledger-validation.test.ts) and
[auth fixtures](../apps/icloud/src/auth/key-contexts.test.ts). Empty/pending-only
stores still do not prove a key, and these fixtures do not establish native K2.

The passing result pins one exact certificate; renewal/replacement under another
fingerprint, Developer ID releases, actual “Always Allow” approval, locked
Keychain access, reboot/login, recovery and real application upgrades are not
verified. The probe uses deprecated file-based APIs for interaction control;
select the production Keychain API and signing/caller model separately. Removing
a Keychain master key while retaining dependent ciphertext can prevent reinstall
or recovery. Uninstall must distinguish retained-state and complete-removal modes.

All synthetic items, transient jobs, isolated signing keychains and private
signing files were removed and their absence verified. The preserved evidence
contains no exported key or production credential. Raw temporary files have no
remaining knowledge/recovery dependency; their disposal follows the task's
publication and cleanup gates. Reproduction source remains historical evidence,
not an active experiment or production acceptance check.

## Calendar integration decision (2026-10-03 UTC)

Final disposition: the registered source module passed independent review,
source/build/artifact checks and a bounded registered real-iCloud smoke. The user
accepted remaining recipient-side sharing verification limits. Reviewed cleanup
verified recipient revocation, test calendar absence and a fresh inventory of
four originals with zero markers. No installed service or policy was changed;
unverified recipient enforcement is not promoted to a passing test.

The owner now requires production Calendar as a registered module. Keep shared
runtime/authentication/custody while separating Calendar enablement and client
scopes from Mail. Existing Mail grants must not gain Calendar access. Scheduling
permission applies to updates/deletes of existing attendee-bearing events too.
The missing sharing roster property remains unknown, not evidence of an empty
roster. [Production coverage](calendar-production.md) retains these gates; source
integration does not establish deployment or live sharing support.

The later live empty-collection probe showed that iCloud accepted a stale-ETag
rename and stale-ETag DELETE, despite sending `If-Match`. Production collection
operations must describe their non-atomic semantics; an empty listing or
collection ETag is not protection against concurrent additions/changes. Event
resource stale writes separately returned 412 in earlier tests. The probe was
removed and only the four original calendars plus the pending shared test
calendar remained. See [current evidence](calendar-production.md).

This document records what the evidence supports and why it matters. Requirements
live in the linked specifications; experiment code and the [register](experiments.md)
retain reproducible evidence. Observed behavior is not a production implementation.

| Knowledge | Evidence and boundary | Consequence for the specification |
| --- | --- | --- |
| Mail UID alone is not a durable identity. Missing fetches return no message, and new selections expose changed UIDVALIDITY; the tested client does not enforce prior validity on mutations. | L2, actual ImapFlow transcript plus a separate guard sketch; [mail experiments](../playground/extended.test.ts). | M01–M03 require scoped identities, preflight validation and selected-mailbox isolation. |
| Library move success/failure cannot be trusted without understanding each stage. The tested fallback continued deleting after COPY rejection, and expunged after STORE rejection. | L3 actual server NO responses and emitted commands; ImapFlow 1.7.8 only, not a claim about every version. Native MOVE lost acknowledgement was not retried. | M04–M06 require no unsafe fallback, stop after failed prerequisite and explicit partial/unknown outcomes. |
| Global EXPUNGE can affect unrelated deleted messages. The Python reference's writable CLOSE cleanup adds another implicit-expunge path. | L3 and pinned [source research](research.md#how-the-reference-implementations-work). No live mailbox was used. | Cleanup and moves must not broaden effects beyond selected messages. |
| Read-only selection and PEEK are available under Bun. Full MIME parsing allocates attachment content; a cut source can still parse successfully. | L2/L5 actual protocol and mailparser fixtures; no general memory/streaming proof. | M07–M08 require non-mutating reads and explicit bounds/completeness. Semantic summaries stay with the agent. |
| Folder roles and keyword permission are discoverable metadata, not proof of provider behavior. | L4 scripted special-use/PERMANENTFLAGS and separate destination sketches. | M09–M10 require capability-based behavior and explicit unknown/unsupported results. iCloud tags and spam training remain open. |
| Unsubscribe headers expose candidates, not authorization or confirmed removal. | L6 real MIME parsing plus a narrow fake-resolver policy sketch; no URL visited. | M11 separates discovery/execution/outcome and requires destination validation. |
| Bun supports the tested MCP, WebAuthn and token-verifier paths. Synthetic Passkey verification checks origin/RP/challenge; a fake OAuth HTTP roundtrip works locally. | L1/L7/L8; [auth boundaries](../playground/auth/README.md). No real browser, owner login or Codex/ChatGPT linking. | A01–A04 specify binding and access checks; actual client/domain acceptance remains required. |
| Atomic one-owner enrollment and encrypted dummy storage survived process restart in a SQLite candidate. | L9 [setup experiment](../playground/setup/README.md); no production key provisioning, provider validation, crash durability or recovery proof. | A05–A07 require the outcomes without selecting SQLite, an algorithm or key location. |
| Process restart/shutdown can preserve state and release listeners; container evidence is mixed. | L10 [runtime evidence](../playground/runtime/README.md): direct-IP HTTP and bind persistence worked; published localhost forwarding reset; cached Alpine lacked Bun. | D01–D07 specify deployment acceptance. Container placement and forwarding are not decided or validated. |

The independent local aggregate passed 51 tests/161 assertions. Some assertions
intentionally reproduce hazardous behavior; this count does not mean all safety
expectations passed. No live provider or deployed product acceptance follows.

Open decisions: safe move behavior when extensions are absent; production validation of the now-defined read and
batch defaults; iCloud keyword/junk support; unsubscribe execution policy; WebAuthn
RP/origin layout; complete OAuth/provider arrangement; credential key/recovery
strategy; and container/Tailscale topology. Candidates and sketches are not
selected architecture. Calendar remains outside production scope; its later
bounded experiments are recorded below. Other providers remain outside scope.

[Current architecture](architecture.md) records implemented feature ownership,
registration and shared-host boundaries. Historical provider comparisons and
protocol experiments remain in [research](research.md) and
[experiments](experiments.md); they do not establish current deployment behavior.

Later [runtime follow-up](deployment-lifecycle.md#follow-up-a-working-candidate-route-and-linux-bun)
established basic Linux Bun container execution and a host-loopback proxy
alternative. Earlier Alpine/no-Bun limits are historical; actual application,
auth and Tailscale deployment remain unverified.

## Current iCloud move capability (2026-10-02)

An authenticated, TLS-verified CAPABILITY-only diagnostic against the enrolled
account observed UIDPLUS and no MOVE. It logged only capability names, then
logged out; no mailbox or content was requested. Thus native-MOVE-only gating
explains unsupported_capability for this account's organize operations.

Installed ImapFlow combines COPY/delete in its MOVE fallback and can return the
copy result without checking deletion success. Its deletion command also ignores
the STORE boolean before expunge. Simply enabling that fallback would violate
our failure contract. UIDPLUS supplies the necessary *targeted* expunge protocol,
but our adapter must check each stage separately. This is an observed current
account capability, not a permanent claim about every iCloud account.

The new adapter protocol fixtures confirm explicit COPY/STORE/UID EXPUNGE stages
can preserve unrelated Deleted messages while refusing to continue after an
unconfirmed stage. `apps/icloud/src/mail/icloud/adapter.move.test.ts` exercises fourteen
success/failure cases against the actual library. The built HTTP MCP tests in
`apps/e2e/src/imap.e2e.test.ts` separately confirm service batch outcomes and
remaining-target cancellation. These do not prove a real iCloud move succeeded:
only the capability observation used the live provider.

## Outbound uncertainty and operation receipts

SMTP recipient acceptance and final DATA acceptance are different stages. The
outbound wire fixtures show that explicit refusal of every RCPT (4xx or5xx)
can return rejected with no DATA, while a connection lost after DATA is unknown.
A partial accepted/rejected recipient set with final acknowledgement is partial
submission, never confirmed delivery. IMAP APPEND without a verified APPENDUID
is likewise unknown even if the server may already have saved the draft.

The owner-bound SQLite ledger claims a unique operation ID before effects,
retains unfinished tombstones across restart and encrypts completed receipts.
Concurrent duplicate requests do not produce another submission. A failure to
persist the final receipt after provider success remains unknown; automatic
retry would risk duplicates. Tests cover actual SQLite reopen and a failing
receipt-write trigger. No exactly-once provider guarantee is claimed.

Reply lookup now uses a bounded BODY.PEEK[HEADER] request through the actual
adapter, checks original UIDVALIDITY and complete headers, and validates explicit
recipients against Reply-To/From. The built HTTP fixture traverses the SDK,
service, actual IMAP header lookup and SMTP/APPEND protocol adapters. These are
local synthetic peers, not a real outgoing message or draft in the owner's account.

## Production installer boundary

Production installation is explicitly `~/.decompozr/plugins/icloud`, selected by
the release-provided `icloud-plugin install` command. Root `releases/` stores
versioned distributions. Installed immutable versions live under `releases/` with
an atomic `current` selector; private configuration, custody and state belong in
`runtime/`. Installation never initializes state or starts the service. Run the
installed `current/icloud-plugin run` only after configuration/state preparation.
The `0.1.19-installer1` packaging revision preserves the previously verified
application byte-for-byte and adds the installer, avoiding accidental deployment
of an unrelated source refactor. See deployment lifecycle for verification and
archive provenance. Neither build nor release should create `.flow-runtime` or
external installation directories implicitly.

## Photos metadata findings (2026-10-03)

The [Photos experiment](photos-feasibility.md) preserves distinct asset identities
when filenames collide and keeps thumbnail/original/Live Photo motion resources
separate. Its scope includes private/shared database and every string-valued
zone-ID field. Missing thumbnails fail explicitly rather than selecting a larger
resource. The upstream query returns asset/master rows together; the validated
one-to-one fixture advances ranks by pairs, with caps reported as incomplete.
These are handwritten parser/loopback observations, not provider compatibility.
The accepted integration target is direct HTTP cloud access; PhotoKit/local
library work does not meet that goal. Mail credentials or grants must not be
assumed to authorize Photos.

The local semantic importer uses explicit library namespace + UUID, never cloud
IDs or filenames. Stored people annotations, user keywords and generated labels
remain distinct; nullable person annotations and categorized place-name maps
follow the pinned OSXPhotos shape. Exported emptiness does not prove feature
support. GPS validates finite ranges and permits zero without geocoding. A
separate ten-asset read-only local sample confirmed named-people/GPS metadata
availability and cached place blobs, but did not decode places, inspect scene
labels, establish unique person identity or demonstrate live iCloud support.

### Direct HTTP upstream knowledge

[The pinned source research](photos-cloud-research.md) distinguishes icloudpd's
vendored `pyicloud_ipd` SRP/session path from picklepete/pyicloud. Reuse service
discovery, scoped zones, paired pagination and rendition mappings. The XMP
exporter supplies real Base64 UTF-8 caption and Base64 plist keyword/GPS
decoders; fields merely appearing in `desiredKeys` would be weaker evidence.
Preserve valid zero coordinates and missing/empty/malformed distinctions.
Neither reviewed Photos module implements person-name search; cloud metadata
filtering must report coverage and must not be described as server-side semantic
search. Existing MIT notices accompany substantial copied/adapted code.

The initial isolated cloud-record decoder verified these formats using Python
stdlib plist parsing alongside Bun. Its Python 3.9.6 authentication preflight
stopped before login/session creation. The accepted continuation supersedes that
route: Bun-native SRP, scoped cookies, bounded HTTP and plist decoding, with
project-local exact dependencies and no Python runtime requirement. Real terminal
account/2FA interaction is still needed. Authentication-only success will not
prove Photos metadata or person-search capability.

The native implementation's final offline verification passed 66 tests / 565
assertions under Bun 1.4.2, including independently calculated Ruby/OpenSSL SRP
answers and synthetic auth/2FA plus loopback reads. The current command is
`bun run cloud:probe --read` from `playground/photos` in the user's own terminal.
It authenticates and reads at most twenty private PrimarySync assets/two pages,
printing aggregate evidence only; no persisted session, image download or cloud
person search is provided. The album follow-up adds a capped one-response album
sample with explicit incomplete coverage plus exact-record-ID membership reads.
Neither ordinary albums nor names establish People annotations. Other library
enumeration and real-account album acceptance remain open. The
overall goal remains unfinished until cloud evidence and capability conclusions are
obtained; no credential or raw-response capture is required in these docs.

The finite `--people-schema` follow-up uses kei's pinned `/changes/zone` shape,
two pages/two hundred records maximum, empty-page `moreComing` semantics and
consistent zone ownership. It reports schema names/counts only; it never decodes
person names or person/photo joins. Synthetic verification is complete for this
probe. The remaining meaningful step depends on user terminal account/2FA input
and a sanitized real response; no reusable authenticated handle is verified.

## Calendar query completeness and mutation ordering

The [sequential Calendar experiment](calendar-feasibility.md#sequential-application-experiment-2026-10-03-utc)
uses actual ICS parsing and a synthetic application server to connect reading,
search/free-time/summary and personal-event CRUD. Its JSON discovery/query route
is not CalDAV discovery or provider-side search, and no live account was accessed.

An occurrence moved into a search window may have its original RECURRENCE-ID
outside that window. The fixture evaluates detached overrides by actual time
while retaining original identity. DATE end boundaries remain exclusive, with an
explicit UTC interpretation for this experiment. UTC/simple recurrence query
support does not inherit general timezone support from the separate synthetic
VTIMEZONE parser tests.

Free-time computation requires more than successful parsing. Expansion/resource/
result limits and unsupported semantics must expose incomplete coverage. A complete
text search can still omit busy events, and a complete narrow query cannot support
a wider availability window. The fixture records query coverage/filtering and
refuses these inputs; complete here means complete for the supplied synthetic
snapshot, not a remote calendar account.

Conditional mutation checks must occur against current state after asynchronous
request-body consumption. Review exposed a stale-check race; the fixture now
consumes the body before its uninterrupted precondition-check/mutation section,
and delayed-body create/update regressions preserve the competing successful
write. This in-memory ordering does not establish transactional behavior for a
production adapter. Lost responses still require reconciliation before retrying.

The personal-write fixture combines strong ETags with whole-resource scheduling/
recurrence rejection and identity-preserving edits. Conflict and no-retry tests
support that local policy, not provider notification behavior. See C1–C3 in the
[experiment register](experiments.md#calendar-sequential-exploration-2026-10-03-utc)
for observed results and the remaining live acceptance gates.

## Calendar protocol and full-operation boundaries

The [expanded acceptance matrix](calendar-acceptance-matrix.md) separates parsed
data, fixture protocol behavior and provider acceptance. Actual CalDAV XML over
loopback is stronger transport evidence than the earlier JSON fixture, but the
handwritten server remains unable to establish independent interoperability or
iCloud filtering/completeness.

Sync tokens commit with a completely validated replacement snapshot. A partial
multistatus or unsupported pagination must retain the old snapshot/token; an
invalid token starts a fresh sync. Following an uncertain write, exact readback
can establish desired state without establishing causation. Normalizing servers
may prevent byte equality even after a successful write, so unknown must remain
unknown and cannot authorize a blind mutation retry. The playground currently
lacks durable operation journaling and normalized comparison.

Calendar-level deletion has a wider concurrency boundary than event ETags. A
verified empty collection can receive another event before DELETE. In-memory
ownership and a preceding listing do not solve that race; the current collection
helper is fixture evidence, not a safe live shared-calendar deletion mechanism.

Scheduling serialization does not send an invitation or prove recipient state.
Likewise, Apple CalendarServer's historical sharing extension can guide local
request generation without proving current iCloud support. Real scheduling and
sharing need observed capabilities, identities, concurrency semantics and actual
delivery evidence. Preserve the distinction from personal-event editing, which
continues to reject scheduling-bearing resources.

The later dedicated live runner adds a private durable manifest and verifies
semantic event content on provider readback; this does not retroactively add
journaling to the generic client. Its first real calendar creation exposed a
bootstrap-origin versus shard-origin principal identity mismatch. Matching paths
alone were insufficient: authenticated shard current-principal and exact
calendar-home witnesses established the alias before reviewed exact-ledger empty
cleanup. A corrected fresh lifecycle then passed, and separate read-only checks confirmed
both test calendars absent and the original calendar count unchanged. Observed
ACL/invite properties were unavailable, so they did not establish privacy.
The live success covers one isolated UTC personal-series lifecycle, not
scheduling/sharing delivery, arbitrary calendars or complete Calendar support.

The extended provider run exposed three interoperability assumptions: sync can
include collection metadata, changed resources can be ETag-only and require
validated hydration, and calendar-multiget needed path-form hrefs where absolute
forms returned resource404. Treat exact collection rows separately and preserve
resource/ETag identity through hydration; do not weaken unrelated row validation.
The provider also returned the same resource for positive and guaranteed-negative
SUMMARY filters. Successful REPORT is not proof of text-filter execution: local
filtering needs a complete bounded snapshot and must report that server filtering
was ignored. Finally, semantically equivalent timezone normalization should not
be mistaken for byte preservation or a failed event update. These distinctions
were verified on six isolated live cases, not arbitrary provider behavior.

The actual organizer invitation showed another valid provider normalization: an
ORGANIZER principal alias appeared in the authenticated sender address set. A
post-write guard stop retained the acknowledged resource; reviewed read-only
identity reconciliation avoided a duplicate invitation. Mailbox delivery, user
RSVP screenshots and organizer PARTSTAT ACCEPTED are separate evidence channels
that together support end-to-end acceptance. Scheduling status1.1 alone did not
establish delivery or acceptance. A fresh sharing target's CS:invite404 prevented
POST; advertised sharing capability therefore still does not prove a completed
share or effective recipient access.
