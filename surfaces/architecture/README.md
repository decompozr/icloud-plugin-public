# iCloud architecture atlas

A project-owned Surface route explaining the current iCloud plugin source and the proposed dynamic module lifecycle. The guide uses Traditional Chinese product copy, block diagrams, tables, a request walkthrough, per-module details, and a local-only enable/disable simulator.

## Scope and decisions

- One shared authenticated MCP endpoint and private owner administration remain the architecture boundary.
- Current composition is explicit before startup; dynamic policy gates are distinct from hot module loading or unloading.
- Future module selection should control configuration contributions, owned resources, tools, and minimum permission requirements.
- Disable should block new work, drain accepted operations, dispose owned resources, and reconcile OAuth grants, provider custody, and OS authorization separately.
- Shared credentials must remain while another enabled module needs them. Cleanup must remain visible until externally required steps are verified.
- Disposing JavaScript resources does not prove code unloading. Separate workers/processes or controlled restart require further design.
- Simulator switches change page state only. No account, provider, permission, runtime or global configuration is mutated.

## Source evidence

Paths below are relative to the repository root:

- `apps/icloud/src/server/application.ts`: Mail/Calendar registration and conditional Photos composition; shared admin/auth integration.
- `apps/icloud/src/modules/runtime.ts` and `context.ts`: module contracts, dynamic policy, invocation tracking, request identity and whole-runtime disposal.
- `apps/icloud/src/mcp/server.ts` and `README.md`: discovery and invocation scope checks.
- `apps/icloud/src/{mail,calendar,photos}/module.ts`: actual module contributions.
- Feature READMEs and `apps/icloud/src/{auth,admin,storage}/README.md`: subsystem ownership and evidence limits.
- `apps/icloud/src/photos/{provider,shared-albums}.ts`: local/native and separate provider-session paths; source presence does not prove remote/cloud acceptance.

Some older overview prose still describes Calendar as unimplemented. The guide uses current composition and feature source instead. Installed application versions and live provider behavior were not verified during this documentation task.

Apple references in the guide explain owner-controlled Photos privacy settings and development authorization reset. They do not establish automatic production revocation support.

## Verification

- Shared Surface status/doctor: running and ready.
- Pinned Svelte 5.57.1 client compilation: passed with zero warnings.
- Chrome browser smoke against the shared HTTPS service: HTTP 200, rendered module details, Photos enable/disable and pending cleanup state, and module tab switching passed with no page errors.
- At a 390-pixel viewport, the guide container matched the viewport width. This is a responsive layout smoke check, not a complete visual/accessibility audit or second-device acceptance.
- No Apple permissions were requested or revoked; no production iCloud service was changed.

## Canonical hosting

The accepted hosting target is the primary repository checkout on `main`. Register that checkout and mount the surface ID recorded in `surface.project.json` using the existing shared Surface CLI. Use the returned main workspace URL. Keep the main mount available after task-worktree cleanup; mounted source must remain on disk.

To edit, use an isolated task checkout, verify the page, merge to main, and refresh the main mount. A task preview can be retired only after the main mount is ready and verified. The page is documentation and a browser-only simulator; it does not require an iCloud application release or restart.
