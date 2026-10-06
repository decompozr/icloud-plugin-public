# Photos picker input experiment

Standalone macOS 27 AppKit/SwiftUI application for comparing two public Photos inputs for up to twelve user-selected existing Live Photos:

1. `PhotosPickerItem(itemIdentifier:)` using each selected item's own local identifier.
2. A `PhotosPickerItem` actually returned after the operator selects those assets in Apple's picker.

Both inputs use `loadTransferable(type: PHLivePhoto.self)`. The private JSONL journal records supported content types, identifier equality, transfer success, Live Photo dimensions, public item equality, and bounded/redacted NSError chains. The picker supports multiple selection and an explicit Add/Done step. Each actual selection is paired with an identifier-created input for that same photo; no prior filename lookup is required. Comparison completion retains a summary window with a Done button.

This is exploratory code, not part of the production plugin, MCP tool registration, Helper build, operation ledger, or deployed release. It has a separate bundle identity and macOS Photos consent. It does not link the production Helper. It contains no mutation, upload, sharing-sheet, album, export, or import functionality. Reading via Photos can cause the OS to retrieve an existing asset's media; no media is written by the experiment. A successful Live Photo load does not prove sharing, preservation after sharing, or cloud/iPhone delivery.

## Build

Run from this worktree:

```sh
playground/photos/picker-input-experiment/script/build_and_run.sh --build-only
```

The bundle is staged under the ignored `.flow-runtime/native-sharing/picker-input-experiment` directory. This compiles and ad-hoc signs the standalone app; it does not install or update the service. Rebuilding may require renewed OS consent. Never rebuild a running experiment or terminate another process to start it.

## Run an explicitly authorized live experiment

Create an owner-only request file containing a new UUID `sessionId`. Create a real, owner-only evidence directory with mode 0700. Keep actual IDs and reports private; do not commit them.

```sh
playground/photos/picker-input-experiment/script/build_and_run.sh --run /absolute/private/request.json /absolute/private/evidence
```

The script launches the already-built `.app` through Launch Services. Press **Select Live Photos to compare**, approve the experiment's normal macOS Photos request if needed, select one to twelve Live Photos, then click the picker's **Add/Done**. Closing the window cancels. A ten-minute deadline bounds the session. There is no Post button and no sharing sheet.

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
