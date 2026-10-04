# Engineering knowledge from the experiments

> Photos experiments closed 2026-10-04. The [capability plan](photos-capability-plan.md) supersedes historical cloud-only constraints and unresolved local-read claims below. No production Photos provider is implemented yet.

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
selected architecture. Calendar and other providers remain outside current scope.

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
