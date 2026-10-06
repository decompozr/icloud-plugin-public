# Live Photo upload: experiment, knowledge and implementation plan

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
