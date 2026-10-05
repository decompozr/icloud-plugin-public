# Photos capability: experiment closeout and build plan

Status: foundational experiments closed on 2026-10-04; read/write module implemented in source, not deployed. Full product acceptance remains pending. The reconciled delivery plan below governs remaining work.
See apps/icloud/src/photos/README.md for operator setup and current boundaries.
PhotoKit authorization and an ordinary empty-album create/rename/delete lifecycle
are live-verified. Shared Album upload support is not yet established.
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

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The official posting interface takes `PHPickerResult` values, which have no public
constructor. A supported candidate is a photo picker preselected with the exact
asset identifiers, followed by the posting interface with a default destination.
`playground/photos/SharedAlbumReviewProbe.swift` typechecks this API path, rejects
changed picker selections and reports destination changes. It is a compile-only
probe, not a deployed tool or a successful upload. Preselected picker results have
empty item providers per the SDK; live posting must verify they are accepted.
The posting callback also does not establish cross-device cloud synchronization.

References: [Apple posting controller](https://developer.apple.com/documentation/photosui/phsharedalbumpostingviewcontroller),
[Apple preselected identifiers](https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/preselectedassetidentifiers).

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

## Live authorization and write follow-up (2026-10-04)

The owner granted Full Access to iCloud Photos Helper. Launching the bundled
binary directly incorrectly observed not-determined; launching the app through
Launch Services observed authorized (3). The runtime and setup status now use
that app launch path, with private temporary request/response files and no retry.
Application checks passed 167 tests / 677 assertions and the production build.

The real PhotosService prepare/apply pipeline created a uniquely named empty
test album, renamed it and deleted only that empty album. All three returned
`applied`, `localReadbackVerified: true`, `serverSyncVerified: false`. The scoped
album ID was derived from the creation result; no name-based deletion was used.
No existing photos, metadata or shared-album membership were changed. Private
operation evidence remains in `/tmp/icloud-photos-live-check/evidence.json` and
its SQLite ledger; neither is shipped in the repository.

Asset add/remove, metadata changes and asset deletion still lack live mutation
evidence. Shared posting remains a user-assisted API candidate requiring a live
picker/posting experiment, membership readback and synchronization verification.
The installed service has not been changed.

## Receiver pickup and next slice (2026-10-04)

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The shared-album probe now requires exactly one owner-reviewed asset, full native
authorization and an actual Shared Album identifier. Its host must retain the
delegate, supply presentation/dismissal callbacks, launch under the authorized
app identity, and call `abandon()` on window close. `start()` creates an exclusive
0600 append-only operation journal in an existing owner-owned 0700 directory.
Reusing an operation UUID fails; interrupted posting requires reconciliation.
Changed picker selection stops the flow. A second native confirmation precedes
posting, and a flushed unknown-outcome record precedes presentation. Completion
records the actual destination and never asserts membership or cloud sync.

Self-checking: Swift 6 typechecking and `git diff --check` passed. The controller
is still source-only: no host window was opened, no picker result was exercised,
and no upload occurred. The installed SDK confirms empty providers for preselected
items and that posting completion does not automatically dismiss the controller.
Live acceptance of those items remains unresolved.

Next: wire a bounded review window into the authorized app without breaking its
consent identity, then have the owner review the exact preview and destination
before any posting. Preserve the probe and journal for recovery until sharing
acceptance; integrate verified behavior later. Existing prototype/private evidence
cleanup remains deferred while product work and handoff gates are pending.

## Reconciled full-outcome delivery plan (2026-10-04)

### Outcome and acceptance

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The entire outcome is accepted only when the installed capability passes the
owner scenario: existing person tags resolve correctly; all queried source
assets are accounted for in the comparison; the owner can inspect identifiable
previews and uncertainty; selected sharing reaches the intended real Shared
Album with separately recorded cross-device/cloud evidence; cleanup preserves
unreviewed assets and applies only exact approved selections; and setup, recovery
and installed-version checks are observed. Source tests, compiler success,
local write acknowledgement and handoff pickup are separate evidence categories.

### Evidence basis and accepted approach

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Scope, ownership and authorization

The current receiver owns product changes exclusively in the same task worktree
and branch. Preserve the separate primary checkout and existing private records.
No new runtime or global dependency installation is needed. Repository artifacts
remain English; communication remains Traditional Chinese; helper-owned native UI is English-only
per the owner's later explicit preference.

Implementation, local builds, read-only checks and owner-facing review preparation
are in scope. Personal uploads require concrete asset/destination review; deletion
requires exact selected assets and explicit batch confirmation. Unknown value is
a question for the owner, not a deletion heuristic. Deployment/publication,
conversation archive and worktree removal retain their separate authorization
and verification gates. Do not silently publish a test photo to family members,
bulk upload before sharing acceptance, empty Recently Deleted, remove private
evidence, reinstall existing dependencies or infer authorization from a probable
comparison match. No additional agent is a prerequisite for this plan.

### Ordered phases, dependencies and observable acceptance

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Phases 1 and 2 share the same native host and may be developed as one coherent
slice. Phase 5 can supply build/setup feedback throughout source implementation.
Later live-write and delivery details remain provisional until their preceding
evidence is available; this does not drop those phases from the outcome.

### Next executable slice

Objective: a bounded native review host plus asynchronous single-asset shared
posting sessions. Editable scope: `apps/icloud/src/photos/`, its optional runtime
wiring, and this plan/Photos README. The receiver is the sole writer. Existing
provider contracts, scoped IDs, operation ledger, Launch Services transport and
installed SDK are the prerequisites. Preserve prototype artifacts separately
from the product host; no additional dependency install is required.

Complete source wiring and crash/cancellation tests, compile/link the entire
native host, build a separate preview app, and run read-only health/setup checks.
Present exact previews and the actual destination to the owner before any upload.
Bound live posting acceptance to one reviewed asset, one operation identity and
one explicit owner action; a timeout/error stops that attempt for reconciliation.
If preselected providers are rejected, inspect the official picker behavior and
revise this slice using supported native APIs; do not fall back to private cloud
protocols, automated Photos UI posting or fabricated picker results.

Observable slice acceptance is a native review window that can be cancelled
without mutation, accurate permission status, stable operation recovery after
restart, and explicit unverified membership/cloud state. Complete upload/cloud
acceptance additionally needs the owner-reviewed live operation and separate
destination/cloud readback. Missing owner input defers only the dependent action;
remaining source, tests, packaging and review continue.

### Prototype disposition and lifecycle coverage

The receiver retains `playground/photos/SharedAlbumReviewProbe.swift` as a
compile-only API evidence artifact and integrates verified behavior into native
product sources. Existing historical experiment reports remain historical;
private manifests, previews and ledgers stay outside Git. Keep the authorized original helper as the rollback baseline. The owner explicitly
requested experimental-helper cleanup; the preview process was stopped and its
app/compiler-check outputs removed. Any future runtime build must be deliberate,
separately identified and checked for permissions; no preview remains active.

Dev/Build: isolated task worktree, synthetic regression fixtures and separately
identified native build evidence. Install: explicit selected library, existing
pinned uv/Python tooling, owner permission/recheck and optional configuration.
Update: immutable source/artifact identity, preserved prior runtime and permission
recheck after signing changes. Release: publication/merge/deployment gates above.
Uninstall: only capability-owned files within explicit authorization; keep user
libraries, exports and global tooling. Cleanup: reconcile useful evidence into
this plan and the README, verify any required remote preservation and inactivity,
then remove only authorized disposable artifacts. Handoff archive/sidebar/App
verification remains separate from product completion; old-root archive remains
unauthorized and pending.

### Receiver source milestone and verification limits

Source now wires native comparison/cleanup review, asynchronous single-asset
posting, durable selection/operation records, process-liveness checks and explicit
owner observations. Unknown sharing cannot be bypassed with another destination
or a previously prepared plan for the same source. A lost catalog launch response
can recover its exact selection from the private manifest and retain it in SQLite.
Cleanup pagination, messaging filename clues and Live Photo motion flags are
included. Native permission messages describe states without exposing raw codes.

Current self-checking: application tests passed 176 tests / 714 assertions;
six Python tests passed; TypeScript checking, application build, entire native
typechecking/compile/link and `git diff --check` passed. The latest native compile
check is an ignored executable, not an installed helper or GUI acceptance result.
Private validation logs and the prepared twelve-candidate review request are under
`/tmp/photos-flow-handoff/`; no personal asset IDs or previews were added to Git.

A staged preview helper returned `setup_opened`, but native UI observation failed
with `cgWindowNotFound`; a bundle-ID lookup is ambiguous because the preserved
original and preview share an identifier. A read-only diagnostic agent checked
source and official SDK/docs, confirming background `open -g` for interactive
requests and unchecked activation were material uncertainties. Interactive
commands now omit `-g`, native policy transitions are checked, and modern
activation is used. This is a source correction, not a verified live UI fix.
The currently running preview setup predates the final source milestone; retain
it and the original while owner visibility/permission input is pending. Do not
replace/re-sign a permission-pending app behind the owner's interaction.

The diagnostic was independent read-only investigation, not a complete product
review. Live native review, picker/posting acceptance, ordinary asset mutations,
asset deletion and cross-device/cloud evidence remain pending. No receiver photo
upload, personal metadata edit, asset add/remove, deletion, installed-service
change, push, merge or deployment occurred. Source checks do not settle those
gates. Continue with the owner-visible native acceptance slice before publishing
or treating the product scenario as complete.


### Active production goal and installation hardening (2026-10-04)

The owner explicitly requested a persistent goal to finish this roadmap and make
Photos production-ready. The goal covers phases 1–7 and remains active until the
installed end-to-end acceptance is observed. Source/build completion alone does
not close the goal. The receiver remains the sole product writer.

Setup now rejects nonempty runtimes before executing installation/build tools,
reserves the destination against concurrent setup, and preserves existing helpers
even when no venv exists. An explicit `--python` reuses an environment only after
checking Python 3.12, osxphotos 0.77.2 and photoscript 0.6.1. `--sign` selects an
operator-provided identity; the ad-hoc default remains clearly identified. Setup
verifies signing and writes a private source/executable hash and designated-
requirement manifest. Failed partial runtimes remain available for diagnosis.
No setup command or helper build was executed for this hardening slice.

Current self-checking: 178 application tests / 722 assertions passed, including
existing-helper preservation and concurrent-setup rejection; TypeScript checking
and application build passed; the existing cached Python dependency versions were
read back and match requirements. Native live acceptance, reviewed mutations,
cloud evidence, installed service configuration and deployment remain pending.

Production acceptance gates:

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.


### Decision coverage and installed-baseline inspection (2026-10-04)

Native review now records each source as undecided, keep or a purpose-specific
sharing/deletion review candidate. The service validates complete, unique source
coverage and selection consistency, and stores final decisions through restart.
These decisions do not authorize a write. Confirmed pre-post cancellation is also
retained when a later journal read is unavailable.

Current self-checks passed 181 application tests / 732 assertions, TypeScript
checking, application build and complete native source typechecking. No new
helper app/executable was created or launched.

A read-only inspection of the actual owned installation found `current` points
to `releases/0.1.28-darwin-arm64`; Photos is not configured. This supersedes older
0.1.19 installation notes for the delivery decision. The Photos worktree used an older application baseline at inspection. The
receiver has now integrated `origin/main` at `712ca37` (0.1.28) in this same
task worktree, preserving Calendar registration, reconnect/readiness diagnostics,
private administration and Photos assets/permissions. No main checkout or running
service was changed. A Photos release needs its own immutable version/artifact;
do not overwrite or reuse the installed 0.1.28 release directory.
The installed artifact metadata has no source commit field, so version alone
does not establish source provenance. No installed files were changed.


Integration validation: after synchronizing only the declared worktree-local
locked dependencies, 320 application tests / 1,978 assertions passed and
10 tooling tests / 134 assertions passed. TypeScript and application build passed.
The first application run raced an unfinished build and copied a template without
its Calendar skill; the sequential post-build rerun passed. The initial tooling
run lacked its declared local zod dependency; the frozen-lockfile install and
rerun passed. These are self-checks, not an independent release review or installed
acceptance. The installed target confirmation, native visible UI/permission gate
and exact owner-reviewed live changes remain pending.


### Cross-batch accountability and client delivery (2026-10-04)

`photos_review_summary` now accounts for an explicit source set across finalized
reviews, separating unreviewed, undecided, keep and purpose-specific further-review
candidates. It binds comparison decisions to the owner and exact album, survives
restart, and excludes pending/cancelled/legacy selected-only results. The latest
finalized review creation controls each source decision. Saved decisions never
claim current library state, sharing success or write authorization.

The `icloud-photos` skill is included in immutable application templates, configured
server downloads and exported client ZIPs alongside Mail and Calendar. It explains
service-Mac permission setup, tagged person queries, complete source accounting,
exact native posting review, unknown-outcome recovery and explicit deletion scope.
No user asset IDs or previews enter these artifacts.

Validation: application build/typechecking passed, 322 application tests / 1,991
assertions passed, and 10 tooling tests / 135 assertions passed. The archive tests
verify the Photos skill is present while unrelated files are excluded. These remain
source/packaging self-checks; installed and live native acceptance are pending.


### Production runtime candidate acceptance checkpoint (2026-10-04)

The current setup command built `apps/icloud/build/photos/production-runtime`
from the committed native sources while reusing the validated existing Python.
Compile/link, ad-hoc signing and strict signature verification passed. The private
runtime manifest's source and executable hashes were independently recomputed
and match; the candidate is not installed. No dependencies were reinstalled and
the original authorized helper remains unchanged with native health 3/true.

Candidate health returned authorization 0/false. Its interactive setup command
returned `setup_opened` without Photos changes, but native UI observation again
returned `cgWindowNotFound`; the native inventory reports the helper running.
This does not prove owner-visible UI, permission or onboarding acceptance. An
owner visibility/explicit Full Access action is pending. The task-owned candidate
and setup process are retained for that concrete gate, separately from the
previous preview/compiler outputs already removed at the owner's request.

No source/selected photo was uploaded, deleted or edited. Installed 0.1.28 remains
unchanged; service target confirmation and final immutable release identity remain
pending before deployment.


### Metadata failure containment (2026-10-04)

Source inspection found that a metadata readback mismatch was reported unknown
but did not stop later assets. Metadata batches now stop on either an exception
or failed readback, preserve each reviewed UUID, and explicitly mark remaining
assets `not_attempted`. Provider parsing retains those outcomes. A confirmed
wrong-open-library response is rejected before writes rather than ambiguously
locking the intent; correction requires a fresh reviewed plan.

Regression evidence covers failed readback and an exception after a partial edit,
verifying the next asset is untouched. Eight Python tests, 323 application tests /
1,995 assertions, TypeScript checking and application build passed. No live photo
metadata was edited. A candidate health read still reports authorization 0/false,
and its exact setup process remains running; owner visibility/permission action
is still pending. No setup relaunch or permission grant was inferred.


### Held Photos delivery candidate

Application/client version 0.1.29 is reserved locally for the Photos delivery
candidate, based on production 0.1.28. This is not a tag, publication, installation
or release acceptance. The candidate stays held until owner-visible setup,
permissions, reviewed live writes/sharing and installed scenario gates pass.
Do not overwrite the existing 0.1.28 release or infer deployment permission from
the candidate version. Check remote version availability again before publication.


### Held artifact and owner-action blocker audit (2026-10-04)

The immutable local server candidate is
`apps/icloud/build/photos/server-candidate-0.1.29`, built from source `f9da54f`.
Artifact inspection verified version/platform/Bun; a smoke check imported its
compiled Photos service/registration, exercised the saved decision summary with
synthetic IDs and verified writes remain disabled by read-only policy. Required
Python/native sources, runtime version and client skill are present; sidecars
match source byte-for-byte and test/fixture files are excluded. Private source/hash
evidence is `/tmp/photos-flow-handoff/candidate-0.1.29.json`. This smoke check
changes no Photos library and is not the installed owner scenario.

The existing installed 0.1.28 passed all thirteen GET/file-metadata doctor checks
without registration, tokens, credential reads, tool invocation or service changes.
Its current symlink remains on 0.1.28; no Photos release was published or installed.

The same native owner-action gate has persisted through candidate startup,
metadata hardening and artifact preparation. Current candidate health is still
0/false and the exact setup process is live. Automated native observation cannot
see the window; owner visibility/Full Access and service-target questions have no
recorded answer. Safe independent source/build/packaging work for this slice is
complete; the next mandatory native review/posting and reviewed disposable-data
write acceptance cannot proceed without owner input. Goal status is blocked by
that gate, not complete. Retain the original helper, candidate runtime/process,
held artifact and private recovery/evidence files for this explicit dependency.

Resume with the owner's visibility/authorization and service-target response.
Read back actual permissions, then open exact previews and obtain specific
asset/destination or disposable-test-data decisions. Only then complete live
posting/writes, cloud evidence, clean delivery/review gates and the installed
end-to-end owner scenario. Do not auto-upload, auto-delete or retry unknown writes.


### Helper language correction

The owner clarified that only the Helper UI must use English; conversation
replies remain Traditional Chinese. Removed bilingual Chinese strings from
helper-owned setup, comparison/cleanup, sharing and alert views. Apple-owned
system sheets retain their system language. Candidate authorization was still
0/false before the UI update; the original authorized helper remains preserved.


### Admin-owned permission flow (owner correction)

The owner-provided screenshot established the former setup window was visible;
`cgWindowNotFound` was an automation-observation limitation, not proof that the
app could not show a window. The owner then requested setup in the admin page as
steps 1–2–3, and English-only helper UI with Traditional Chinese conversation.

Removed the duplicate native setup window, its `review_setup` command and the
unreleased `photos_open_setup` tool. Admin now presents 1. library access,
2. Photos Full Access, 3. actual permission recheck. These are executable actions,
not instructions-only buttons. Authorization launches a fresh app instance so
arguments cannot be swallowed by an already-running helper. Supported native
comparison/cleanup and Apple posting flows remain; helper-owned strings are
English-only and system-owned sheets follow macOS language settings.

The obsolete setup process was stopped after matching its exact executable. A
replacement `production-runtime-admin` was compiled/signed/verified without
requesting access or modifying photos. Full source checks passed 323 application
tests / 1,998 assertions, TypeScript and application build; native typecheck and
compile/link passed. The earlier English-only build had a syntax error and was
not launched; the corrected admin-flow build passed. Existing held server/native
candidates with the old setup flow are superseded and must not be deployed.
Actual admin deployment and owner-triggered permission/readback remain pending.


### Remote conversation workflow correction (2026-10-05)

The owner clarified that daily Photos management must work remotely through the
agent. The Mac hosts the service; osxphotos is the primary supported provider,
and the native Helper supplies operations osxphotos cannot perform or fallback.
A host-side review window is not the owner product workflow. Initial OS consent
remains an explicit setup step. Earlier native catalog acceptance does not satisfy
remote review acceptance.

Remote review preparation now reads exact comparison sources or a bounded cleanup
page, with source details and evidence. Previews are returned through the existing
image tool in the conversation. Explicit owner decisions are saved durably, bound
to the review owner, purpose, exact source set and comparison destination. Keep and
undecided remain preserved; candidates still need separate write plans and explicit
confirmation. The public native catalog launch tool is removed while historical
review and uncertain-operation recovery remain available.

Remote Shared Album posting is unsupported and rejected before launching host UI,
including previously prepared posting plans. The Apple user-presented candidate
remains native operator evidence, not a remotely usable shipping promise. No
personal uploads/deletions are authorized merely by this workflow correction.
Installed version, actual client discovery/images, remote decision persistence and
reviewed provider mutations must be reported as separate acceptance gates.

Validation for this correction: 355 application tests / 2,263 assertions, eleven
built E2E tests / 259 assertions, eleven tooling tests / 141 assertions and the
production build pass. The MCP SDK client lists the corrected object-root schemas,
receives image content, saves exact read-scope review decisions and reads them back
without native launch or Photos mutations. Large cleanup groups can be reviewed
in exact subsets without silently claiming omitted sources. These fixture checks
do not prove the installed client's current OAuth consent, tool refresh or images.
