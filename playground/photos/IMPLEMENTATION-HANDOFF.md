# Implementation handoff

Experiments are closed; this directory is not a production provider.
Canonical scope and acceptance: ../../docs/photos-capability-plan.md.

## Source disposition

- Preserve all cloud authentication, protocol, session, metadata and test files
  as isolated research. Do not wire them into production person search.
- Reuse design patterns from photos.ts (scoped identities), cloud-month.ts
  (timezone bounds), probe-diagnostics.ts (safe errors), and session-store.ts
  (private storage) after production review, not by wholesale copying.
- local-cloud-reference.ts and local-person-diagnostics.ts are diagnostic probes,
  not the selected production implementation. Their exact-label and limited
  schema assumptions must not become product person matching.
- Python probe/cloud helpers are historical prototypes, not the osxphotos sidecar.
  Keep them for provenance; the production sidecar should have its own pinned
  environment and JSON contract.
- Synthetic fixtures and tests are retained. Private snapshots, previews,
  credentials and comparison reports belong outside this tree.

## First implementation increment

Create a separate production Photos provider boundary using repository module
conventions. Implement health/library selection, osxphotos version reporting,
normalized person discovery and bounded date queries first. Acceptance is the
live local scenario plus meaningful synthetic ambiguity/permission/date tests.
Do not begin sharing, deletion, face inference or encrypted cloud pairing here.

## Retained runtime state

The user-authorized asdf uv default and uv-cached osxphotos environment remain
usable. Keep ~/.icloud-photos-session private and outside Git. Preserve the
comparison report there. Earlier review images remain private pending content
review and remotely preserved research; they are not product assets.

Checkpoint covers source/docs only; no plugin installation or deployment.
