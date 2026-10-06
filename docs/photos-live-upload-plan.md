# Live Photo upload: experiment, knowledge and implementation plan

## Refreshed metadata accepted; native owner review pending — 2026-10-06

The owner subsequently declined to operate any UI. The current supported public
native path requires an exact picker selection and a separate human sharing action;
the loaded original MCP exposes no established headless motion-preserving posting
path. This is the concrete external blocker, rather than a metadata or permission
failure. Latest durable status remains review_pending with the Helper alive; no
picker result or posting completion is recorded. Retain the operation and its
interlock for reconciliation. Do not claim cancellation or silently replace the
owner action with automation, another MCP, direct CLI or still-only upload.

The new native receiver's subsequent automatic turn loads photos_prepare with
the explicit nativeUI opt-in. Original-MCP health verifies native authorization
3/true. Exact source readback confirms the approved original Live Photo remains
intact and unshared. The retained local true Shared Album is empty; a fresh cloud
membership read is complete, stable, empty, private and owner-only.

The original MCP prepared an exact one-source nativeUI plan. After reviewing the
source and destination, the receiver applied that operation once. Durable status
is review_pending with a live native Helper and the exact manifest source. Owner
interaction with the official picker and sharing window is now required. No
posting completion, destination membership or iPhone Live playback is verified.
Private receipts retain the exact operation, source/destination and turn IDs.
Do not relaunch or create another plan while this operation remains unresolved.
The earlier metadata blocker is resolved for this loaded sharing declaration;
connection type and 0.1.60 deployment provenance remain separate unknowns.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Native reincarnation continuation: metadata blocker revalidated — 2026-10-06

The distinct native receiver consumed the full packet and recorded sole ownership.
A subsequent automatically recovered same-thread turn performed original-MCP
health, source and destination reads. Authorization remains 3/authorized=true;
the approved original source remains livePhoto=true/shared=false. Local membership
is empty, and a fresh complete, stable cloud snapshot is empty, private and
owner-only. No prepare/apply or posting UI was invoked.

The loaded photos_prepare declaration still omits nativeUI and advertises remote
posting rejection. Read-only installed payload inspection now finds the running
service at 0.1.60, whose registration still requires explicit nativeUI. This
version differs from the earlier 0.1.58 deployment receipt; the receiver did not
perform that update and does not extend the old receipt's integrity or source
claims to this version. Bounded available plugin discovery did not resolve the
connection type or exact backend identity. No supported refresh/rescan tool was
found, and no actual held/rejected update was observed. The external prerequisite
remains updated host-advertised metadata through the applicable existing
connection Refresh or published-server Rescan/Live-definition path below.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Fresh tool discovery and destination readback — 2026-10-06

Fresh loaded tool discovery still advertises the legacy remote-posting rejection
and omits nativeUI from photos_prepare. Original-MCP health independently verifies
native authorization 3/authorized=true and the same system-library scope. Process
readback still identifies the installed 0.1.58 service. Native permission is ready;
the host-advertised sharing contract remains an unavailable prerequisite. No new
prepare or apply was attempted against that undeclared field, and no UI opened.

The original MCP re-read the approved existing source as livePhoto=true and
shared=false. Exact local destination readback returns zero assets. A fresh cloud
membership read completed with a stable, complete snapshot, zero shared copies,
private access and owner-only participation. This independently confirms the
retained test destination is empty; it does not establish sharing or Live playback.
Exact source, local/cloud destination and read identifiers remain private.

Available plugin-management capabilities provide no refresh/rescan operation.
Bounded plugin discovery did not resolve this existing connection's backend ID or
whether it is a direct custom connection or published plugin. That absence is not
an access denial or evidence of a held update. The applicable next host step is
the existing connection's Refresh and a new conversation for direct custom MCPs,
or its connected server's Rescan and Live-definition inspection for published
plugins, per the official links below. Resume posting only after loaded
photos_prepare explicitly declares nativeUI; preserve the same main MCP and
destination. No alternate authenticated CLI, metadata patch or second MCP is an
accepted workaround.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Native permission verified; conversation tool-definition mismatch — 2026-10-06

The owner completed the Mac permission prompt. Actual original-MCP health now
reports authorization 3/authorized=true with the same library scope. Local process
inspection confirms the running service is 0.1.58. Pure local inspection of its
installed tool registration exposes nativeUI=true in the shared-post intent and
the updated description; no account operation was made through that inspection.

One read-only original-MCP prepare attempt included the deployed opt-in field,
but returned remote_shared_album_posting_unavailable, with no operation ID or UI.
The conversation's tool description/schema still lacks that field, even after the
owner reported reopening the conversation. The reason is not conclusively traced:
a cached/held client definition or argument normalization is an inference, not a
verified server input trace. Do not claim that the owner failed to refresh.

[Official connection metadata instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata)
require refreshing a directly connected custom MCP and then starting a new
conversation. Reopening this existing conversation is not that final step. For
published plugins, [hosted tool updates](https://developers.openai.com/plugins/deploy/submission#update-to-your-mcp-server)
use scanning/review; old definitions can remain live while an update is held.
No portal scan/review result was inspected, so no rejection or held update is
being claimed for this plugin. Do not create another MCP, read tokens for a direct
CLI call, remove UI opt-in, or rewrite account permissions to bypass this gap.

Continue in a fresh conversation with the existing connection, first checking
that photos_prepare advertises nativeUI. Reuse the exact source/destination IDs
in private .flow-runtime/native-sharing/state.json; do not create another album.
Prepare once, review the returned exact plan, and confirmed apply may open the
user-operated picker/share flow. Sharing, cloud membership and iPhone Live playback
remain unexecuted. Photos authorization is now satisfied; tool-definition acceptance
is the remaining prerequisite to invoking this candidate through the host.


## Installed native sharing candidate; owner activation pending — 2026-10-06

PR 61 merged the existing-asset native sharing candidate; PR 62 corrected the
plugin/application version mismatch caught by the guarded main build. Verified
remote main eb58aae36f889ba7a049f4457d78a75f07f502fe produced installed 0.1.58.
A fresh main-source build and 426 tests / 2903 assertions passed. The existing
runtime drained normally; its private stopped backup passed two SQLite integrity
checks. The configured Helper app was updated at the same path from source-hash-
verified signed output; original app and release remain available for rollback.
Configuration, master-key and installation-marker hashes are unchanged, and both
current SQLite databases pass integrity checks. No credentials, routes or grants
were rewritten. Exact receipts/backups remain private.

Actual original-MCP health succeeds with the same osxphotos library scope. The new
ad-hoc Helper currently reports native authorization 0/false. Its normal existing
--authorize entry point was launched to request real macOS consent; no permission
was forced or fabricated. Owner action in the Mac permission prompt remains
required and must be verified through the original MCP before posting.

This conversation still exposes the old photos_prepare schema without nativeUI.
The owner was asked to refresh the existing connection/tool list, not create an
additional connector or account. Do not inject the new argument into the stale
schema or use an authenticated CLI/standalone app as a Photos-operation workaround.
No picker/posting session or photo sharing has occurred. The dedicated test album
remains empty; creation/readback is not evidence of sharing or Live playback.

Retain private .flow-runtime/native-sharing/state.json and deployment-receipt.json
for the exact existing source, destination, backup and next activation check. The
main-build/artifact/helper staging paths are temporary deployment artifacts and
can be removed after their receipts and authoritative knowledge are preserved;
the active original task worktree and live destination remain needed for acceptance.


## Official existing-asset sharing candidate — 2026-10-06

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The existing main MCP created Live Photo Share Test once. Its retained operation
reached applied with serverReadbackVerified=true, private access, owner-only
participation and zero assets. Subsequent local inventory also resolved its true
Shared Album identity. Preserve this empty destination for the pending experiment;
do not recreate it. Exact cloud/local album and operation IDs remain private.

Implemented a source candidate using existing tools, scopes, packaged Helper and
durable operation/review records:

- post_to_shared_album requires explicit nativeUI=true through remote tools.
  Default/legacy requests remain rejected without opening UI. Prepare reads/probes
  one existing source and a true Shared Album, without addAssets or media export.
- Apply rechecks the snapshot, reserves launch identity and flushes the source
  manifest. A final server policy/owner check runs immediately before Helper launch.
  Unknown launch outcomes cannot cause relaunch.
- The official picker must return the same exact asset. Different/empty selections
  never post. Exact results journal item-provider presence. A separate local user
  action opens PHSharedAlbumPostingViewController; picker callbacks never post
  automatically, including the ambiguous preselected-cancel case.
- Pre-post sessions expire after five minutes. Cancellation, journal failures,
  actual destination and completion remain explicit. Completion is not membership,
  cloud sync or Live playback proof. Once opened, the user operates Apple's official
  sheet; this is assisted sharing, not headless publication or automated UI control.

The revoked generator, fixture intent, import branch and fixture-only tests were
removed from the candidate. Both task-created standalone media directories were
removed after the probe processes exited. No generated photo was ever imported
into the Photos library or shared. The historical generated-media experiment did
produce a valid PHLivePhoto after correcting a MakerApple key, but is no longer an
implementation path or acceptance dependency. No further generation is authorized.

Self-checking covers TypeScript, native Swift, application build and existing/new
operation tests; final counts are recorded in the capability plan. An initial
packaging test raced a concurrent dist build; sequential validation after build
resolves that fixture-path failure. Verification is by the same agent, not an
independent reviewer. Picker/preselection acceptance and Live sharing remain live
checks, not inferred from compilation or mock tests.

Activation remains pending. The installed original MCP still advertises its old
schema and Helper. Do not inject nativeUI into that schema or run a separate native
app against the library. Main-source server deployment and a signed Helper update
through the existing process are required, with configuration, credentials,
consent identity and rollback preserved, followed by same-connection tool refresh.
No merge, release, Helper replacement or deployment occurred in this slice.

Retain the new empty album and private operation/source state for the pending live
experiment. Source bridge implementation remains reviewable in this active task
worktree. Generated media and fixture-only probe executables/harness are removed;
completed raw logs can be removed after committed knowledge readback. Do not retire
this worktree or discard live album identities while deployment/acceptance remain.

## Sharing-service discovery runtime experiment — 2026-10-06

The owner reaffirmed focus on sharing existing photos to iCloud Shared Albums.
Ran a small local public AppKit discovery executable against a synthetic NSImage,
without accessing Photos, requesting authorization, presenting a window or calling
perform(withItems:). NSApplication activation policy was prohibited. The source
only enumerated sharing services, constructed a standard share menu item without
showing it, and checked the named cloudSharing service for input compatibility.
This local synthetic experiment is not a substitute account-operation connection.

Swift 6 compilation succeeded with a deprecation warning for
sharingServices(forItems:); the recommended standardShareMenuItem was also created
successfully. Execution exited 0 with no stderr. For this synthetic NSImage, the
registry offered Add to Photos along with generic sharing services, but no Add to
Shared Album service. The named cloudSharing service existed and returned false
from canPerform(withItems:) for this input.

Apple documents [cloudSharing](https://developer.apple.com/documentation/appkit/nssharingservice/name/cloudsharing)
as item-provider iCloud/CloudKit sharing, not Photos Shared Album publishing. The
installed NSSharingService header says inputs must be pasteboard-writing objects,
NSItemProvider or NSDocument, and performing a service usually shows a window.
An available generic service or an Add to Photos import action cannot be promoted
to an existing-photo Shared Album publish operation.

Limit: service availability is input- and environment-dependent. This test used an
NSImage without personal media, not an existing Live Photo or a Photos-provided
item provider. It does not rule out other registered services for other inputs or
Photos.app-specific share behavior. No UI fallback or actual sharing was tested.

The next meaningful sharing experiment remains the official PhotosUI posting
controller with genuine picker results, including whether preselected existing
photos work and retain motion. Keep osxphotos for source discovery and local
readback. Do not redesign this requirement as export/import, generic CloudKit
document sharing or an ordinary-album operation. Same-MCP integration, journaled
selection/destination and explicit actual-result readback are prerequisites to a
live posting experiment.

The task-owned .flow-runtime/share-service-probe directory contains only this
completed synthetic source, executable, module cache and logs. After committed
knowledge readback, remove that exact directory; no live operation or recovery
dependency exists. No third-party service was selected or invoked.

## Existing-asset sharing and conditional UI experiment — 2026-10-06

Owner clarified that the goal is sharing existing Photos assets, not designing a
standalone file uploader. Headless is preferred; an explicit official native UI
is now allowed as a last fallback. This supersedes earlier absolute no-UI language
for that bounded fallback only. It does not authorize computer-control click
automation, hidden posting, a second MCP, arbitrary personal test sources or
automatic publication. The original MCP remains the account-operation entry point.

Fresh experiments used the existing macOS SDK and Swift 6 typechecker with task
sources/module cache in ignored .flow-runtime/share-interface-experiment. Three
probes were typechecked, not linked or executed:

| Probe | Actual result | Knowledge |
| --- | --- | --- |
| Construct posting controller from supplied PHPickerResult array and album identifier | Exit 0 | The public official-UI constructor is available in the installed SDK. |
| Supply an existing PHAsset directly as the posting item | Expected exit 1: conflicting element types PHPickerResult versus PHAsset | This public constructor does not take PHAsset directly. |
| Construct PHPickerResult() ourselves | Expected exit 1: no accessible initializers | The public result cannot be fabricated from a source ID by this route. |

The first checker expected the word unavailable for the last negative probe;
Swift instead reported no accessible initializers. The checker was corrected
against retained diagnostics and all three expected outcomes verified, without
repeating compilation. These are SDK contract results, not actual posting tests.

Original probe source SHA-256 values (in table order):
`d072a4e6d5c053eccc005d2e9f078c6322ef2870008cd30c093557869cf57d2d`,
`3f65aefd3a4657d30f1a028dd2182cc89ed4e2dd71eb71948d410ab424b8b899`,
`e8fcdfa8893ba336282e9ae2dd2786e1f3da7cd5cc073463dead71eac2d9c3cb`.

The public Shortcuts CLI list command completed successfully: five existing
shortcuts were listed. The only name-matched Photos candidate was a JPEG conversion
shortcut. Its internals were not inspected or run; name matching alone is not an
exhaustive action inventory. No existing verified sharing shortcut was identified,
and converting Live Photos to JPEG cannot satisfy the sharing requirement.
No shortcut was imported, modified, signed or executed.

Apple's [preselectedAssetIdentifiers documentation](https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/preselectedassetidentifiers)
and [WWDC21 picker explanation](https://developer.apple.com/videos/play/wwdc2021/10046/)
state that preselected results lack actual item-provider data. This is a concrete
gap for programmatically selected sources, not proof the posting controller will
reject them. Its acceptance of such results remains a live UI experiment.

Next official-UI slice: integrate a bounded experiment through the existing Helper
and MCP prepare/apply/status lifecycle, with exact source/destination identities,
a durable journal before presentation, explicit user cancellation, selection and
destination-change detection, and no relaunch/retry after unknown posting. Use
actual PHPickerResult values; do not extract/rebuild the existing Live Photo or
invent constructors. If preselected results are not accepted, require the owner
to reselect the exact asset to obtain a real result and explicitly report that
interaction cost. Opening a picker or a posting callback is not success: verify
actual destination content, cloud/cross-device presence and Live playback separately.

The currently loaded MCP rejects native posting and the production Helper has
no posting UI implementation. Therefore this experiment did not open a UI or share
a photo; an isolated native executable is not an authorized substitute for the
existing-main-MCP route. Exact personal source/destination review and the bounded
runtime integration remain prerequisites for that live slice. Private backend
research remains available read-only; no private service mutation was attempted.

After committed knowledge readback, remove the exact task-owned experiment
directory (three tiny sources, logs, summaries and compiler cache). No prototype
is integrated into production or needed for live-operation recovery.

## No-UI automation surface comparison — 2026-10-06

Owner requested investigating AppleScript, Shortcuts/App Intents, native private
frameworks and private web APIs. Investigation is read-only; the public-native-only
implementation preference remains. Listing a private candidate below does not
authorize using it or changing permissions. No application was launched, shortcut
run/imported/signed, Apple event sent, account request made or photo published in
this research slice. Only CLI help, bundled definitions and public docs were read.

| Surface | Evidence | Headless Live Photo -> true Shared Album status |
| --- | --- | --- |
| Photos AppleScript | Fresh inspection of installed Photos.sdef (Photos 12.0, build 911.0.134) exposes generic add-to-album, import, ordinary album/folder creation, export and slideshow commands. It has no shared-specific type or publish command. | No documented shared mutation route found. Generic `add` is not proof of Shared Album support. Runtime Apple event behavior was not tested because it may launch Photos or request automation permission. |
| Shortcuts / App Intents | Apple's CLI supports running existing shortcuts, but actions can pause for user input. Apple publishes a photos.postToSharedAlbum schema with album, assets, files and comment; its perform implementation is app-owned. | Promising surface, not verified. Schema existence does not grant access to Apple's Photos action, prove macOS availability, guarantee headless behavior or preserve Live Photo motion. |
| Native private frameworks | Prior retained declaration-only probe found MSASConnection shared mutation selectors; Photos carries restricted service/write entitlements. No service call or authenticated mutation was verified. | Technically suggestive, excluded from the current public-API implementation. Selector names cannot establish access or operation semantics; never copy restricted entitlements or impersonate Photos. |
| Private iCloud web API | Prior same-MCP synthetic still upload/readback/removal evidence exists. Current public web bundle inspection in E2 identifies a single-file receipt publication builder. | Headless still publishing has evidence; paired Live Photo publishing does not. Excluded from the current public-native-only implementation, with no new session/login or speculative mutation. |

Fresh local inspection host: macOS 27.0.1, build 26A434.
AppleScript definition SHA-256:
`821bd81909c2d19f6a26f125a4dc7b3d42bc44928fee535b25ede9003a44c121`.
Source: `/System/Applications/Photos.app/Contents/Resources/Photos.sdef`.
The absence of shared terms narrows the documented surface, not every possible
undocumented application behavior. No repeated direct PhotoKit add experiment or
resource reconstruction was attempted; the fresh rejection above remains evidence.

### Important new App Intents finding and its limit

[Apple's postToSharedAlbum schema](https://developer.apple.com/documentation/appintents/appschema/photosintent/posttosharedalbum)
describes an action that an app implements; the sample leaves `perform()` for the
developer. It is not a system Photos service invocation API. Writing that schema
in our Swift Helper would not supply Apple's missing publication backend.

Fresh local JSON action-metadata inspection found no posting action in the inspected
Photos app, public Photos/PhotosUI framework trees or SiriPhotosAppIntentsExtension.
The extension lists `SiriPhotosAppIntentsExtension` and `UpdatePhotoWarmthTool`;
the Photos app's widget metadata lists widget configuration intents only. Extension
metadata SHA-256: `5bfea69105b8eaeab641c204b54bd6522f2681d42f1ab28941fd82f9eb5f7ccc`.
This bounded inventory does not cover every dynamically registered action or iOS;
do not conclude that all current Photos actions are unavailable.

[Apple's Shortcuts CLI guide](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac)
confirms command-line invocation and explains that input-seeking actions wait for
the user. CLI help was read successfully; no shortcut was run. A process timeout
would not prove a dialog never appeared, so do not execute an uninspected posting
shortcut just to see whether it is headless.

### Revised next experiment and acceptance

Prioritize a verified Apple-provided posting action over inventing an App Intent
backend. First obtain a read-only action definition or exported exact shortcut
showing action identity, platform availability, fixed destination, original Photos
entity input, execution mode and absence of picker/share-sheet/confirmation steps.
No raw-image coercion is accepted as proof of Live Photo preservation. Do not
import a third-party shortcut, browse the editor or use internal WorkflowKit execution
APIs to satisfy this discovery step. If no public no-UI creation/invocation route
or already-established compatible shortcut is available, record that missing input.

Only after that structural gate, and through an explicitly integrated existing-MCP
path, may a separately reviewed exact-source/destination one-attempt test proceed.
It must verify one shared asset with motion and separate iPhone playback; CLI exit
0 is not acceptance. Authentication prompts, locked-host behavior, cancellation and
unknown outcomes need explicit handling without permission bypass or retry.

Current conclusion: no public fully headless, motion-preserving Shared Album route
has been verified. Shortcuts is an unresolved candidate; AppleScript offers no
documented shared publishing contract, direct PhotoKit is rejected for the tested
targets, and the two private alternatives remain outside implementation scope.
Research produced no temporary media, vendor copies, new runtime or live operation
requiring cleanup/reconciliation. Detailed historical private-native observations
remain in the capability plan; they were not rerun or promoted to current acceptance.

## Fresh same-MCP native preflight — 2026-10-06

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

This verifies the current direct-add route rejects both observed destinations,
not that every Apple API or every other album/OS is incapable. The earlier native
permission uncertainty is resolved for this current health call. Cloud membership,
iPhone delivery and Live playback were not tested because no add was dispatched.
The no-UI/public-API constraints remain unchanged; the assisted PhotosUI route is
not an automatic fallback. Native direct-add remains unsupported for these targets.

## Superseding owner decision: public native API only — 2026-10-06

The owner now requires TypeScript MCP -> local Swift Helper -> public PhotoKit
for this Live Photo feature, preserving the original PHAsset instead of exporting
and publishing a HEIC/MOV pair. Nonpublic iCloud upload APIs are excluded from the
new implementation path. This decision supersedes the paired network-transfer
phases below; their experiments remain historical knowledge, not the active plan.
It does not authorize removing or changing unrelated existing cloud capabilities.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Apple also documents a public, user-presented posting controller,
[PHSharedAlbumPostingViewController](https://developer.apple.com/documentation/photosui/phsharedalbumpostingviewcontroller),
which takes PHPickerResult items, and a
[SwiftUI posting sheet](https://developer.apple.com/documentation/swiftui/view/photossharedalbumpostingsheet(ispresented:items:defaultalbumidentifier:photolibrary:completion:)).
These are candidate assisted paths, not headless `PHAsset` insertion methods.
Neither is live-verified for this feature. The existing remote-only/no-native-reviewer
constraint remains in force; do not open a sheet or automate its controls under
the new public-API preference alone. Default album selection is not proof of the
actual posted destination.

Active feasibility order:

1. Through the existing MCP and production Helper identity, resolve an exact
   local true Shared Album and read its current `.addContent` capability and
   Photos authorization. Do not recreate the retired reviewer or a second MCP.
   If the existing tool surface cannot expose this bounded probe, first plan a
   read-only same-MCP probe; do not use a direct authenticated CLI workaround.
2. Only if capability is true, resolve an exact owner-reviewed source PHAsset,
   require the Live Photo subtype, and prepare a one-attempt direct-add operation.
   If false, record unsupported and stop direct-add; do not force `addAssets`.
3. After an authorized add, verify destination content locally, then separately
   collect owner iPhone presence and Live playback evidence. Preserve original
   assets and distinguish local membership from cloud/cross-device acceptance.
4. Expose direct-add as a supported MCP feature only after those gates pass.
   Person selection continues to use established metadata; no new PhotoKit face
   recognition or nightly scheduling capability is implied.

Current status: architecture preference accepted; historical direct-add rejection
found; no fresh native probe, upload, deployment or playback test performed. If
public direct-add remains unavailable, public assisted posting needs an explicit
change to the remote-only interaction requirement, or this feature stays unsupported.

## Scope and current result

The owner requested experimentation, conversion of results into durable knowledge,
and then an implementation plan. The intended eventual behavior is one Live Photo
in an exact true Shared Album, with its still and motion preserved. This stage
changes documentation only. It does not implement, deploy or perform an upload.
The existing main MCP remains the sole account-operation route; no GUI automation,
temporary MCP, direct authenticated CLI or live-ledger patch is permitted.

Experiments ran on October 5, 2026 America/Toronto (October 6 UTC), against source
baseline `3544a8de164f66cbb0dd145a5c1a9bf7eae5161d`, on the isolated
`investigate-live-photo-upload` branch. The primary checkout remained on main.

## Experiments and evidence

### E1: Can the current reader preserve motion when both resources exist?

An offline probe injected a synthetic osxphotos object with original still and
motion paths, a Live Photo flag and one scoped identity. Both files existed in a
temporary synthetic library. The files were arbitrary fixture bytes, not valid
JPEG/MOV media. osxphotos and its version were mocked; this is reader-contract
evidence, not installed-provider or media-pairing acceptance.

| Request | Observed outcome |
| --- | --- |
| Original representation, no mode | `upload_live_photo_choice_required` |
| Original representation, `paired` mode | `upload_live_photo_choice_required` |
| Original representation, `still` mode | One resource descriptor, `livePhotoStillOnly=true` |

The existing focused unittest
`ReaderTests.test_upload_source_requires_explicit_representation_and_live_photo_choice`
also passed with the osxphotos module mocked. No dependency was installed. The
probe confirms that merely adding a motion path cannot enable the current pipeline.
The public intent schema additionally accepts only the literal `still` mode.

### E2: Does the current public web client expose a paired publication contract?

Fetched Apple's public `photos3/current/en-us/ui.main.js` and `main.js` without
account credentials or cookies. Inspected text only; did not execute vendor code.
The current URLs were checked rather than assuming the historical Build18 bundle
remained current. Retained structural observations:

| Bundle | Bytes | SHA-256 |
| --- | ---: | --- |
| ui.main.js | 1723799 | `389b79c2ba8630a86743e9057b7c8cf2dbcbfc3a83c0fc0cc20e044c33380796` |
| main.js | 983208 | `74b756597b131b1bce0c4542c1961d3af18cfc6686acfacd91229860349a1164` |

The inspected shared publication builder supplies one `singlefileupload` receipt,
filename, album GUID, asset GUID, batch metadata and time zone. The library upload
builder separately supplies `singleFileUploadRequest`; it is not evidence for
Shared Album pairing. The read models contain `resOriginalVidComplRes`, and the
asset helper recognizes a Live Photo using positive `vidComplDurValue`.

**Result: inconclusive for paired writes.** A read model containing a motion
resource does not establish a write contract. No paired publication builder was
identified in this bounded inspection. Identifier searches and a single-file
builder do not prove that Apple has no other paired-upload endpoint or encoding.
No arbitrary payload, ZIP/LIVP archive or two-file upload was submitted to Apple.

Public sources: [UI bundle](https://www.icloud.com/applications/photos3/current/en-us/ui.main.js),
[transport/model bundle](https://www.icloud.com/applications/photos3/current/en-us/main.js).
These mutable sources are experimental interoperability evidence, not supported
API documentation. Recheck their hashes before relying on later observations.

### E3: What supported source-resource semantics are available?

[Apple's Shared Album format documentation](https://support.apple.com/en-us/148676)
explicitly includes Live Photos, with different format/resolution behavior for
version 27 and earlier systems. Product support does not prove web API support.
[PhotoKit pairedVideo](https://developer.apple.com/documentation/photos/phassetresourcetype/pairedvideo)
identifies original motion; `fullSizePairedVideo` identifies current motion.
[osxphotos 0.77.2 exporter source](https://rhettbull.github.io/osxphotos/_modules/osxphotos/photoexporter.html)
uses `path_live_photo` for original motion and `path_edited_live_photo` for edited
motion. These sources establish candidate extraction routes, not live extraction
from the owner's library. Edited still and original motion must not be mixed.

## Knowledge and unresolved gaps

- K1: Shared Albums support the intended product format; the current reader,
  staged source and reviewed publication pipeline do not implement paired upload.
- K2: Original and edited pairs require distinct resource selection. Filenames,
  common directories and the library Live Photo flag alone do not verify that the
  actual binary resources form a valid pair.
- K3: Current cloud membership parsing returns asset/master identities. It drops
  motion evidence, so current membership success cannot verify Live Photo success.
- G1: An account-bound paired publication protocol, its receipt semantics and its
  remote motion readback remain unverified. This blocks paired network dispatch.
- G2: Valid-media pair identity checking, edited-resource semantics and missing
  resource handling need an extraction experiment. E1 used invalid media bytes.
- G3: The three previously selected private sources are not identified in the
  current handoff. The prior cloud inventory did not resolve testing and included
  an unsupported album identifier. An exact writable destination must be resolved
  before any live upload; never silently create a replacement destination.

## Implementation plan derived from the gaps

The task owner executes each bounded phase and self-checks it. Later transport
details remain provisional until G1 is resolved. Do not advertise `paired` in MCP
before the end-to-end contract exists.

| Phase | Change and dependency | Observable acceptance |
| --- | --- | --- |
| 1. Resource feasibility | Prototype original/edited pair extraction and binary pair-identity inspection using valid synthetic media. osxphotos first; programmatic PhotoKit only for a supported missing-resource fallback. No account publication. | One identity yields exactly one still and one matching motion resource; mismatch, missing motion and original/edited mixing fail. No private-library mutation. |
| 2. Publication feasibility | Investigate Apple's account-bound paired write representation using primary protocol evidence. If public evidence remains insufficient, propose a separately bounded main-MCP diagnostic before account testing. No guessed write payloads. | Exact request/response and receipt semantics identified, with one destination asset identity and observable motion readback. If unresolved, retain the gap and do not implement network dispatch. |
| 3. Pair staging | After phase 1, introduce a tagged single/pair server-owned descriptor and stage both resources atomically. Update reader, upload-source, provider and cleanup contracts. Keep external paired capability disabled pending phase 2. | Both resources retain private permissions, size/digest/role/representation/verified pair identity. Partial failure releases only newly staged task bytes. Missing resources never fall back to still. |
| 4. Durable paired transfer | After phases 2–3, extend shared intent, plans, companion ledger, binary actor and publication builder through existing account custody and scopes. | Separate durable claims for every transfer and final publication; lost responses never resend either resource or publish again. Cancel/expiry/revocation reconcile both staged resources safely. Existing still uploads retain their behavior. |
| 5. Motion readback | Extend shared cloud readback using the confirmed protocol, not just asset membership. | One exact shared asset has the expected still and associated motion evidence; absent/mismatched/unreadable motion cannot report paired success. Job completion, server presence and owner playback remain separate evidence. |
| 6. Delivery and live acceptance | After relevant checks, use the established main-source release/install workflow when authorized; refresh the same MCP schema. Resolve exact source/destination before owner-approved live upload. | Running version and paired tool schema verified; one upload observed as one Live Photo through cloud readback and separate cross-device playback. Unknown writes are read-reconciled, never retried. |

### Next ready slice: valid-media resource experiment

Owner: current task agent. Editable scope: an isolated experiment and resulting
knowledge in this document; no production upload changes yet. Inputs: existing
declared media tooling and a synthetic still/motion pair carrying matching binary
identifiers, without importing it into the personal library. Inspect available
tooling first; do not add a global runtime or dependency to make the probe run.

Bound the experiment to original pair, edited pair, missing motion and mismatched
identity cases. Accept only results that inspect actual media metadata; placeholder
bytes and equal filenames do not qualify. If available tooling cannot create/read
valid pairing metadata, record that specific unmet input and revise the experiment.
In parallel in a later slice, investigate G1 read-only before any network mutation.

### Whole-outcome acceptance and scope reconciliation

Paired upload is accepted only when the exact reviewed representation appears as
one playable Live Photo in the intended true Shared Album. Source originals remain
unchanged. Existing still-only sharing continues to require explicit choice.
Tests must cover pairing mismatch, missing/edited resources, partial staging,
revocation, lost transfer/publication responses, readback without motion, cancellation
and cleanup of both components. Fixture checks alone are not live upload acceptance.

This stage delivers experiments, knowledge and a plan. Production implementation,
build/release/install/update and live acceptance are deferred until their phase
prerequisites hold; uninstall is not applicable. Participant invitation/removal
remains separate and requires the exact recipient. The previously selected three
photos remain pending exact identification; their sharing consent does not supply
an unspecified test source or recipient. No public-link setting is part of this work.

## Prototype disposition and recovery

E1's temporary synthetic library was removed by its context manager. E2 retained
no downloaded vendor code; inspection stayed in memory. A compact raw JSON summary
was task-owned in ignored `.flow-runtime/live-photo-upload/evidence.json`. Its
material results, hashes and limitations are preserved above; after document
readback and the local milestone commit, remove that exact summary. No worker or
background process remains. Retain this document and the linked authoritative
capability plan. Future valid-media prototypes must record ownership and remain
outside production; remove them after their findings and reproducible constraints
are reconciled. There is no interrupted upload or live recovery dependency from
these experiments.
