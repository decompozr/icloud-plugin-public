# Account backend

Server-only owner identity, Passkey/OAuth handlers, account selection and client
authorization management, local-owner proof/pairing and encrypted credential/session
storage. The backend entry has no Svelte components, browser code or application/UI imports.
Feature components and browser protocol/dialog state live in the separate `ui/`
package; they never import the backend entry.
The backend public export is `@decompozr/account/server`; UI exports are under
`@decompozr/account/ui`. The package owns its independent version.
The UI entry is `ui/index.ts`; universal schemas live in `packages/contracts`.

The caller supplies SQLite, owner lookup, configured origins/scopes, proof checks
and credential-validation callbacks. It owns provisioning, listener selection,
key custody, accepted-operation draining and database closure. Construction never
creates a second server or grants a capability. Account connection contracts and
bounded OAuth error helpers belong here; admin presentation consumes them.

From this directory, install pinned dependencies with `bun install --frozen-lockfile`,
then `bun run build` or `bun test src`. At the project root, `bun bin/build` and
`bun bin/test` build this module before its consumers. Production distribution
installs the packed versioned backend into the current installed service; it does not ship module
tests, workers or repo-relative source paths. Runtime dependencies resolve from the
single installed application's existing pinned dependency set.

[Authentication](src/auth/README.md) and [storage](src/storage/README.md) describe
security and persistence boundaries. [The migration plan](../../docs/studio-server-migration.md)
records phase acceptance and the transition to Studio as the only server app.
