# Shared Album writes parked: knowledge and resumption record

Status: Shared Album writes are parked by the owner. On 2026-10-06 the owner narrowed the earlier whole-Photos removal: restore ordinary Photos, with the fine print “Shared Album writes are unsupported.” Existing experimental publication remains incomplete; no further sharing experiment is scheduled.

## Production boundary

Photos reads, ordinary album organization, metadata and separately controlled deletion remain available under existing policies. The admin label is Photos. Shared cloud tools, upload staging/sidecars and native posting UI are excluded from production. The tool schema omits posting; prepare/apply reject shared destinations, including historical plans, and the reduced native Helper rejects actual shared collections. Ordinary album membership reuses existing assets without exporting or rebuilding media.

The Photos-only Helper is rebuilt from source. Earlier experimental apps and their permissions were removed; renewed ordinary Photos consent may be required. Shared operation journals, uncertainty interlocks, provider custody and database rows remain preserved for recovery. Publication source/tests remain archived; fixture success is not live acceptance. Previous whole-module removal was deployed as 0.1.66 and is superseded by the local-only restoration.

## Consolidated experiment evidence

| Experiment | Observed result | What it establishes / limitation |
| --- | --- | --- |
| Original MCP native authorization | Authorized before posting tests | Library access is distinct from Shared Album add-content permission. |
| Identifier-created PhotosPickerItem | Empty supported types; PHLivePhoto transfer nil | An identifier alone supplies no media representation. |
| Actual SwiftUI picker selection | Same-identifier comparison loaded a Live Photo; items unequal | Real picker input differs from identifier-only input; not publication proof. |
| Public PhotoKit direct loading | Non-degraded PHLivePhoto loaded without a picker | Automatic media loading works. Identifier-only transfer remained nil afterward, so cache/download alone did not repair it. |
| Naive custom NSItemProvider | Three consistent -1200 coercion failures | That construction cannot load PHLivePhoto; does not prove every provider construction impossible. |
| NSSharingService enumeration | No service for PHLivePhoto; Add to Photos only for custom provider | Deprecated, bounded discovery; no service was performed. |
| PHAssetResource inspection | HEIC and QuickTime resources present | Metadata only; no resource-byte export or synthetic reconstruction. |
| SDK compile probes | No PHLivePhoto-array sheet overload, public PHPickerResult constructor, PhotosPickerItem provider initializer or PHLivePhoto NSItemProviderWriting conformance | Public input conversion remains missing in the tested SDK. |
| App Intent probe | Schema reference accepted; no executable perform path demonstrated | A schema is not a publisher; no working headless action established. |
| Actual AppKit PHPickerResult | Original provider loaded Live Photo, including advertised private bundle type | Private type observed only, never synthesized or used as a private API. |
| SwiftUI and AppKit posting to upgraded target | Cocoa -1: cannot add content to the identified Shared Album | Both real picker routes failed. Target mapping, upgraded API compatibility and access cause remain unresolved. |
| No-default-target posting | Callback reported a different destination without visible confirmation UI | Unknown outcome: ambiguous candidate copies; no confirmed new-copy causality, cloud delivery or playback. Never blind-retry. |
| Direct original-MCP still upload | Preparation rejected unsupported_shared_album_protocol for modern_or_encrypted target | No apply or binary upload. Current upgraded target unsupported even for a still image; not a Live pairing failure. |
| Historical legacy static route | Earlier synthetic static upload/readback/removal succeeded | Different protocol and test; cannot establish upgraded target acceptance. Synthetic generation is revoked. |

## Corrections and unresolved challenges

There is no verified successful manual Photos-app baseline or end-to-end intended-target Live Photo delivery. Earlier statements suggesting either were withdrawn. The owner corrected an initial “Post” report to clicking macOS Allow. A callback is not destination membership, motion playback or iPhone evidence. Native authorization and album-owner metadata do not explain the native add-content rejection. The upgraded album's unsupported cloud protocol is confirmed for the MCP path but is not a proven cause of the separate native error.

The desired final outcome is automated posting from existing Photos assets without user UI or computer control. Manual UI was authorized only for exploration. We must establish an actual supported publisher and destination contract before rebuilding production functionality. Do not repeat experiments merely because a provider advertises a type.

## Evidence map

- [Chronological Live Photo research and decisions](photos-live-upload-plan.md).
- [Capability plan and earlier acceptance boundaries](photos-capability-plan.md).
- [Standalone experiment source, protocol and references](research/prototype-archive/photos-picker.md).
- Archived publication implementation/tests: `apps/icloud/src/photos/shared-*`, `cloud-*`, `archived-sharing-module.ts` and native `SharedAlbumPosting.swift`; publication modules are excluded from releases. Ordinary Photos and read-only recovery utilities remain deployed.
- Private evidence: `.flow-runtime/native-sharing/picker-input-experiment/evidence/`, API probes and requests; `.flow-runtime/native-sharing/rebirth-after-refresh/` contains deployment and handoff receipts; `parked/` holds shutdown, permission, build and deployment evidence.
- Private `state.json` retains exact original/replacement source and destination IDs, uncertain operations and recovery locations. Never copy those identifiers into public docs.

## Resume checklist

1. Obtain an explicit request to resume Shared Album writes. Read this record and private state before changing anything; preserve unknown-outcome interlocks.
2. Revalidate current target identity and upgraded protocol. Do not recreate the old Shared Album or substitute another destination. Do not assume historical permissions survive cleanup.
3. Reconcile the unexpected-destination callback read-only before any further posting. Preserve original library assets and shared copies until separately authorized.
4. Establish a successful controlled baseline with actual media, exact destination and explicit posting consent; fix the standalone App's stale read-only purpose string before any future posting build. Swift link checks had warnings and were not warning-free Swift 6 acceptance.
5. Demonstrate a public supported no-UI publisher, then verify destination membership separately from Live playback and cross-device delivery. Only then reconsider production integration, signing, permission setup and release acceptance.
6. Earlier three-photo and participant invitation/removal work remains parked, pending exact identities and decisions. Nothing here authorizes original-library deletion, synthetic imports, new albums, thread archival or worktree removal.
