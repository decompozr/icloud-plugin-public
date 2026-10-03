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
- Toolchain: Bun. Native Mac and Apple Container/Linux are both implemented runtime modes; native mode hosts the current private setup.
- Owner enrollment and client access follow the accepted
  [setup and authentication flow](setup-and-auth.md). CP3/CP4 implement this flow with independently reviewed local E2E; the owner has completed real enrollment and ChatGPT authorization.
- Sequence: establish the local repository first, then documentation, before
  implementing the reviewed checkpoints.
- Prose specifications come first; implementation follows the agreed specifications.
  Bun produces normal compiled system output. No custom documentation compiler.
- Small experiments are welcome; they must state the question and report actual
  evidence separately from assumptions.

The private `scottchu/icloud-plugin` GitHub repository has been initialized
with the prose foundation. Current work implements the accepted [checkpoint roadmap](roadmap.md) with
automated E2E and independent review at each gate. Public activation, real
credentials, user Passkey ceremonies and account linking require their concrete
setup steps; no commit or push is implied.

## Decision status

[Architecture and internal contracts](architecture.md) now provide concrete
engineering defaults for message IDs, limits, pagination, result/error shapes
and summary representation. Those are no longer unspecified questions.

| Area | Current position | Remaining decision or evidence |
| --- | --- | --- |
| Mail contracts | CP1/CP2 implemented and independently reviewed | UIDPLUS observed; owner-reported read/search/tag/Junk/Trash acceptance recorded. Other actions remain individually unverified. |
| Auth origin/routing | Separate private/public routers on one hostname; private Serve is live | Owner Passkey and ChatGPT connection completed; Codex connection remains unverified. |
| Mail primitives | ImapFlow adapter uses exact UID operations and native MOVE or checked UIDPLUS fallback; uncertain results stay unknown | Provider-specific behavior and live acceptance. |
| Tags/Junk/unsubscribe | Capability and DKIM/destination checks implemented and fixture-tested | Actual provider support and authorized live submission. |
| Credential custody | External owner-only key/marker and encrypted SQLite; lost state fails closed | Recovery drill remains unverified; owner enrollment completed. |
| Container runtime | Actual Linux image, E2E and restart checks pass; host proxy alternative tested | Live container/Tailscale deployment and host sleep/logout/reboot behavior. |

Agent approvals remain separate from server checks. Recommendations are not
silently promoted to accepted deployment choices.

## Preserved draft and evidence limits

An earlier implementation attempt created source, tests, dependency files,
plugin manifests, a workflow skill and deployment notes before discussion was
complete. These remain local, untracked drafts excluded from the initial foundation commit;
the initial draft is being replaced through checkpoints. General draft/send operations were removed from the public CP1 interface. The
owner subsequently authorized send/reply/create-draft development after Mail
reliability; the next source checkpoint adds them with separate mail.send
permission and false-default sending policy. Existing-draft editing is not implemented. Project-local
`node_modules/` and build output also remain; they are ignored by Git.

Historical worker reports, not rerun in this foundation step: nine mail tests
passed under Bun; a build reported an unresolved server typing error. Earlier
review identified issuer trailing-slash normalization and mismatches between
documentation and runtime environment loading/owner-subject configuration.
These reports do not establish build success, authentication correctness or
live integration. They are historical and superseded by the current checkpoint evidence.

Scoped private Serve and public Funnel routes now host the native instance.
The owner connected ChatGPT and reported live mailbox actions; the assistant
performed only an authenticated capability diagnostic, not message mutations.
No live outgoing mail or draft creation has been performed by the assistant,
and no public product publication has occurred.

## Lifecycle scope

| Area | Current status |
| --- | --- |
| Dev | Typed Bun application and separate experiments; CP1–CP5 reviewed |
| Build | Server/browser builds and strict checks pass; native and Linux E2E recorded |
| Release | Immutable versioned native artifact and Linux image built; no publication |
| Install | Project-local native instance and private Serve route live; owner enrollment and ChatGPT connection completed |
| Update | Owned install/current mechanism tested; migrations and cross-version rollback need explicit future evidence |
| Uninstall | Scoped owned-resource removal tested; live instance intentionally retained for owner setup |

Future decisions should update this document before implementation. Experiments
belong in [the register](experiments.md), with a clear result and limitations.

## Specification and evidence ownership

[Mailbox M01–M11](mailbox-tools.md#required-behavior-derived-from-evidence),
[authentication A01–A07](setup-and-auth.md#required-authentication-and-storage-outcomes)
and [lifecycle D01–D07](deployment-lifecycle.md#required-observable-outcomes)
are authoritative intended outcomes derived from the experiments. Exact schemas,
provider-dependent behavior, libraries, storage/key choices and topology remain
open where those documents say so. [Engineering knowledge](knowledge.md) explains
the evidence; [the register](experiments.md) records verification status. Neither
local test success nor a specification implies implemented product acceptance.

## Accepted application structure

One complete Bun application lives in `apps/icloud`; no separate server app or
production MCP client. Server transport, MCP handlers, mailbox services, typed
domain/provider ports and auth are distinct. Streamable HTTP is the initial
interface; stdio is excluded. Native Mac and Apple Container are first-class
runtime modes with distinct dev/build/release/runtime lifecycles. See
[workspace](workspace.md) for paths and current limitations.
