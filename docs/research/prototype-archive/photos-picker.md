# Photos picker input experiment

> Historical research archived on 2026-10-07. Commands and prototype paths below describe the original experiment, not supported commands in the current checkout. See [retirement and current replacements](../retired-prototypes.md).

> **Shared Album writes parked (2026-10-06).** Ordinary Photos is restored; publication experiments remain stopped. Historical running/pending instructions below are superseded. See [consolidated evidence, unresolved challenges and resume checklist](../../photos-parked.md).

Standalone macOS 27 AppKit/SwiftUI application for comparing two public Photos inputs for up to twelve user-selected existing Live Photos:

1. `PhotosPickerItem(itemIdentifier:)` using each selected item's own local identifier.
2. A `PhotosPickerItem` actually returned after the operator selects those assets in Apple's picker.

Both inputs use `loadTransferable(type: PHLivePhoto.self)`. The private JSONL journal records supported content types, identifier equality, transfer success, Live Photo dimensions, public item equality, and bounded/redacted NSError chains. The picker supports multiple selection and an explicit Add/Done step. Each actual selection is paired with an identifier-created input for that same photo; no prior filename lookup is required. Comparison completion retains a summary window with a Done button.

This is exploratory code, not part of the production plugin, MCP tool registration, Helper build, operation ledger, or deployed release. It has a separate bundle identity and macOS Photos consent. It does not link the production Helper. Default diagnostic modes contain no mutation or sharing invocation. An explicitly authorized `postingTest: true` mode retains the actual picker item and exposes Apple's sharing sheet for a human-operated publication test. It requires the exact existing Shared Album UUID, validates its subtype, and requires an explicit button before opening the sheet. It never presses Post, creates an album, exports/imports media or retries an uncertain posting session. Reading via Photos can cause the OS to retrieve an existing asset's media; no media is written by the experiment. A successful Live Photo load does not prove sharing, preservation after sharing, or cloud/iPhone delivery.

## Build

Run from this worktree:

```sh
playground/photos/picker-input-experiment/script/build_and_run.sh --build-only
```

The bundle is staged under the ignored `.flow-runtime/native-sharing/picker-input-experiment` directory. This compiles and ad-hoc signs the standalone app; it does not install or update the service. Rebuilding may require renewed OS consent. Never rebuild a running experiment or terminate another process to start it.

## Run an explicitly authorized live experiment

Create an owner-only request file containing a new UUID `sessionId`. Create a real, owner-only evidence directory with mode 0700. Keep actual IDs and reports private; do not commit them. For an explicitly authorized posting test, supply `postingTest: true` and `albumUUID`, and omit `assetId`; only one actual user-selected Live Photo is accepted.

```sh
playground/photos/picker-input-experiment/script/build_and_run.sh --run /absolute/private/request.json /absolute/private/evidence
```

The script launches the already-built `.app` through Launch Services. Press **Select Live Photos to compare**, approve the experiment's normal macOS Photos request if needed, select one to twelve Live Photos, then click the picker's **Add/Done**. Closing the window cancels. A ten-minute deadline bounds the session. Default read-only mode has no Post button or sharing sheet.

A session ID reserves its journal with exclusive creation before any Photos access. Reusing an existing session cannot launch another comparison. `started` and process existence do not prove the window is visible. `item_compared` saves each completed pair. Only `comparison_completed` includes the full selection comparison. `expired`, `cancelled`, permission failure remain separate outcomes; none counts as a successful comparison.

## Current evidence

The standalone Swift executable linked and bundle signature verification passed on the development Mac. The initial single-selection experiment rejected a selection that differed from a hard-coded target; it did not complete the comparison. The owner reported that this picker prevented completing the flow. The corrected multi-selection experiment uses each selected item as its own comparison source, includes an explicit selection-completion step, and retains its results window. Its corrected live session completed one actual selection: both inputs matched the same identifier; identifier-only types were empty and Live Photo load returned nil; selected-item types were HEIC/JPEG and Live Photo load succeeded (2268 × 4032). Items compared unequal. This establishes a representation difference, not a sharing result. No production deployment was performed for this experiment.

## Direct PhotoKit load mode

For a no-picker read of the approved original, add its exact scoped `assetId` to the private request alongside `sessionId`. The App starts the direct test automatically after normal macOS consent: it loads the identifier-created picker item, calls `PHImageManager.requestLivePhoto` for the exact fetched Live Photo, and loads a newly constructed identifier item again. No picker, media export or sharing is invoked. Degraded callbacks are excluded from the terminal result. The result window remains open until Done.

Live result on the development Mac: `requestLivePhoto` returned a non-degraded, non-cancelled Live Photo (2268 × 4032) without a picker. The identifier-created item had empty content types and returned nil both before and after direct loading. This rules out unavailable media as the sole explanation for this identifier item's missing representation in this run. It does not convert the object to an accepted Shared Album input.

The installed SDK exposes Shared Album sheet overloads accepting `[PhotosPickerItem]` and `[PHPickerResult]`. A compile-only probe supplying `[PHLivePhoto]` was rejected (no matching overload); another trying `PhotosPickerItem(itemProvider:)` was rejected (no such public initializer). These are expected negative API probes, not successful feature builds. No sharing sheet was opened.

Apple documents that [the identifier initializer creates an item without a representation](https://developer.apple.com/documentation/photosui/photospickeritem/init%28itemidentifier%3A%29). The observed behavior matches that documented contract. [PHImageManager](https://developer.apple.com/documentation/photos/phimagemanager) separately provides the direct Live Photo request. The missing step remains a supported way to supply programmatically obtained media to Shared Album publication, not a way to read Live Photo data.

## Real-media route probes

Direct mode also enumerates `NSSharingService` for the loaded Live Photo and for `NSItemProvider(item:typeIdentifier:)`, and attempts to load that custom provider back as a Live Photo. It inventories source resource types without exporting their bytes. An optional private `albumUUID` probes an exact Shared Album lookup and `canPerform(.addContent)` without a write. No service is performed.

Observed on one actual original Live Photo:

| Probe | Result |
| --- | --- |
| Direct PhotoKit Live Photo | Non-degraded load succeeded |
| Identifier item before/after load | Both nil; no content types |
| Custom provider declared as `com.apple.live-photo` | `canLoadObject` false; actual load failed with `NSItemProviderErrorDomain -1200` (could not coerce to PHLivePhoto) |
| Sharing services for real Live Photo | Empty |
| Sharing services for custom provider | Add to Photos only |
| Source resource metadata | HEIC and QuickTime resources present, including original/adjusted resource roles; no bytes exported or pair publication verified |
| Exact Shared Album lookup | Not found in this standalone query; add-content support therefore unverified |

The service-discovery API is deprecated; this is a bounded enumeration result, not proof that every modern share extension is unavailable. Loading a Live Photo object into the generic secure-coding provider initializer did not provide the representation its reader expects. A separate compile-only probe also rejected `NSItemProvider(object: livePhoto)` because PHLivePhoto does not conform to NSItemProviderWriting. PHPickerResult construction is rejected because it has no accessible initializer.

The existing upload input contract was checked offline: still mode accepted, paired mode rejected. No network upload, test media generation, or speculative pair packaging occurred. Static upload history does not establish current Live Photo support.

## Manual posting baseline and target diagnosis

The owner authorized validating the basic real-selection-to-Shared-Album path using the standalone App. The original selected item stays in the same process after its Live Photo load; it is passed directly to the SwiftUI sharing-sheet overload. Callback results remain membership-unverified and actual album identifiers are recorded privately. A lost/dismissed sheet is not automatically relaunched.

The first posting session stopped before presenting a picker because its exact target was not found among 61 native collections. The owner clarified that they clicked macOS Allow, not Post. The local MCP inventory still listed the original empty destination plus a second same-title empty album. This is an unresolved native lookup discrepancy, not a publication failure. The diagnostic now records same-title native candidates without choosing by title, and terminal errors remain visible instead of terminating abruptly. A new session is inspecting this discrepancy.

The owner subsequently confirmed that the album was upgraded and authorized the visible replacement identity. Actual picker input loaded successfully, but preselecting that native album ID yielded Cocoa -1 with an explicit add-content permission error. The `chooseDestinationInSheet: true` comparison passes nil for the default destination and lets the owner choose the upgraded album in Apple's UI. It retains the approved target for result comparison; a different callback identity is not silently marked verified. No new album is created. The exact selected item remains alive until the sheet finishes.

## Explicit destination UI replaces reliance on Apple selection UI

The owner reported that the no-default run went straight to the callback result, with no visible Apple sheet or Post button. The old assumption of a guaranteed second confirmation was invalid. The current App displays its own Shared Album dropdown **after actual photo selection**, starts with no album selected, records the exact chosen ID, and requires **Confirm destination and send selected Live Photo**. The text explicitly warns that invocation may publish immediately. Only then does it invoke Apple with that exact ID; nil/default destinations are no longer used. The preceding unresolved destination can be disabled with private `blockedAlbumUUID`, and remains interlocked even if selected programmatically in the UI. There is no retry of a submitted session.

The earlier two similar copies both report Live Photo metadata locally but differ in dimensions; this does not prove which was added by the experiment, motion playback, or remote delivery. The unknown outcome remains retained. The new build passed Swift linking and strict signature verification and has been launched for actual dropdown validation.

## AppKit original-result baseline

`appKitBaseline: true` with `postingTest: true` uses `PHPickerViewController` directly. Its original `PHPickerResult` is retained in the same process, and its existing provider is read as PHLivePhoto as a diagnostic. No new provider or picker result is synthesized. After explicit destination selection and confirmation, the exact original result is handed to `PHSharedAlbumPostingViewController`, presented as an AppKit sheet with its delegate retained. This isolates the native controller path from the prior SwiftUI modifier implementation.

Failure views now show the native error description/domain/code instead of the generic verification message. Native callbacks do not establish visible UI, user interaction or delivery. There is still no verified successful manual-Photos baseline for the exact test; earlier claims were withdrawn. The first native AppKit session is pending user interaction. Build/link and signature verification passed with SDK deprecation and delegate-conformance isolation warnings; this is not a warning-free Swift 6 build.

Native AppKit baseline result: the untouched PHPickerResult provider advertised `com.apple.private.live-photo-bundle`, HEIC and JPEG, reported canLoadLivePhoto=true, and loaded a 2268 × 4032 Live Photo. After explicit confirmation of the same test destination, the direct posting controller returned the same Cocoa -1 add-content-permission rejection. The private type identifier was observed only; no private representation was synthesized or private API invoked. Both SwiftUI and direct AppKit rejected the destination with actual picker-provided media. This narrows the investigation to destination identity/access/upgrade compatibility; it does not prove the owner's account lacks access or that provider formats never matter.
