# Photos metadata experiment

> Photos experiments closed 2026-10-04. The [capability plan](../../docs/photos-capability-plan.md) supersedes historical cloud-only constraints and unresolved local-read claims below. No production Photos provider is implemented yet.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Bun experiment with project-local pinned dependencies. Offline demos need no
credentials; direct HTTP account access requires terminal authentication.

```sh
cd playground/photos
bun install --frozen-lockfile --ignore-scripts
bun test
bun run demo
```

The demo starts a temporary loopback fixture, lists three invented assets (two
share a filename; one has a Live Photo motion resource), prints metadata and
closes the server. Resource URLs use `.invalid` and are never fetched. An absent
thumbnail remains unavailable even when an original exists.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

See [Photos feasibility](../../docs/photos-feasibility.md) for source references,
acceptance criteria, strict paired-page limitations and observed test results.

Observed 2026-10-03 under Bun 1.4.2: **16 tests / 71 assertions passed**. The demo
returned three synthetic assets, requested ranks `0, 2, 3` and marked the read
complete after an empty page (2,126 response bytes). These results cover our
fixtures only. Capped reads explicitly report `complete: false` and
`truncated: true`; malformed responses, redirects and timeouts abort the run.

## People, tags and locations

```sh
bun run metadata:demo
bun run metadata:import -- my-library /path/to/local-photo-metadata.json
```

The importer takes a JSON **array of `PhotoInfo.asdict()`-shaped objects**, not
an arbitrary CLI export envelope. No OSXPhotos installation is required for the
synthetic demo. Import output can contain personal names and exact coordinates;
it prints to your terminal and is not uploaded.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Each field records provenance and `absent`, `empty`, `present` or `invalid`.
`empty` only means the export reported an empty value, not that the library or
OS supports the feature or that no such information exists. Unsupported older
Photos versions can export an empty generated-label list. Person lists preserve null entries as unnamed annotations; these do not
establish an identity. Place names preserve the source category-to-list map. Nested place fields retain their own states.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

A separate bounded live probe can inspect the local library's **availability
counts only** without printing names, UUIDs, locations or paths:

```sh
python3 probe-local.py --limit 10
python3 probe_local_test.py
```

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Cloud wire-format decoder experiment

```sh
bun run cloud:demo
bun test cloud-metadata.test.ts
```

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Historical result under Bun 1.4.2 and Python 3.9.6: the combined suite passed **29 tests /
150 assertions**, and the cloud demo completed. This demonstrates parser and
stdlib-plist interoperability only, not cloud authentication, account field
availability or server-side keyword/person/location search.

Native decoder follow-up under Bun 1.4.2 passed **11 targeted tests / 147
assertions**, including the earlier stored binary/XML fixtures and malicious
structure bounds. These are offline format tests, not captured iCloud responses.

## Direct HTTP Bun probe

The implementation entrypoint is `bun run cloud:probe`. Run these commands from
`playground/photos`; the account commands require your own interactive terminal:

```sh
bun run cloud:probe --preflight
bun run cloud:probe --auth-only
bun run cloud:probe --read
bun run cloud:probe --albums
bun run cloud:probe --albums --show-albums
bun run cloud:probe --album-id
bun run cloud:probe --people-schema
```

Preflight reads no credentials and makes no network requests. Account/password
and any trusted-device verification code are entered without echo; do not pass
them as arguments or paste them into chat. Sessions are memory-only by default.
To reuse a session across commands, select a private directory outside the repository:

```sh
bun run cloud:probe --read --session-dir "$HOME/.icloud-photos-session"
```

Run the same command on subsequent attempts. A trusted session is saved before the
Photos request, so a later Photos failure does not discard authentication. Reuse
first validates the saved session; expired cookies may be renewed with the saved
session token. Only classified authentication expiry prompts again; transport or
server errors stop without triggering another login. One directory holds one account;
use a different directory for another account. Its existing parent must exist and
its path must not contain symlinks.

The directory is mode 0700 and the session file is mode 0600. This file contains
reusable bearer cookies/tokens and account identity, is **not encrypted**, and must
not be shared. No password or verification code is saved. Without this flag, each
command authenticates anew. Earlier memory-only runs cannot be recovered; one new
successful login is required. Server expiry/revocation can still require login/2FA.
`--auth-only` can populate this cache; it is not a prerequisite to `--read`.
Before prompting for a six-digit trusted-device code, the probe makes one
explicit push request. A successful request does not guarantee that a device
displays a notification. A failed request stops with `two_factor_push_failed`
without retrying or prompting for a code. An already-running older probe must
be stopped and restarted to use this fix; its session exists only in memory.
The push fix passed 67 tests / 584 assertions; independent review reran 12
targeted tests / 110 assertions without blocking findings. Live push delivery
and authenticated cloud reads remain unverified.
SMS verification, repair-required (HTTP 412) flows, China-region service routing
and the Advanced Data Protection access handshake are not implemented in this
initial probe. Saved sessions do not bypass these access requirements.

The read selects the private `PrimarySync` zone at the discovered `ckdatabasews`
endpoint, checks indexing, then requests at most two photo pages/twenty assets.
It does not enumerate all libraries or shared zones. Cumulative response bytes
are capped at 2 MiB and the Photos read deadline is 30 seconds. The strict
asset/master paired-page subset fails on split pairs/shared masters rather than
guessing associations. Photo-read output contains aggregate evidence, never raw metadata,
identifiers, filenames or signed resource URLs. It downloads no images, edits
no library data, and does not implement person-name search.

`--albums` authenticates and reads a capped ordinary-album response from private
`PrimarySync`, returning aggregate counts only. The library API `readCloudAlbums`
retains decoded names and full database/zone/record identities, including albums
with duplicate names. Default CLI output prints neither names nor IDs. Explicit
`--albums --show-albums` includes up to twenty album names, record IDs and library
scopes in your terminal so you can select an ID; these are personal metadata,
and sharing the list is not needed for reporting test evidence. This option
prints no session tokens, cookies, raw response bodies or signed URLs. The upstream album
query provides no established pagination protocol, so this initial one-response
sample always reports `complete:false`, including empty samples, and returns at
most twenty albums. It does not imply complete library enumeration.

`--album-id` prompts without echo for the exact PrimarySync album
record ID from that explicit listing, then authenticates and queries its members
with the same two-page / twenty-photo bounds. Callers can also use the library
APIs for selection within one authenticated session.
Membership uses the source-backed `parentId` predicate, not an album-name match.
Ordinary album membership does not prove People annotations or person search.

`--people-schema` authenticates and samples private `PrimarySync` change records
through `/changes/zone`: at most two pages, one hundred records per page and two
hundred records total, with a 2 MiB cumulative response limit and 30-second
deadline. Output contains record-type names, counts and field names, never field
values, record IDs, continuation tokens or raw responses. Tombstones are counted
separately. With `--session-dir`, validated tokens persist in a private account-
and zone-bound cursor for resumption; empty pages with `moreComing:true` continue.
Only `moreComing:false` establishes a caught-up response; hitting a cap reports
incomplete coverage.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Historical integrated native verification under Bun 1.4.2: **67 tests passed / 584
assertions** across ten files. SRP expectations for `s2k` and `s2k_fo` were
computed independently with Ruby/OpenSSL from the pinned protocol formulas,
including the minimal-byte public-key edge. Authentication tests are synthetic;
HTTP reader tests use injected/loopback responses. Preflight completes without
credentials/network, and these tests do not establish successful Apple login.
