# iCloud plugin

The project is named **icloud-plugin**. Mail and an optional registered Calendar module share one authenticated MCP server. Calendar is disabled by default and requires separate operator permissions and client consent; see [Calendar acceptance](docs/calendar-production.md) for verified behavior and remaining limitations. Drive, Contacts and Photos remain planned.

The goal is to provide precise, basic iCloud mailbox tools for external agents
in Codex and ChatGPT first, through the intended Tailscale setup on this Mac.
Dots and other providers are deferred; future support can be added when needed.
The agent owns scheduling, rules, approval decisions, notifications and reports. **Implementation proceeds through reviewed checkpoints in the
[roadmap](docs/roadmap.md).** Mailbox checkpoints CP1/CP2 are reviewed. Owner setup/authentication CP3/CP4 is independently reviewed for local automated integration; native and Linux runtime checks pass. The native 0.1.17 service is enrolled and connected through ChatGPT. The owner reported successful read/search/tag, Junk/Trash moves, draft creation and send/reply threading. Release 0.1.17 adds attachments, existing-draft operations and forwarding; these new actions and actual client catalog refresh still require live acceptance. See [current status](docs/current-status.md) for evidence and remaining gates. Sending is disabled by default in new installations and requires explicit operator enablement and OAuth consent.

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
This multi-account source change is not deployed. Local synthetic-ceremony verification is recorded in the roadmap; the owner has also completed the real browser ceremony.

## Documentation map

- **Authoritative intent:** [project decisions](docs/project.md),
  [mailbox requirements](docs/mailbox-tools.md), [setup/auth requirements](docs/setup-and-auth.md)
  and [deployment/lifecycle requirements](docs/deployment-lifecycle.md).
- **Durable engineering knowledge:** [findings and implications](docs/knowledge.md)
  connect observations to requirements without selecting unproven architecture.
- **Supporting evidence:** [experiment register](docs/experiments.md),
  [detailed research](docs/research.md), [upstream references](docs/references.md)
  and the isolated `playground/` fixtures. Passing a fixture is not production acceptance.

Implementation follows these prose specifications. Historical deployment drafts
and unfinished source do not override them.

[Architecture comparison and contract defaults](docs/architecture.md) distinguish
resolved internal choices from deployment recommendations and remaining evidence.

The accepted [independent package and lifecycle layout](docs/workspace.md) has one complete
`apps/icloud` application, typed server/service/auth/MCP boundaries, Streamable
HTTP, and distinct dev/build/release/runtime phases for Mac and Apple Container.

[Local owner setup](docs/local-setup.md) describes the explicit TOML configuration, protected installation custody and private setup flow being verified in CP3/CP4.

[Configured client artifact](docs/client-artifact.md) explains the separate Codex marketplace export and ChatGPT remote connection flow. The repository MCP descriptor is a template; export produces a concrete HTTPS URL without credentials.

Each app/package owns its manifest, lockfile and dependencies; the repository root is not a Bun workspace. See the linked layout for per-package installation and `bun bin/checkpoint` verification.
