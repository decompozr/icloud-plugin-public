# iCloud Mail plugin — planning foundation

The goal is to provide precise, basic iCloud mailbox tools for external agents
in Codex and ChatGPT first, through the intended Tailscale setup on this Mac.
Dots and other providers are deferred; future support can be added when needed.
The agent owns scheduling, rules, approval decisions, notifications and reports. **Feature implementation is paused for
requirements discussion.** Existing code, manifests and deployment notes are
preserved, incomplete drafts; they are not a working or accepted integration.

[Project decisions and status](docs/project.md) are the authoritative foundation.
[Mailbox scope and expected outcomes](docs/mailbox-tools.md) define the agreed
capabilities and boundaries. [The experiment register](docs/experiments.md) separates questions, acceptance
criteria and observed evidence. Bun is the selected project toolchain.

Prose specifications come first; implementation follows the agreed specifications.
Bun produces normal compiled system output. No custom documentation compiler is
planned.

This initial repository contains the prose specification foundation. Unfinished
runtime code and earlier deployment proposals are preserved locally and excluded
from the initial commit. No general provider framework is planned at this stage. No mailbox, OAuth provider, Tailscale endpoint
or client connection has been configured by this work.

The draft adapts [minagishl/icloud-mail-mcp](https://github.com/minagishl/icloud-mail-mcp).
Upstream MIT attribution is preserved in [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
