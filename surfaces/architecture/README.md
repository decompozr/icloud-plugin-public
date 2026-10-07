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

## Verification and disposition (2026-10-06)

- Shared Surface status/doctor: running and ready.
- Source registered and mounted successfully with the pinned Svelte 5.57.1 dependency and generated Bun lockfile.
- Direct Svelte client compilation: passed with zero warnings.
- Browser rendering, mobile layout, and browser interaction checks: **not completed** before the user requested worktree cleanup.
- No live Apple permissions were requested or revoked; no production iCloud service was changed.
- User requested cleanup. Preserve this source in a local commit and retain its task branch, unmount/retire the task Surface workspace, then remove only the task checkout and its generated dependencies. No remote publication or merge was requested.

## Restore

Create a new linked worktree from the retained `explain-modular-architecture` branch. From that checkout, register the project and mount the surface ID recorded in `surface.project.json` using the shared Surface CLI. Use the returned new preview URL; do not assume the retired workspace URL is reusable. Complete browser verification before claiming rendering or interaction acceptance.

## Preview restored after clarification

The user clarified that the Surface page must remain available. The previous cleanup interpretation was incorrect. The original disposable worktree remains removed; this dedicated `architecture-preview` checkout is intentionally retained as the live page source. Registration and mount returned ready at `/workspace/icloud-plugin/architecture-preview/architecture/`. The existing shared service was not restarted. Browser automation was attempted but unavailable because the local Playwright browser executable was missing; no browser was installed. Keep the mounted checkout while the user uses the preview.
