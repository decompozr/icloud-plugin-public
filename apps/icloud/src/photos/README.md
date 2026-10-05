# Photos module

Optional macOS local Photos provider in the shared Bun runtime. Existing mail
configuration and policy are unchanged. osxphotos 0.77.2 reads synced local
metadata; native PhotoKit performs supported album operations and asset deletion;
Photos scripting applies title, description, keywords and favorite values.
SQLite is never used to mutate the Photos library.

## Remote workflow and helper responsibility

The owner reviews photos through the assistant conversation. For true Shared Albums,
use the account-bound iCloud API first; osxphotos/PhotoKit reads are fallback and
must be labeled as local synced snapshots. For local-library metadata and person
queries, osxphotos remains primary; the Swift Helper supplies missing operations.
Unknown writes are reconciled by reading the retained operation, never resubmitted
through a different backend. Cloud membership verification is distinct from binary
download and independent device observation.
The custom native catalog reviewer and its command/build/launch paths are removed.
Historical review journals remain readable. Native system permission prompts and
the isolated Apple posting candidate are separate from remote daily review.
All photo/album operations must enter through the main MCP. Computer control,
GUI scripting and browser/native UI automation are excluded. The Helper is a
programmatic operation backend; provider scripting is not permission to drive UI.
create_album creates an ordinary album, not a Shared Album. True Shared Album
creation, rename, synthetic upload, content read/removal and deletion have been
verified through the existing MCP and account-bound API on runtime 0.1.56.
Participant/access operations still require separate live acceptance.
A disposable test album means an artifact we clean up by its recorded exact ID
afterward, not Apple's automatic-expiry option. Do not create an ordinary album
as a substitute or upload personal photos merely to test.
Current delivery and live acceptance follow the active capability plan; earlier
dated paragraphs below preserve historical evidence, not current workflow.

## Shared Album provider setup in development

The latest experimental web lifecycle is registered in the main MCP as
photos_shared_albums, photos_shared_prepare, photos_shared_apply and
photos_shared_operation. It uses the verified invocation account, existing Photos
scopes and sealed web session. Remote Shared Album IDs differ from local IDs;
never translate them by matching names. Explicit experimental prepare/apply covers
creation, rename and deletion of empty owned legacy candidates. Separate server
readback is required, with no blind retry. Candidate participant/access changes and exact shared-copy removal use the same
reviewed lifecycle and source-derived Apple request builders. Candidate uploads now bind explicit source representation and digest to reviewed
plans, retain dispatch stages and recover through read-only membership checks.
Unexecuted uploads can be cancelled; full Live Photo pairing, subscriber writes
and real lifecycle acceptance remain pending. Source contracts and fixture tests do not
prove successful live writes; consult the dated capability plan for deployment evidence.

The private Admin displays the actual verification method. An SMS challenge must
use the latest SMS code for that request; trusted-device pop-up codes use a
different verifier. New trusted-device bridge verification requires a live
connection and is not supported by serializing socket-free metadata. The accepted
SMS session is retained; passwords/codes are not saved. Native daemon access was
explicitly rejected for missing entitlement in the diagnostic, so the authorized
web fallback is used without modifying the existing operation Helper.

The private owner System page includes a separate account-bound web-session
connection for the API-only Shared Album provider. Explicit setup provisions a
private optional Python 3.12 environment with pyicloud 2.7.0 and rich 15.0.0;
`photos.web_python` may select an existing compatible environment instead. This
does not modify the osxphotos environment or rebuild the signed operation Helper.
Passwords and verification codes are accepted only in private owner requests,
not MCP arguments, logs or storage. Sanitized session/challenge material is sealed
in account-bound encrypted custody; disconnect and credential rotation prevent
stale completions from restoring revoked sessions. No browser cookies or Keychain
credentials are imported. Login and setup do not grant OAuth scopes or perform
photo operations. Status reports authentication separately from management
readiness; real Apple login/2FA and Shared Album operations remain unverified.
This is additional authorization on the existing account, not a second account
or custom MCP. It is an experimental web-provider choice, not a requirement for
local Photos reads. The existing Admin sign-in uses the owner's passkey and has
no Apple password field. macOS 27 provides native Shared Album creation,
customization and posting sheets, but those require user-operated UI and are
excluded from this remote/no-computer-control workflow. Installed public PhotoKit
and Photos scripting interfaces do not expose complete headless management.

## Nonshipping posting research

SharedAlbumNativeInterfaceProbe.swift in playground/photos is a separate,
nonshipping native-backend investigation. It enumerates installed private runtime
declarations without constructing services or invoking operations. MSASConnection
has Shared Album lifecycle/access methods; authenticated access and usable payload
contracts remain unverified. Private methods are not supported PhotoKit APIs and
must not be exposed as production capabilities on this evidence alone. Follow the
latest native-backend section of docs/photos-capability-plan.md; the existing
signed operation Helper is unchanged.

The operation Helper build includes only PhotosHelper.swift. The macOS 27
posting-window experiment and its journal writer live under playground/photos;
neither is compiled into or dispatched by the production Helper. Historical
journal readback remains supported in TypeScript. The standalone picker probe
and posting experiment are research evidence, not a supported remote upload.
Typecheck the retained experiment without launching it:

```sh
xcrun swiftc -parse-as-library -swift-version 6 -typecheck apps/icloud/src/photos/native/PhotosHelper.swift playground/photos/SharedAlbumReviewExperiment.swift playground/photos/SharedReviewJournalExperiment.swift -framework Photos -framework PhotosUI -framework AppKit
```

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
applied; the first write error or failed readback stops the batch immediately.
The operation remains unknown and includes exact per-item outcomes, with remaining
assets marked `not_attempted`. Opening a different library rejects the plan before
any write; correct the library and prepare a newly reviewed plan.

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

Oversized fingerprint groups are split into bounded review parts, each with at
most 1,000 IDs. Continuation parts retain the first source as a reference so even
a final single new source has comparison context. `groupAssetCount`, `groupPart`
and `groupParts` expose original-group coverage; `total` counts review parts plus
other candidates. Follow `nextOffset` to retrieve every part. UUID ordering is
stable for an unchanged local snapshot; concurrent library changes still require
fresh reconciliation. An exact remote subset can exclude an already-reviewed
reference; omitted source counts remain explicit. None of this proves byte or
motion equivalence or approves deletion.

Cleanup pages also include messaging-style filename signals. They do not prove
application origin or that an image is unneeded. `offset` and `nextOffset` support
review beyond the first page. Fingerprint evidence is not an exact-byte duplicate
claim; age does not decide screenshot expiry or value. Video/Live Photo detail
includes motion flags; the native review labels still thumbnails as incomplete.

## Remote review and historical native recovery

Helper-owned setup, comparison, cleanup and sharing UI text is English-only,
per owner preference. This does not rename library assets or albums. Apple-owned
picker/permission/posting sheets follow macOS language settings.

Permission setup lives in the owner admin page as three steps: library access,
Photos Full Access, then actual permission recheck. Buttons act on the service Mac.
Only explicit owner clicks request access; no independent helper setup window
is exposed. The operation Helper remains responsible for Apple-owned permission prompts and
supported native operations. Historical posting journals remain readable. The admin checks both selected-library
readability and native authorization; Photos permission alone does not prove
sidecar/Full Disk Access.

`photos_review_prepare` accepts `{kind:"comparison",assetIds:[...],albumId}`
(at most twelve exact sources), or `{kind:"cleanup",offset,limit}`. It returns
source details and comparison/cleanup evidence for a remote conversation, with
bounded coverage and omitted-source counts. Cleanup accepts optional exact
`assetIds` subsets from the requested candidate page to review large groups across
batches; unknown or off-page IDs are rejected. It never opens a native window.
Use `photos_preview` to display labeled source and relevant candidate images in
that conversation. Missing previews stay unresolved; motion thumbnails cannot
establish video/Live Photo equivalence.

`photos_review_record` saves explicit owner decisions with `reviewId`,
`confirm:true` and one decision per exact source: undecided, keep, share_review
(comparison) or delete_review (cleanup). It rejects substitutions, duplicates,
missing sources, wrong-purpose decisions and other owners. Finalized decisions
are immutable; identical retries return the saved result. Use a new prepared
review for an owner-requested revision. No decision executes or approves a write.
`photos_review_status` reads remote drafts and finalized records without native
access, and continues to reconcile historical native sessions. The public
`photos_open_review` tool is removed; historical state remains retained.

`photos_review_summary` accounts for up to 500 exact IDs across batches. It
separates unreviewed, undecided, keep and further-review decisions, using the latest
finalized review creation for the same owner, purpose and comparison destination.
Pending/cancelled and legacy selected-only records make no decision. Coverage
refers only to supplied IDs and saved decisions, not a fresh library snapshot or
proof of sharing. `allSourcesReviewed` can be true while undecided sources remain.
The packaged `icloud-photos` client skill documents this workflow and exact
confirmation/recovery boundaries.

Finalized selections persist in SQLite; a retained private manifest recovers
allowed selections if the launch response was lost.

Remote `post_to_shared_album` preparation and apply are rejected with
`remote_shared_album_posting_unavailable` before opening any native UI, including
older prepared plans. The user-presented Apple posting implementation remains
an operator candidate for missing provider capabilities, not an accepted remote
workflow. Ordinary album and metadata tools retain their reviewed prepare/apply
contract. Never substitute an ordinary album or claim cloud posting acceptance.

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

