# Photos preparation: bounded metadata experiment

> **2026-10-04 closeout:** Experiments are closed. See [Photos capability plan](photos-capability-plan.md) for the authoritative current evidence, accepted local provider architecture, comparison limits and implementation phases. Older checkpoints below are historical.

Current direction: direct HTTP access to iCloud Photos, without browser automation
or local Photos database access. See [the pinned upstream research and cloud
experiment acceptance](photos-cloud-research.md). The local experiments below
are historical feasibility evidence and do not satisfy the cloud search goal.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Question and acceptance

Can a small Bun reader preserve photo identity and explicit rendition selection
from upstream-shaped records, while bounding a paginated metadata read?

Acceptance: colliding filenames retain distinct scoped asset identities; master
references join correctly; thumbnail, original and Live Photo motion remain
separate; missing thumbnails never select originals; malformed/missing records
fail explicitly. Real loopback requests must advance by paired assets rather
than raw rows, report caps as incomplete, and stop on invalid JSON, oversized
responses, redirects and timeout. No account credentials are necessary.

## Source and candidate paths

The handwritten reader follows the field names and query structure observed in
[icloudpd photos.py at 879c561](https://github.com/icloud-photos-downloader/icloud_photos_downloader/blob/879c561240d993d748ddb4546f935090502b16d3/src/pyicloud_ipd/services/photos.py).
`PhotoAlbum._list_query_gen` uses
`CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted`, `startRank`, ascending
direction, `resultsLimit = page_size * 2` and a zone ID. Assets reference masters
through `fields.masterRef.value.recordName`. Resources expose size, download URL,
checksum and a separate file-type field. Resource fields on assets take
precedence over the same role on masters.

This is source research and a new TypeScript implementation, not execution of
the upstream Python library or a documented Apple Photos web API. The fixture
uses invented identifiers, filenames and `.invalid` resource URLs. It is not a
captured response and does not establish iCloud interoperability.

- [Apple PhotoKit](https://developer.apple.com/documentation/photokit) is the
  supported native-framework candidate for a local Photos-library bridge, with
  explicit user authorization. It requires a native host; this Bun spike does
  not exercise PhotoKit, macOS permissions or iCloud-backed asset availability.
- [icloudpd](https://github.com/icloud-photos-downloader/icloud_photos_downloader)
  explores the unofficial web-session route, with account authentication, 2FA
  and session lifecycle requirements. Mail's app-specific password is not
  assumed usable for Photos. No password, session or account configuration is
  read here. The library's documented ADP/security-key limitations describe that
  library, not an Apple-wide impossibility: Apple documents trusted-device
  approval for temporary web access under
  [Advanced Data Protection](https://support.apple.com/en-ca/102630).

## Bounded contract and limitations

Identity is database (`private`/`shared`) + full string-valued zone ID + asset
record name. Master record name is retained separately. This differs from
upstream's master-based `PhotoAsset.id`; filenames and signed download URLs are
never identity. Resource selection requires an exact role, with no fallback.
Signed URLs are only metadata and are never fetched or printed by the demo.

The narrow paired-page subset requires exactly one master per asset in the same
page and rejects missing/orphan/duplicate/shared masters. Upstream advances once
per master; in this validated subset that equals the asset count. Split-page
joins, shared-master semantics, concurrent library changes, sync tokens and
resuming capped runs remain unverified. An empty page marks fixture exhaustion;
a nonempty page hitting a cap is explicitly incomplete even if it might be last.

The client accepts only a loopback port and builds its own fixed query path.
It accepts no credentials, hostname, headers or external URL; rejects redirects;
and limits page size, pages, items, cumulative response bytes and total time.
Byte limits apply while streaming response bodies. All failures abort the run
without returning partial data as complete or retrying another page.

Standalone-video thumbnail mapping (upstream uses `resVidSmall`), albums/search,
image rendering, downloads, edits, uploads, deletes, native
PhotoKit integration and live authentication remain deferred. Any production
integration needs a separate provider choice, credential custody design, explicit
Photos authorization and read-only account acceptance. Existing Mail grants
must not implicitly authorize Photos.

## Reproduction and observed outcome

Run `cd playground/photos && bun test` and `bun run demo` (no dependency install).
On 2026-10-03, Bun 1.4.2 passed **16 tests / 71 assertions**, including streamed
and cumulative byte caps, timeout, repeated pages, redirects and explicit
cross-zone-reference rejection. The demo returned three synthetic assets across
three requests with ranks `0, 2, 3`, 2,126 response bytes and `complete: true`
only after the empty page. Its metadata output includes no resource URLs.
All fixture listeners are closed in `finally`; no files or account state are
created by the suite/demo. No production checks or live-provider acceptance are
implied by this experiment.

## Local semantic metadata experiment

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Bounded live local evidence

The separate dependency-free Python probe reads an existing local Photos SQLite
database using URI `mode=ro`, `query_only`, a read transaction and a two-second
query deadline. It accepts only the expected schema and a unique keyword join;
unknown layouts fail explicitly. It neither copies nor changes the database,
installs a provider, fetches photos nor emits personal metadata values.

```sh
python3 playground/photos/probe-local.py --limit 10
python3 playground/photos/probe_local_test.py
```

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

