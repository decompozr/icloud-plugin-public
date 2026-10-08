# iCloud plugin

The project is named **icloud-plugin**. Mail and an optional registered Calendar module share one authenticated MCP server. Calendar is disabled by default and requires separate operator permissions and client consent; see [Calendar acceptance](docs/calendar-production.md) for verified behavior and remaining limitations. Drive and Contacts remain planned; Photos is implemented as an optional module pending live acceptance.

The current preparation target is **one accepted iCloud account through a custom
MCP connection**, with Mail and Calendar enabled by existing owner policy and
explicit OAuth consent. The running Mac installation is diagnostic **0.1.26**;
this branch prepares source changes without publishing, installing or restarting
it. See the [single-account production audit](docs/single-account-production-readiness.md)
for fixes, verified behavior, remaining gates and the next approval boundary.
Sending is disabled by default in new installations and requires operator
enablement and OAuth consent.

Photos feasibility experiments are complete. The accepted implementation is a
Bun API backed by a pinned local osxphotos provider, with a Swift/PhotoKit helper
only where needed. Existing person labels and true Shared Album reads have been
verified on the synced Mac library; native sharing and deletion source is implemented, with live acceptance pending.
See the [build plan and evidence](docs/photos-capability-plan.md). Historical
retired prototype history is described in [the experiment archive](docs/research/prototype-archive/photos.md).
An opt-in [Photos module](apps/icloud/src/photos/README.md) now implements read tools
and reviewed album, metadata and deletion workflows. Empty ordinary-album lifecycle writes are verified; native asset writes and
Shared Album upload remain unverified.
No production Photos capability is deployed.


[Project decisions and status](docs/project.md) are the authoritative foundation.
[Mailbox scope and expected outcomes](docs/mailbox-tools.md) define the agreed
capabilities and boundaries. [The experiment register](docs/experiments.md) separates questions, acceptance
criteria and observed evidence. Bun is the selected project toolchain.

Prose specifications come first; implementation follows the agreed specifications.
Bun produces normal compiled system output. No custom documentation compiler is
planned.

The original commit contains the prose foundation. The repository now includes the application, lifecycle tooling, tests and isolated experiments. Earlier deployment proposals are preserved as historical evidence. No general provider framework is planned at this stage. The private native setup service and its Tailscale Serve route are now configured. The owner completed credential enrollment and client authorization; secrets remain server-side.

The draft adapts [minagishl/icloud-mail-mcp](https://github.com/minagishl/icloud-mail-mcp).
Upstream MIT attribution is preserved in [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).

See [reference implementations](docs/references.md) for the three upstream
examples, their documented capabilities and evidence limits.

[Research findings and Bun experiments](docs/research.md) compare operation
mechanics, feasibility, and the evidence behind current implementation.

The accepted [setup and authentication flow](docs/setup-and-auth.md) uses private
Tailscale owner enrollment with a Passkey, followed by OAuth client access with
Passkey login and an iCloud account chooser. Each connection selects or adds one
iCloud account using an Apple app-specific password on the hosted connection page.
Account isolation has synthetic coverage; the current release claim is limited to one accepted account. Multiple-account client acceptance remains outside this preparation scope.

## Documentation map

- **Authoritative intent:** [project decisions](docs/project.md),
  [mailbox requirements](docs/mailbox-tools.md), [setup/auth requirements](docs/setup-and-auth.md)
  and [deployment/lifecycle requirements](docs/deployment-lifecycle.md).
- **Durable engineering knowledge:** [findings and implications](docs/knowledge.md)
  connect observations to requirements without selecting unproven architecture.
- **Supporting evidence:** [experiment register](docs/experiments.md),
  [detailed research](docs/research.md), [upstream references](docs/references.md)
  and the [retired prototype archive](docs/research/retired-prototypes.md). Useful library
  checks now run with the formal tests. Passing a fixture is not production acceptance.

Implementation follows these prose specifications. Historical deployment drafts
and unfinished source do not override them.

[Architecture comparison and contract defaults](docs/architecture.md) distinguish
resolved internal choices from deployment recommendations and remaining evidence.

The accepted [independent package and lifecycle layout](docs/workspace.md) has one complete
`apps/icloud` application, typed server/service/auth/MCP boundaries, Streamable
HTTP, and distinct dev/build/release/runtime phases for Mac and Apple Container.

[Local owner setup](docs/local-setup.md) describes the explicit TOML configuration, protected installation custody and private setup flow being verified in CP3/CP4.

[Configured client artifact](docs/client-artifact.md) explains the separate Codex marketplace export and ChatGPT remote connection flow. The repository MCP descriptor is a template; export produces a concrete HTTPS URL without credentials.

[Studio](apps/studio/README.md) owns the Svelte admin/auth presentation.
[Migration phases](docs/svelte-migration.md) describe the acceptance gates.

Install the declared module packages with `bun install --frozen-lockfile` at the repository root. Bun workspaces share one committed lock; each module owns its version and public server/UI exports. See the linked layout and `bun bin/checkpoint` verification.
