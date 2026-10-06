# Photos picker input experiment

Standalone macOS 27 AppKit/SwiftUI application for comparing two public Photos inputs for one exact existing Live Photo:

1. `PhotosPickerItem(itemIdentifier:)` using the approved asset's local identifier.
2. A `PhotosPickerItem` actually returned after the operator selects that same asset in Apple's picker.

Both inputs use `loadTransferable(type: PHLivePhoto.self)`. The private JSONL journal records supported content types, identifier equality, transfer success, Live Photo dimensions, public item equality, and bounded/redacted NSError chains. A selected different asset ends the experiment before loading that selection. Comparison completion closes the app.

This is exploratory code, not part of the production plugin, MCP tool registration, Helper build, operation ledger, or deployed release. It has a separate bundle identity and macOS Photos consent. It does not link the production Helper. It contains no mutation, upload, sharing-sheet, album, export, or import functionality. Reading via Photos can cause the OS to retrieve an existing asset's media; no media is written by the experiment. A successful Live Photo load does not prove sharing, preservation after sharing, or cloud/iPhone delivery.

## Build

Run from this worktree:

```sh
playground/photos/picker-input-experiment/script/build_and_run.sh --build-only
```

The bundle is staged under the ignored `.flow-runtime/native-sharing/picker-input-experiment` directory. This compiles and ad-hoc signs the standalone app; it does not install or update the service. Rebuilding may require renewed OS consent. Never rebuild a running experiment or terminate another process to start it.

## Run an explicitly authorized live experiment

Create an owner-only request file containing `assetId` (the exact scoped existing asset ID) and a new UUID `sessionId`. Create a real, owner-only evidence directory with mode 0700. Keep actual IDs and reports private; do not commit them.

```sh
playground/photos/picker-input-experiment/script/build_and_run.sh --run /absolute/private/request.json /absolute/private/evidence
```

The script launches the already-built `.app` through Launch Services. Press **Start read-only comparison**, approve the experiment's normal macOS Photos request if needed, and select only the agreed original photo. Closing the window cancels. A ten-minute deadline bounds the session. There is no Post button and no sharing sheet.

A session ID reserves its journal with exclusive creation before any Photos access. Reusing an existing session cannot launch another comparison. `started` and process existence do not prove the window is visible. `baseline_completed` proves only the identifier-input diagnostic finished. Only `comparison_completed` includes the actual selection comparison. `expired`, `cancelled`, permission failure and mismatch remain separate outcomes; none counts as a successful comparison.

## Current evidence

The standalone Swift executable linked and bundle signature verification passed on the development Mac. A live session was launched after the owner explicitly authorized this read-only exception to the previous original-MCP-only constraint. Its journal reached `started`; manual selection and comparison results are pending. No production deployment was performed for this experiment.
