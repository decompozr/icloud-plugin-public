# Photos capability: experiment closeout and build plan

Status: experiments closed on 2026-10-04; read/write module implemented in source, not deployed.
See apps/icloud/src/photos/README.md for operator setup and current boundaries.
Native live writes await OS authorization; Shared Album upload support is not established.
The user accepted local Photos access and an isolated Python dependency after
initially preferring a cloud-only Bun implementation. This document supersedes
older cloud-only and no-Python directions in the historical experiment records.

## Decision

Keep the API and workflow in Bun/TypeScript. Use a version-pinned osxphotos
sidecar for local, synced Photos metadata. Introduce a small Swift/PhotoKit
helper only where official asset retrieval or supported mutations are needed.
Do not require web-search pairing for the initial release. Retain the direct
HTTP experiment as research; it is not the primary person-search provider.

The local provider requires a Mac with the selected Photos library and adequate
host privacy permissions. This is access to a synced local snapshot, not proof
of current iCloud server state. No claim of cross-platform or headless cloud
person search is made.

## Verified evidence

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Comparing originals with shared copies

Use staged evidence, preserving all candidate reasons and uncertainty:

1. Same scoped asset identity or an established original-to-shared relationship
   is strongest metadata evidence. Never equate IDs from different scopes.
2. Exact original byte hashes can prove equal files when both are available.
   Different hashes do not disprove the same capture after resizing or editing.
3. Generate candidates using normalized original filename, capture time,
   media type, duration where available, and dimensions/aspect ratio. Never
   accept filename alone; preserve duplicate candidates rather than picking one.
4. Compare preview image content after orientation normalization using perceptual
   fingerprints and a second similarity measure. This compares images, not
   identities or faces. Calibrate thresholds on known same-image pairs and hard
   negatives such as burst neighbors; no arbitrary threshold is a proof.
5. Route ambiguous pairs, crops, edits, and Live Photo/video variants for review.
   Stills alone cannot establish that motion or the full video was shared.

Return confirmed, probable, ambiguous, and not-found states, plus snapshot age
and coverage. Preview similarity improves confidence but is not a blocker for
shipping read-only search or the metadata comparison report. Do not use probable
matches to authorize deletion of originals.

## Delivery phases and acceptance

### Phase 1: read foundation for the read/write product

Use a bounded osxphotos JSON sidecar behind a typed Bun adapter. The initial
implementation uses a fresh process per request to avoid stale library caches;
a long-lived worker remains a performance optimization.
Pin dependency versions; validate every response and use fixed diagnostic errors.
Expose provider health, library discovery/explicit selection, person list/search,
asset query/detail, album list/membership and bounded previews. Return opaque,
provider-scoped asset IDs and pagination, not internal paths or raw database rows.

Person matching: Unicode normalization, collapsed whitespace and case-insensitive
lookup; exact normalized match first, unique partial match second, explicit
selection when multiple people match. Use existing annotations only. Date filters
use an inclusive start and exclusive end in a named timezone, separating capture
and import dates. Album type must distinguish ordinary, Shared Album and Shared
Library; duplicate album names require ID selection.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Phase 2: comparison and review

Expose a compare-to-album operation with candidate evidence and confidence.
Produce a private review artifact for the twelve not-found candidates and the
251 probable matches. Add optional preview comparisons; preserve multiple
candidates and account for Live Photos/videos. Invalidate cached results when
library state changes and recheck membership before subsequent actions.

Acceptance: every source asset appears exactly once in a result category;
ambiguous burst neighbors and transformed copies have meaningful regression
coverage; missing local previews cause an explicit unverified result. Reports
state local snapshot coverage, not guaranteed server completeness.

### Phase 3: separately verified sharing

Investigate supported ways to add selected assets to a true Shared Album.
Do not assume normal PhotoKit album writes or osxphotos reads imply this ability.
If only a user-assisted Photos flow is supported, expose it honestly.

Acceptance gate: with an explicitly selected test asset and destination, show the
proposed write, perform the authorized operation, then read back membership and
verify upload outcome. Persist operation identity; reconcile an unknown outcome
before retrying to avoid duplicates. No bulk upload before this gate passes.

### Phase 4: cleanup assistance

Generate review candidates for exact duplicates, near duplicates, blurred
captures, screenshots and potentially expired temporary material. Age, WhatsApp
origin or unfamiliar content alone must not determine deletion. Preserve
meaningful family/document photos and request clarification when intent is unclear.

Acceptance: user sees identifiable previews and reasons, selects exact asset IDs,
and approves a concrete batch. Revalidate those assets before a supported Photos
mutation. Report partial/unknown outcomes and recovery behavior. Never mutate
Photos.sqlite directly or automatically empty Recently Deleted.

## Product integration and lifecycle

- Dev: keep experiments isolated; implement a provider interface before coupling
  Photos to existing mail/calendar tools. Unit tests use synthetic metadata;
  opt-in real-library acceptance remains distinct.
- Build: Bun owns API/MCP contracts. Bundle sidecar code and a pinned dependency
  manifest; build/sign a Swift helper only if the selected feature requires it.
- Install: detect macOS and permissions, explicitly select a library, provision
  isolated dependencies through existing uv. Do not change users' global tool
  defaults as a routine plugin install; the current global uv change was explicit.
- Runtime: bind local transport narrowly, retain credentials/private previews
  outside Git with restrictive permissions, bound resource use and cache size.
  Avoid logging person names, asset paths or raw library responses by default.
- Update: test supported macOS/library schemas, retain an executable rollback and
  invalidate version-dependent caches. Report dependency and provider versions.
- Uninstall: remove only capability-owned runtime files with authorization;
  preserve Photos libraries, user exports and unrelated/global uv installations.
- Release: production integration, publication and rollout are a separate phase;
  this closeout does not deploy the experiment.

## Deferred research and retained state

Direct-cloud encrypted search requires bridge key provisioning, APNs/IDS
transport and device consent. It is deferred, not proven impossible. Swift-only
public PhotoKit person-name lookup has not been established. Shared Album writes,
content comparison, cleanup decisions and end-to-end upload completion remain open.

Keep the task worktree, installed dependencies, session cache and private reports
for implementation/recovery. Retain earlier private review images pending a
separate cleanup decision; they are not suitable for publishing. No temporary
files or unrelated worktrees were removed as part of closeout.

## Sources

- https://github.com/RhetTbull/osxphotos/releases/tag/v0.77.2
- https://github.com/sweetrb/apple-photos-mcp
- https://developer.apple.com/documentation/photos/phfetchoptions
- https://developer.apple.com/documentation/photos/phobject/localidentifier
- https://support.apple.com/guide/security/search-on-icloudcom-security-sec0057159bf/web

## Implementation checkpoint (2026-10-04)

Source now includes the optional shared-runtime Photos module and explicit config,
scoped person/date/album queries, cached previews, metadata comparison and cleanup
review candidates. Ordinary album creation/rename/add/remove, empty-album removal,
metadata replacement and asset deletion have prepared-plan/apply paths. Delete
uses a distinct OAuth scope. Durable plans enforce owner binding, expiry, state
revalidation, single execution and unknown-outcome retention. CLI/setup and build
asset copying are included; the installed server has not been changed.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Shared Album additions are capability-gated by native collection resolution and
canPerform checks, not declared supported from read evidence. Full cloud upload
confirmation, perceptual comparison, automated blur scoring and reliable expiry
classification are still open. This checkpoint implements write workflows but
is not acceptance of the entire sharing/cleanup scenario.
