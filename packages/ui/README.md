# Shared UI

One pinned DecompozR control catalog and project-owned action/modal/toast/brand
adapters shared by Studio and bundled feature UI. Preserve catalog controls and
licenses unchanged; provenance is in `src/design-system/PROVENANCE.md`.

Copy/toast contracts are host-provided. Feature-specific dialogs and browser logic
belong to their modules. This package has no backend, credentials or native imports.
Studio compiles it with the same pinned Svelte runtime as every module UI.
