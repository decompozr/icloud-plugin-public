# Photos conversation handoff — 2026-10-04

## Resume here

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Read `docs/photos-capability-plan.md`, `apps/icloud/src/photos/README.md`, and
applicable AGENTS.md before continuing. Later dated evidence supersedes earlier
checkpoints in those documents.

## User intent and decisions

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

- Respond in Traditional Chinese; repository artifacts in English.
- Architecture accepted: Bun/TypeScript API and workflow, osxphotos metadata
  reads, small Swift PhotoKit/PhotosUI helper for supported native operations.
- Python is explicitly accepted now. Do not revive earlier no-Python/cloud-only
  constraints or migrate everything to Swift. Person lookup uses existing tags,
  not face recognition or guessing identity from pictures.
- No browser automation fallback. Local native UI is an intended path.
- Setup must offer permission shortcuts, actual permission checks, and recheck;
  the user should not repeatedly diagnose permissions by hand.
- Preserve WIP and private data; descriptive future branches without codex/.
- No new delegation unless explicitly requested or required by applicable rules.

## Implemented and verified

- `90df2ed`: optional Photos module in `apps/icloud/src/photos/`, settings,
  shared runtime registration, scoped IDs, read tools, prepared write plans,
  separate delete scope, persistent operation ledger and unknown-outcome handling.
- `073ee31`: owner setup/admin permission UI, Photos/Full Disk Access shortcuts,
  native authorization action, status/recheck, English/Traditional Chinese.
  Buttons launch settings on the service Mac even from a phone; direct links
  open on the viewing device. Installed service remains unchanged.
- `a973134`: fixed Photos consent identity. Executing the binary inside the app
  directly reports authorization 0; Launch Services app launch reports 3/true.
  `runNative` in provider.ts now uses `/usr/bin/open -n -g` with private temporary
  request/response files. Do not revert to direct subprocess execution.
  `open -W` can fail tracking a short-lived app; response establishes completion.
- Owner screenshot confirmed iCloud Photos Helper Full Access. Actual native
  health through the fixed transport also confirmed authorization.
- 167 app tests / 677 assertions passed; production build passed. Earlier Python
  tests and native compile passed; distinguish historical checks from new runs.
- `77f1138`: real PhotosService prepare/apply successfully created, renamed and
  deleted only a dedicated empty ordinary test album. All returned applied and
  localReadbackVerified=true, serverSyncVerified=false. No existing photo or
  metadata changed. No test album remains according to native readback.

## Critical sharing discovery and next work

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

`playground/photos/SharedAlbumReviewProbe.swift` demonstrates the official API
path and passes:

```sh
xcrun swiftc -swift-version 6 -typecheck playground/photos/SharedAlbumReviewProbe.swift -framework Photos -framework PhotosUI -framework AppKit
```

It is compile-only: NOT linked into the runtime, NOT an opened/tested UI, and
NOT a successful upload. It preselects exact asset identifiers in PHPicker,
rejects changed selections, then uses actual PHPickerResult values for posting.
PHPickerResult has no public constructor. SDK documentation says preselected
results have empty item providers, so live acceptance by the posting UI is an
open question. The destination can change in the posting UI: inspect actual
albumIdentifier, do not claim the expected destination automatically.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Apple references (also verify installed SDK headers):
- https://developer.apple.com/documentation/photosui/phsharedalbumpostingviewcontroller
- https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/preselectedassetidentifiers

## Runtime and private evidence

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Useful checks

```sh
bun test apps/icloud/src
bun run --cwd apps/icloud build
git diff --check
```

No live Photos deletion, metadata editing, shared upload, complete onboarding UI
verification, or installed Photos capability should be claimed from these tests.
