# Photos module

Optional macOS local Photos provider in the shared Bun runtime. Existing mail
configuration and policy are unchanged. osxphotos 0.77.2 reads synced local
metadata; native PhotoKit performs supported album operations and asset deletion;
Photos scripting applies title, description, keywords and favorite values.
SQLite is never used to mutate the Photos library.

## Setup and permissions

Run `bun src/photos/setup.ts /absolute/private/photos-runtime` from apps/icloud.
This explicitly provisions an isolated uv/Python 3.12 environment and compiles a
Swift helper; no global default changes. The destination must be private and empty;
existing runtimes are never overwritten, including helpers without a venv.
Use `--python /absolute/existing/python` to reuse an already validated Python 3.12
environment with osxphotos 0.77.2 and photoscript 0.6.1 without installing dependencies.
Use `--sign "SIGNING_IDENTITY"` for an operator-selected signing identity. The default
is ad-hoc signing; it does not establish stable update consent. Setup verifies the
signature and writes a private `runtime-manifest.json` with source/executable hashes
and the designated requirement. This records build provenance, not runtime acceptance.
A failed setup retains `.setup-in-progress` and partial output for diagnosis; use a
new destination rather than retrying over those files. Configure the optional `[photos]` block
shown in config.example.toml. The library must be selected explicitly; writes
require the system library, and scripting additionally requires the open library
be that library. Full Disk Access for the host and Photos/Automation permissions
are distinct. Dependency installation never happens in an MCP request.

When Photos is configured, the owner setup/admin page includes permission status,
Request Photos Access, Open Photos Privacy Settings, Open Full Disk Access, and
Check Permissions Again. Buttons open settings on the service Mac, including when
the owner uses a phone. Direct settings links open on the viewing device. If a
shortcut is unavailable, use System Settings > Privacy & Security manually.
Only explicit clicks request access; opening settings never counts as permission
granted. The owner must approve the macOS prompt. Automation may be requested
separately when editing metadata. This UI has build and automated test coverage;
live onboarding and native writes still require verification on the host.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Receiver follow-up: source now includes macOS 27 user-presented posting and native
comparison/cleanup review windows. The original authorized helper is preserved;
the separately rebuilt preview app initially reported not-requested. Ad-hoc
signatures change with the executable and permission continuity must be rechecked
without weakening signing requirements. Native setup exposes request-access,
Photos/Full Disk Access shortcuts and actual authorization recheck. The launched
setup command returned `setup_opened`, but UI automation could not observe a
window (`cgWindowNotFound`); user-visible native UI acceptance remains pending.
No receiver upload, personal mutation or installed service change has occurred.
The experimental preview app and compiler-check executable were stopped/removed
at the owner's request. Only the original authorized development helper remains;
no preview is waiting for permission.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Read and write tools

Read: health, persons, query, albums, detail, preview, compare_album,
cleanup_candidates and operation. IDs bind a canonical library path and UUID;
album IDs also distinguish ordinary/shared types. Queries normalize case and
whitespace in existing labels, require offset-bearing date bounds and explicitly
return ambiguous labels. Pages describe the current local snapshot; offset
pagination is not a stable server snapshot across concurrent library changes.

Writes: prepare/apply for create_album, rename_album, delete_empty_album,
add_to_album, remove_from_album, set_metadata. Metadata values replace the named
fields; omitted fields are untouched. Keywords replace the entire keyword list.
Separate delete_prepare/delete_apply accept exact asset IDs. All operations
require a durable preview plan, explicit confirmation, matching owner, current
policy and an unexpired unchanged precondition snapshot. Applied or unknown
operation IDs cannot execute again. Native writes read back local state;
this never proves iCloud upload completion. Metadata batches can be partially
applied; the operation remains unknown and includes per-item outcomes.

Scopes are photos.read, photos.write, photos.delete. Delete cannot be invoked
with only ordinary write consent. Changes require explicit configuration and
OAuth consent; old mail grants do not expand. The operation ledger is owned by
Photos within the application database and survives restart. It contains private
asset metadata and must be protected like the rest of application state.

## Shared Albums and cleanup

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Cleanup currently produces fingerprint groups and screenshots for review only.
It does not classify blur/expiry or assume WhatsApp material is disposable.
Fingerprint matches do not establish Live Photo motion equivalence. Deletion uses
Photos' normal delete operation and never empties Recently Deleted. No automatic
delete follows a comparison or cleanup query.

Cleanup pages also include messaging-style filename signals. They do not prove
application origin or that an image is unneeded. `offset` and `nextOffset` support
review beyond the first page. Fingerprint evidence is not an exact-byte duplicate
claim; age does not decide screenshot expiry or value. Video/Live Photo detail
includes motion flags; the native review labels still thumbnails as incomplete.

## Native review workflow

`photos_open_setup` opens permission controls on the service Mac. It never requests
permission until the owner presses the native request-access button. The existing
owner web setup continues to verify both selected-library readability and native
authorization; Photos permission alone does not prove sidecar/Full Disk Access.

`photos_open_review` accepts either `{kind:"comparison",assetIds:[...],albumId}`
(at most twelve exact source assets), or `{kind:"cleanup",offset,limit}`. The
native window shows source previews, up to two candidate previews and reasons.
Missing previews remain explicit and sources without previews cannot be selected.
If candidate groups exceed the twelve-asset window, the response reports omitted
assets; use their exact IDs in subsequent comparison reviews rather than silently
claiming the whole group was reviewed. `photos_review_status` returns durable
selected IDs. Saving selections changes no photo and does not approve deletion.
Finalized selections persist in SQLite; a retained private manifest recovers
allowed selections if the launch response was lost.

Prepare sharing using `{action:"post_to_shared_album",assetIds:[ONE_ID],albumId}`
with a real Shared Album ID. `photos_apply` with explicit confirmation opens a
native preview, exact preselected picker and final posting review. The owner
presses Post in Apple's sheet after checking its actual destination. Changed
selection or pre-post cancellation ends the operation. No bulk posting is enabled.
Preselected picker results have empty item providers; live acceptance by the
posting controller is still unverified.

`photos_operation` or `photos_shared_review_status` reads persistent UI progress
and the actual destination. Native records are exclusive 0600 append-only journals
in an owner-owned 0700 directory, with flushed unknown-outcome state before
posting. Runtime reserves each operation UUID before launch; launch timeouts and
crashes never cause automatic relaunch. Same-source unresolved sharing cannot be
replanned to another destination to bypass recovery. Pending/unknown native sharing
blocks other library writes until reconciliation. Records include a process ID;
status uses a non-terminating liveness probe and conservatively treats PID reuse
as still alive. No arbitrary process is killed during reconciliation.

After the owner identifies the corresponding shared copy, first read its detail
and membership in the actual destination. `photos_record_shared_observation`
records an explicit owner report with exact shared ID, album ID, device,
content-review extent and a short note. It rechecks local shared membership and
rejects conflicting native destinations, still-live/unknown-liveness sessions,
or still-only review of video/Live Photo motion. It records `owner_verified_presence`,
`evidenceSource:"owner_report"`, and separately `crossDeviceObserved`.
`serverSyncVerified` and `operationCausedUploadVerified` remain false: neither
the source-to-resized-copy relationship nor direct server upload is inferred
from a filename, callback or owner testimony. A presence report never re-executes
the original operation. Without this evidence, preserve the unresolved record
and avoid retries. Cloud acceptance requires clearly attributed separate
cross-device/authoritative evidence, not compiler or local database success.

CLI review state is under `stateDirectory/shared-reviews`; the shared runtime
uses `photos-shared-reviews` beside its configured master-key directory. Keep
manifests, journals and the operation database private and retain unresolved
records through restart/update. Setup compiles all native sources and links
Photos, PhotosUI and AppKit; it does not install new global defaults.

## Verification

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

