# Direct HTTP iCloud Photos: upstream research

> Historical experiment commands and `playground/` paths below are retained as dated evidence. The prototypes were retired on 2026-10-07; use [current replacements and source history](research/retired-prototypes.md).

> **2026-10-04 closeout:** Experiments are closed. See [Photos capability plan](photos-capability-plan.md) for the authoritative current evidence, accepted local provider architecture, comparison limits and implementation phases. Older checkpoints below are historical.

Research date: 2026-10-03. Source inspection, offline cloud-record experiments
and Bun implementation with deliberately installed project-local dependencies.
Current evidence now includes bounded real-account direct-HTTP reads using the
user-created session cache. No browser automation, local Photos database access,
image binary downloads or cloud-photo mutations were used for these reads.

## Verified live outcome (2026-10-03)

### Direct-HTTP search enhancement bootstrap

The public Apple web client at
`https://www.icloud.com/system/icloud.com/2636Build34/en-us/main.js` exposes the
`GET https://setup.icloud.com/setup/ws/1/generateSessionIdToken` bootstrap.
The Bun `createSearchSession` helper implements that request and validates the
response. A live call using the saved account session successfully issued the
token; it remained in memory and was not printed or persisted. Device pairing
and a successful name search are **not** established by token issuance. One
focused compatibility test / 24 assertions passed. No browser automation or
existing browser-key extraction was used.

The `--people-schema` CLI now checkpoints a private account/zone-bound cursor
when `--session-dir` is supplied. A checkpoint advances only after the entire
page validates. Atomic 0600 files, the existing 0700 session directory, bounded
input and a single-writer lock protect custody; stale locks are not auto-deleted.
Malformed pages retain the prior checkpoint. No person-name decoder or fake
name matcher was introduced. Schema summaries describe each slice, not a
persisted full-library person index.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Same-image reference probe (bounded, not person identification)

The user supplied a 1280x720 JPEG and asked to locate that same image. Its
140-byte EXIF segment contains orientation, resolution, color-space and pixel
dimensions only; there is no capture-date tag. A provisional latest-20 cloud
sample was therefore used pending a date clue, without identifying any person
from appearance. The library had changed: those sample timestamps span
2026-10-03 19:55:22.769Z through 21:29:59Z, not the earlier September sample.

The new bounded thumbnail helper fetches only HTTPS icloud-content.com resources,
without account headers/cookies, redirects or third-party uploads, with 15-second
and 4-MiB per-image caps. Apple returned `application/octet-stream` with JPEG
data; the helper accepts that MIME only with JPEG/PNG signature validation.
Twenty thumbnails were fetched (2,532,844 bytes) and decoded by native AppKit;
a labeled, aspect-preserving contact sheet is ready for scene comparison. This
does not yet establish an exact-image match. One focused downloader test / seven
assertions covers request custody, host refusal and invalid response content.

Private temporary artifacts are retained under
`/var/folders/7q/rjwxsm_s54s17s8mn083p71h0000gn/T/icloud-exact-image-review-LfKnJO`
(0700 directory, 0600 images/mapping/contact sheet). The local task record names
the owner and retention reason. No signed URLs were persisted. The scoped-ID
mapping is private recovery material, not a report to publish; no cleanup was
performed while root comparison remains active.

After the first sheet showed no corresponding indoor scene, the authorized
follow-up fetched ranks20–59 (40 additional thumbnails, 3,201,686 bytes) using
at most four parallel requests. All decoded successfully. These assets span
2026-09-28 01:13:15Z through 2026-10-03 19:55:02Z. The probe stopped at 60 total
thumbnails; additional indexed sheets and private mappings remain in the same
directory pending root comparison. No broader image crawl or face matching ran.

Root compared all 60 thumbnails by scene content and found no matching supplied
indoor book/toy scene. The inspected range is September27–October3 in Toronto
time; this is not evidence of absence from the library. Aggregate thumbnail
transfer was 5,734,530 bytes. Network work stopped at that bound pending a capture
date or original filename. The private sheets include unrelated sensitive
screenshots and must not be linked in user-facing results, copied into the
repository or used as public evidence. Only aggregate findings are retained here.
The focused downloader verification remains one passing test / seven assertions;
no additional code changed after that test.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Apple's [Search on iCloud.com security](https://support.apple.com/guide/security/search-on-icloudcom-security-sec0057159bf/web)
describes trusted-device local indexes and an encrypted, approved search session.
This is a different protocol from the implemented CloudKit photo reads; it
explains a capability gap without proving the cause of any empty `people` field
or establishing that future Bun support is impossible. The local diagnostic
WIP has four passing isolated tests / 27 assertions, but remains unexecuted on
the user's database and is not the requested cloud search solution.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

`local-cloud-reference.ts` is a minimal Bun helper ready for an authorized
terminal with Photos-file access. It introspects known schema columns, reads
at most 20 recent rows for one exact existing person label in a readonly
transaction, excludes hidden/deleted/merged annotations, and creates a new
0600 reference file inside the existing 0700 session directory. It refuses to
overwrite an existing output. It emits counts only. The local schema is still
unverified on this machine because of the OS gate. No exporter was run live.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.


The supplied person label is matched exactly. If Photos stores a longer or
different label, this command can return zero rows; use the exact label shown
in Photos rather than assuming a surname.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.


This command must still be run in the user's authorized terminal; the agent did
not retry denied local DB access. Isolated helper verification: 3 tests /
14 assertions. No local-to-cloud join is yet established.

The matcher requires exact local `ZCLOUDASSETGUID` to cloud **CPLAsset** identity,
with filename and creation-date corroboration, within one private PrimarySync
zone. Local UUID or the OSXPhotos `cloud_guid` (a cloud **master** GUID) alone
does not prove an asset join. Source: pinned
[OSXPhotos cloud_guid](https://github.com/RhetTbull/osxphotos/blob/e6c8a9dcb9e6a0bc91eb9bf6951ec161bd2ab683/osxphotos/photoinfo.py#L1763-L1765)
and its Photos database asset/person joins. Two isolated helper tests / ten
assertions pass; live local comparison remains blocked on OS file access.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

People-field shape probes requested source-backed `people` and `facesVersion`.
`people` was an array on 300 sampled assets; a separate first-20 shape probe
confirmed those 20 arrays were empty. The extended zone-change probe read
20 pages / 1,672 records, all tombstones. One direct `CPLPerson` query hypothesis
returned HTTP 400. None of these results establishes that person search is
impossible; the usable name-to-asset protocol remains unresolved.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

```sh
bun run cloud:probe --month 2026-09 --start-rank 300 --session-dir "$HOME/.icloud-photos-session"
```

`scanCloudMonth` is a programmatic helper, not a CLI bulk-mode flag. It enforces
window, cumulative-byte and elapsed-time limits and does not label resumed EOF
or missing dates as complete month coverage. Rank pagination is not a snapshot;
concurrent library changes may shift results. No raw photo IDs, filenames,
person names, tokens or signed URLs were emitted by these live probes.

### Earlier bounded-read milestone

The user's native Bun login produced a saved session after the serializer fix.
An agent-run Bun harness loaded that session, validated it with Apple, saved
rotated state, and completed the existing bounded readers without prompting for
a password or verification code. The harness emitted only counts and fixed
diagnostics; it did not print session values or photo metadata values.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The `photos-read` failure after successful login was reproduced as a record-zone
identity mismatch: Apple supplies `ownerRecordName` and `zoneType` alongside
`PrimarySync`, while the initial request only named the zone. The readers now bind
the complete returned zone identity, preserve it in photo/metadata/album IDs and
subsequent queries, and reject cross-page owner/type changes and mismatched
master references. The same mismatch was reproduced and fixed in album and
change-schema readers. Safe fixed error reasons classify zone and record errors.

The complete Photos Bun suite passes 85 tests / 765 assertions. Regression
coverage includes full returned-zone binding, mixed record/reference owners,
cross-page owner/type drift, metadata identity and album identity. Earlier
sections below describe historical research and validation states.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Active Bun implementation goal

The accepted continuation is a Bun/TypeScript implementation of direct HTTP
authentication, bounded Photos reads and known metadata decoding. Python is not
a prerequisite or runtime dependency for this path. Earlier Python probes below
are retained historical experiments; their runtime preflight is not the current
blocker. Project-local dependencies are now deliberately installed for the Bun
implementation: `@foxt/js-srp@0.0.3-patch2`, `tough-cookie@6.0.2`,
`bplist-parser@0.5.0` and `fast-xml-parser@5.11.1`. Source inspection is not an
independent security audit.

| Bun dependency | Exact version | Purpose / license |
| --- | --- | --- |
| [@foxt/js-srp](https://github.com/foxt/js-srp-gsa) | `0.0.3-patch2` | Existing GSA/RFC5054 SRP implementation; ISC |
| [tough-cookie](https://github.com/salesforce/tough-cookie) | `6.0.2` | Scoped in-memory cookie jar; BSD-3-Clause |
| [bplist-parser](https://github.com/joeferner/node-bplist-parser) | `0.5.0` | Binary plist parsing behind bounded structural checks; MIT |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | `5.11.1` | XML parsing behind strict plist validation; MIT |

The experiment's lockfile pins transitive versions. Runtime use is Bun-only;
these dependencies do not install Python or change global toolchains.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The first read slice targets private `PrimarySync` photos; the album follow-up
adds bounded ordinary-album listing and exact-ID membership without waiting for
credentials. Other library/zone enumeration remains open. An executable login helper is
not goal completion, and offline tests do not close the live acceptance gate.

### Album continuation acceptance

The follow-up implements bounded ordinary-album listing and exact-ID membership
queries while terminal account access is pending. The pinned
`CPLAlbumByPositionLive` source performs one query with `zoneID`; it does not
establish ranked pagination for album records. Therefore album coverage must
remain explicitly unknown/incomplete unless supported continuation evidence is
obtained. A capped response is not proof of complete enumeration.

Album identity retains database, full zone and record name; display-name matches
must not collapse duplicate names. Root sentinels/deleted rows are excluded.
Names follow the upstream Base64 UTF-8 `albumNameEnc` format. Membership uses
`CPLContainerRelationLiveByAssetDate` with `parentId` STRING/EQUALS and the existing
bounded asset/master reader. Ordinary albums do not establish People annotations
or person-name search. Observable acceptance includes exact identity selection,
duplicate-name retention, scope rejection, explicit coverage, bounded responses
and membership filters verified against the pinned source, with synthetic tests
kept separate from real-account evidence.

## Goal and result

The accepted target is a package that talks directly to iCloud over HTTP and can
find photos by existing people annotations, tags and location. Local Photos
queries do not satisfy this target. The earlier [metadata experiment](photos-feasibility.md)
remains useful for parsing and resource selection, not cloud interoperability.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Pinned upstreams and reuse

| Source | Inspected commit | Role |
| --- | --- | --- |
| icloud-photos-downloader/icloud_photos_downloader | `879c561240d993d748ddb4546f935090502b16d3` | Primary protocol reference; bundles its own `pyicloud_ipd` fork |
| picklepete/pyicloud | `622cd160d8a259db644c8b3f3c96f76795a12f74` | Original comparison reference; different authentication implementation |

Both default-branch heads were resolved through GitHub's API during this research.
These names are not interchangeable: installing an arbitrary package named
`pyicloud` does not establish that it contains icloudpd's implementation. This
research does not audit every successor or fork.

Both repositories carry MIT licenses:
[icloudpd license](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/LICENSE.md)
and [pyicloud license](https://github.com/picklepete/pyicloud/blob/622cd160d8a259db644c8b3f3c96f76795a12f74/LICENSE.txt).
For copied/adapted substantial code, retain the applicable copyright and license
notice, including any file-specific notices. This slice copies no upstream code.
Protocol observations can guide a small new Bun implementation; maintain explicit
source attribution and provenance. No dependency was added.

## Authentication knowledge to adapt

icloudpd's active path validates a saved session first, otherwise performs SRP,
then exchanges session/trust tokens through `setup/accountLogin`. Account data
supplies `dsid` and `webservices`; Photos resolves `ckdatabasews` instead of
hardcoding an account's shard host.
[Authentication flow](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/base.py#L291-L375),
[service discovery](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/base.py#L888-L900).

The SRP handshake uses `/signin/init` and `/signin/complete`, SHA-256, a 2048-bit
group, RFC5054 behavior and omission of username from `x`. Apple selects `s2k` or
`s2k_fo`: password SHA-256 bytes versus hexadecimal text feed PBKDF2-HMAC-SHA256
with server salt/iterations. Preserve these details in deterministic compatibility
vectors; generic SRP defaults are insufficient. Completion includes `m1`, `m2`,
challenge `c` and remembered trust tokens; HTTP 409 can mean 2FA is required.
[SRP implementation](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/base.py#L377-L517).

Trusted-device code verification and `/2sv/trust` complete the trust lifecycle;
auth headers carry `scnt` and session ID. Persisting a cookie jar alone is not
the complete state model.
[Headers](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/base.py#L588-L613),
[verification and trust](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/base.py#L823-L886).
The HTTP session records response authentication headers, session JSON and cookies.
[Persistence](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/session.py#L80-L98).

By contrast, the inspected picklepete version sends a password to `/signin` and
then performs token login. Do not use that older path as the Bun SRP blueprint.
[Comparison authentication](https://github.com/picklepete/pyicloud/blob/622cd160d8a259db644c8b3f3c96f76795a12f74/pyicloud/base.py#L286-L363).
Mail's app-specific-password setup is not a demonstrated Photos authentication
path. Keep separate account/session custody and never emit raw tokens, cookies,
passwords, signed URLs or sensitive response bodies into diagnostics.

## Photos wire knowledge

| Layer | Observed upstream behavior | Pinned source |
| --- | --- | --- |
| Container | `/database/1/com.apple.photos.cloud/production/{private|shared}`; `/zones/list`; full zone identity | [endpoint and zones](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/services/photos.py#L394-L464) |
| Album membership | `CPLAlbumByPositionLive`; membership query filters on `parentId` | [albums](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/services/photos.py#L303-L365) |
| Pagination | POST `/records/query`; `startRank`, direction, record type, `resultsLimit = page_size * 2`, desired keys and zone | [query](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/services/photos.py#L582-L711) |
| Pairing | `CPLAsset.masterRef` joins `CPLMaster`; offset advances per yielded master, not raw row | [iteration](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/services/photos.py#L514-L559) |
| Renditions | Asset resource fields precede master fields; preserve size, checksum, download URL and media type | [versions](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/services/photos.py#L932-L967) |

These are private web-service observations, not a public Apple API contract. Keep
our existing bounded-reader protections, exact rendition selection and scoped
asset identity. Upstream's iterator assumptions do not validate shared-master,
split-page or concurrent-library-change behavior for our adapter.

## People, tags and places: evidence boundaries

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Apple documents a newer search mechanism using encrypted queries and processing
on trusted devices, with Allow Search authorization. The documentation covers
people, dates and locations but does not supply the direct HTTP protocol.
[Apple search architecture](https://support.apple.com/en-ca/126463).
Neither inspected Photos module implements this mechanism. Direct HTTP support
remains open research; do not replace the user's requirement with browser
operation or local database access. icloudpd documents ADP/security-key limits as
library limitations; they are not proof of universal impossibility.
[Upstream authentication limits](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/docs/authentication.md).

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The remaining live dependency is still an actual Apple account/password and
trusted-device interaction in the user's terminal. No authenticated session or
live handle has been verified. Preparing this additional probe does not resolve
that dependency or substitute synthetic responses for cloud acceptance.

## Runtime choice: Bun versus Swift

A whole-service Swift rewrite is not justified by this research. Direct HTTP in
Swift still needs the same private authentication, cookie/session lifecycle,
record contracts and missing people-search protocol. Native PhotoKit would be a
different local-library architecture and does not meet the accepted cloud goal.

Recommendation: preserve the existing service runtime and isolate Photos behind a
provider interface. Bun can own HTTP, the auth state machine and bounded records;
choose and test SRP and plist components explicitly. Swift is a possible narrow
helper for Foundation plist/native integration if that later reduces measured
maintenance work, not a prerequisite for iCloud HTTP. Python has the closest
reference implementation but adds runtime/package distribution if embedded. This
is an architectural recommendation, not an implementation or performance benchmark.

## Executed cloud-record decoder experiment

The [isolated cloud decoder](research/prototype-archive/photos.md) accepts synthetic
`CPLAsset` fields, preserves cloud database/zone/asset identity and decodes
`captionEnc`, `keywordsEnc` and `locationEnc` using the source-backed formats.
The first version delegated plist parsing to a small Python standard-library
helper, with no packages installed. Invented XML and binary plist fixtures include zero
coordinates, malformed values and extra timestamp/altitude/speed fields.

Observed with Bun 1.4.2 and Python 3.9.6: combined suite **29 tests / 150
assertions**; cloud-only suite **6 tests / 38 assertions**; `bun run cloud:demo`
completed. Independent review reproduced the combined result without blockers.
Bounds include 64 KiB per encoded field, 100 keywords, 512 characters per
keyword, a two-second helper deadline and 512 KiB helper output. This establishes
parser/helper interoperability only; no authenticated cloud response was read.

The Bun-native follow-up replaces subprocess parsing with exact local
`bplist-parser@0.5.0` and `fast-xml-parser@5.11.1` dependencies. Its targeted
suite passes **11 tests / 147 assertions** under Bun 1.4.2, including a check
that decoding invokes no child process. XML and binary structure limits cover
64 KiB inputs, depth 32, 4,096 objects, 8,192 visits and 256 KiB expanded
payload. Unsupported keyed archives/UIDs/sets and malformed metadata remain
explicitly invalid. Historical Python scripts are retained for reference only.
This establishes native known-format decoding, not real-account availability.

## Bun implementation and verified evidence

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Executed under Bun 1.4.2: **67 tests passed / 584 assertions** across ten test
files. This includes synthetic authentication/2FA HTTP transcripts, scoped
cookie and destination checks, real loopback HTTP, plist validation and both
Apple SRP password variants. The SRP expected answers were independently
calculated with Ruby/OpenSSL from the pinned pysrp/icloudpd formulas, including
minimal-byte `B=2`; no Python reference process or @foxt output generated those
answers. They establish formula compatibility, not Apple account acceptance.
`bun run cloud:probe --preflight` also completed with `pythonRequired:false`,
`credentialsRead:false` and `networkAttempted:false`. `git diff --check` passed.

The next real-account step is `bun run cloud:probe --read` in the user's own
terminal, from `playground/photos`. The command obtains hidden account/password
and, if needed, a trusted-device code and performs authentication plus the bounded
read in one process. Default output contains aggregate evidence; explicit
`--albums --show-albums` additionally prints bounded album names, exact record
IDs and scopes for local selection, followed by `--album-id` to read members.
Credentials, cookies and signed URLs are never printed or persisted. No actual
account login or cloud response has yet been obtained, and the overall goal
remains unfinished. See the [probe commands and limits](research/prototype-archive/photos.md#direct-http-bun-probe).

## Remaining acceptance and staged scope

Items below describe the full goal; the offline subset above is implemented,
while real cloud access, real-account album behavior and person-search acceptance
remain open.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The same missing account/2FA interaction has remained through native-client,
album and schema-probe continuation slices. No session was obtained or safely
reusable handle verified. After the finite probe is verified, more synthetic
fixtures cannot answer the remaining real-account questions; continuation needs
the user's terminal login and sanitized result, not another runtime installation.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The delivered cloud work is research plus an isolated decoder experiment.
Build/release/install/update/uninstall are unchanged and not acceptance
substitutes. No production adapter, MCP tool, deployment or live cloud test was
delivered. Verification includes pinned-source review, documentation readback and
the offline decoder results above; historical local probe counts remain separate.

## Authentication prerequisite probe and current stop point

The separate `playground/photos/cloud-auth-probe.py` is an authentication-only
helper: it does not access `service.photos` or read Photos metadata. It requires
an isolated Python 3.10–3.13 environment with icloudpd installed from the exact
pinned Git commit and verifies dependency provenance. It accepts only a new
external state directory, uses terminal-hidden account/password/OTP input,
disables keyring/logging and restricts directory/files to 0700/0600. A successful
future login must establish a trusted session; it is not Photos acceptance.

Six fake-client tests passed in independent review. The actual command:

```sh
python3 playground/photos/cloud-auth-probe.py \
  --state-dir /tmp/icloud-photos-auth-preflight-uncreated
```

exited 1 with `needs_user_help`: the observed Python 3.9.6 is below the required
range. No prompt, login or session directory was created; `photos_metadata_read`
was false. This is a verified prerequisite failure, not a failed Apple login.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Received-code failure diagnostic correction

The user reported receiving the trusted-device code and entering six contiguous digits,
then supplied a screenshot of two generic `needs-user-help` failures. This establishes
push delivery according to the user; it does not establish whether verification,
trust, the subsequent account login, service discovery, or a Photos read failed.
The old CLI catch discarded every safe error code and stage. That diagnostic defect
is fixed: failure JSON now exposes only a fixed local `stage`, allowlisted `reason`,
optional numeric `httpStatus`, `authenticationVerified`, and no-retry/read-verification
flags. Provider messages, bodies, identifiers, URLs, tokens and input remain suppressed.
An authentication-complete / Photos-failed result can now be distinguished from a
code-verification failure. Partial reads are never reported as verified success.

The pinned upstream verification request uses `Accept: application/json`; the Bun
verification POST now matches that value (the previous broader Accept value was not
proven to cause the user's failure). Payload, verification-to-trust ordering and
rotated session-header/token propagation match the inspected upstream flow. Offline
regressions exercise failures at verification, trust and post-2FA account login,
Photos discovery/indexing/read failures, and safe CLI serialization. No new real
account login was performed. The cause of the user's actual failure remains unknown;
the next user-run probe should provide the safe diagnostic JSON instead of requiring
another blind retry. Never send the code or credentials in chat.

### Opt-in Bun session reuse

`cloud:probe --read --session-dir "$HOME/.icloud-photos-session"` now persists
trusted cookie/auth-header state plus client ID and account binding, before any
Photos request. The versioned cache stores no password or OTP. It is a plaintext
bearer-secret file protected by 0700 directory / 0600 file permissions, outside
the repository; do not share it. No existing Mail database or keychain is used.

Restart sends one POST `/setup/ws/1/validate` with JSON `null`, matching the pinned
upstream flow. A 401/421 can attempt the saved token via `accountLogin`; only
classified authentication expiry permits fresh login. Network/server errors stop.
Successful reuse must match the saved DSID. Cache input is bounded and checked;
symlinks, hardlinks and unsafe ownership/permissions are refused. Writes use a
same-directory exclusive temporary file and atomic rename. Single directory means
single account, and no failed or untrusted authentication state is persisted.

Offline tests cover restart without prompts, persistence before downstream Photos
work, token fallback, error-stop behavior, account mismatch and filesystem checks.
These are simulated compatibility tests, not evidence of a real-account session.
The subsequent user-supplied terminal screenshot reports
`authenticationVerified: true`, `stage: session-save`,
`reason: session_cache_invalid`, and `photosReadVerified: false`. This is
user-reported real-account native authentication evidence; it does not establish
any successful Photos read or session reuse.

### Session-save serialization correction

The installed tough-cookie 6.0.2 serializer omits the `value` property for valid
empty-valued cookies (`name=`). The initial cache validator required a string
property for every cookie, so a legitimate HTTP response could authenticate
successfully and then fail before saving or reading Photos. This defect is
reproduced with synthetic HTTP Set-Cookie responses and the actual serializer.
It is consistent with the screenshot; no live cookie contents were inspected,
so the specific failing live cookie is not established.

The validator now accepts the serializer's omitted empty-string default while
retaining rejection of explicit null/non-string values, foreign domains and
oversized state. A regression runs native authentication against mocked HTTP,
exports actual Apple/iCloud cookie-jar state, saves and loads it on disk, resumes
with the correct iCloud-only cookie scope, and saves again. The focused store
suite passes 11 tests / 57 assertions; the complete Photos Bun suite passes
81 tests / 694 assertions. These tests are offline compatibility evidence.

Metadata-only inspection found the user's requested session directory present
with 0700 permissions and empty after the failed run. There is no saved session
to recover. The next user-run `cloud:probe --read --session-dir
"$HOME/.icloud-photos-session"` must authenticate once more before persisted
reuse and a bounded live Photos read can be verified. No password, OTP, cookie,
or token was read, logged or requested in chat during diagnosis.

### Direct search protocol enhancement (2026-10-03)

The Bun search bootstrap successfully obtained a `sessionIdToken` using the
saved authenticated session. The token was neither printed nor persisted.
Resumable zone discovery also advanced across two live invocations: 100 records,
then 200 additional records. These tombstones do not establish person coverage.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Integrated validation: 118 Bun tests passed, 936 assertions, 0 failures.
The HMAC tests include independent OpenSSL vectors and reject reflected proofs.
These are offline compatibility checks, not live device pairing.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

