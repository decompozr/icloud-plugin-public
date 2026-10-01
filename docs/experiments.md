# Experiment register

Record questions, observable acceptance and evidence before turning an experiment
into a product decision. Never record an unexecuted check as passing.

| ID | Question | Acceptance / observation | Evidence and status |
| --- | --- | --- | --- |
| E01 | Is Bun available in the current shell? | The installed executable reports its version without installation or configuration changes. | Observed 2026-10-01: `bun --version` returned `1.4.2`. This does not validate the draft application. |
| E02 | Is this directory already a Git repository? | Inspect before initializing; preserve existing files and repositories. | Observed 2026-10-01: initial `git status --short --branch` reported no repository. Local `git init -b main` then succeeded. No commit or remote was created during that experiment. Subsequent repository initialization is recorded in project status. |
| E03 | What does documentation as source mean? | User agrees the source format and relationship to implementation. | Resolved by user: prose specs first; implementation follows the specs. Normal Bun compilation, no custom docs compiler. No experiment required. |
| E04 | Can Bun support the proposed MCP client/server flow? | After scope agreement, define a credential-free protocol handshake and tool-discovery check with explicit expected results. | Proposed only; not executed or authorized in this foundation step. |
| E05 | Which Tailscale connection route fits the initial Codex and ChatGPT clients? | Compare client reachability and exposure requirements before choosing Serve, Funnel or another route; any live exposure requires separate authorization. | Proposed only; no network or Tailscale check executed. |
| E06 | Which upstream behavior is safe to adapt? | Review selected upstream mail operations against agreed message targeting, read limits and tool correctness and agent/server responsibility boundaries before reuse. | Proposed only for the next requirements step; no new source review or feature test executed here. |
| E07 | Does iCloud support usable tags independently of folders and flags? | After authorization, test supported keyword advertisement, add/remove persistence and client visibility on a designated message; document unsupported behavior without relabeling folder moves as tags. | Proposed; not executed. |
| E08 | What do junk and not-junk operations actually do? | Establish supported special-folder operations and distinguish movement from spam classification/training; compare selected and unrelated messages and record destination semantics. | Proposed; not executed. |
| E09 | Which unsubscribe mechanisms can be offered precisely? | First use fixtures to classify mailto, one-click and ordinary links, malformed headers, redirects and absent mechanisms. Specify safe supported requests and observable outcomes before any live request; distinguish submission from confirmed removal. | Proposed; no link visited or unsubscribe email sent. |
| E10 | How should trash/restore, archive and flags map to iCloud state? | Establish special-folder discovery, supported flag behavior and post-move identity; define restore behavior when the original folder is unknown without guessing. Verify reversible effects only on selected messages. | Proposed; not executed. |
| E11 | What does full versus summary reading return? | Agree content/summary representation, bounds, truncation and unread preservation; use fixtures to verify truthful output and stable actionable identities. | Proposed; not executed. |

Feature tests, mailbox access, authentication interoperability and Tailscale/Codex/ChatGPT
connectivity are outside the current documentation step. Historical reports are
summarized in [project status](project.md); they were not rerun here.

Dots and other providers are deferred; no initial experiment or acceptance check
is required for them. No generic provider framework is proposed.
