# Application E2E workspace

Run `bun run build` at the repository root first, then `bun run e2e`.
Tests consume the existing private built application modules in `apps/icloud/dist`;
no application source runtime imports are bundled into these tests. The app's
existing composition interfaces allow local IMAP/SMTP/HTTP and synthetic owner
fixtures without credentials or real mailbox traffic. There is no package-level catchall API exported for tests. The production-used
application composition entrypoint supports fixture dependencies; other component
checks stay beside their modules.

`src/` owns protocol/HTTP integration scenarios and helpers. `lifecycle/` owns
installed-native and container application checks. For a temporary native artifact:
`CP5_ARTIFACT_DIR=/absolute/artifact bun run --cwd apps/e2e test:lifecycle`.
`fixtures/wizard-preview.ts` is an explicit synthetic browser preview.
Neither E2E sources/dependencies nor fixtures are copied to production artifacts.
