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
