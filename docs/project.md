# Project decisions and status

This document is the authoritative record of accepted direction and unresolved
scope. Existing implementation and deployment drafts do not establish decisions.

## Accepted direction

- Goal: provide precise, basic iCloud mailbox tools callable by external agents
  in Codex and ChatGPT first, through the intended Tailscale setup.
- Dots and other providers are deferred and are not initial acceptance targets.
  Future support can be added if needed; no generic provider framework is in scope.
- Boundary: agents own periodic scheduling, rules, approval decisions,
  notifications and reports. This service owns correct tool execution,
  authentication and input validation.
- Mail capabilities and exclusions are defined in [the mailbox specification](mailbox-tools.md).
- Host: this Mac.
- Toolchain: Bun.
- Sequence: establish the local repository first, then documentation, before
  resuming feature implementation.
- Prose specifications come first; implementation follows the agreed specifications.
  Bun produces normal compiled system output. No custom documentation compiler.
- Small experiments are welcome; they must state the question and report actual
  evidence separately from assumptions.

Current work initializes the private `scottchu/icloud-mail-plugin` GitHub
repository with the authoritative prose foundation. The initial commit and push
are authorized. Feature implementation, global installation, service activation
and product publication remain outside this step.

## Decisions still needed

- Connection architecture: local versus remote MCP transport, the role of
  Tailscale Serve/Funnel, and authentication/account ownership.
- Exact tool contracts, full versus summary read representation, pagination and
  message identity/error semantics. Scope is agreed; mechanics remain undecided.
- Actual iCloud capabilities for tags, junk/not-junk behavior, restore destinations
  and unsubscribe email/link mechanisms. See the experiment register.
- Credential storage, operational availability, client installation flow and
  the boundary between agent approvals and server-enforced access permissions.

## Preserved draft and evidence limits

An earlier implementation attempt created source, tests, dependency files,
plugin manifests, a workflow skill and deployment notes before discussion was
complete. These remain local, untracked drafts excluded from the initial foundation commit;
feature work is paused. Existing general draft/send
tools are outside the agreed product scope; preserving them does not authorize
their use or inclusion in the final system. Project-local
`node_modules/` and build output also remain; they are ignored by Git.

Historical worker reports, not rerun in this foundation step: nine mail tests
passed under Bun; a build reported an unresolved server typing error. Earlier
review identified issuer trailing-slash normalization and mismatches between
documentation and runtime environment loading/owner-subject configuration.
These reports do not establish build success, authentication correctness or
live integration. Do not repair them until feature work resumes.

No live mailbox access, email sending, public endpoint activation, plugin
installation or product publishing has been performed by this work. Creating
the private source repository does not deploy or install the plugin.

## Lifecycle scope

| Area | Current status |
| --- | --- |
| Dev | Private GitHub repository and authoritative prose foundation; feature work paused |
| Build | Bun selected for normal compiled system output; draft build not passing historically |
| Release | Deferred; no release or publishing authorized |
| Install | Deferred; no client or service installation validated |
| Update | Deferred until the architecture and installation method are agreed |
| Uninstall | Deferred until installation ownership is defined; no service installed by this work |

Future decisions should update this document before implementation. Experiments
belong in [the register](experiments.md), with a clear result and limitations.
