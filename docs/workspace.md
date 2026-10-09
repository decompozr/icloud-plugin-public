# Independent packages and application boundaries

Account, Mail and Calendar backends have moved to `modules/account`, `modules/mail` and `modules/calendar`; server/process ownership
remains in the transitional app until the next phases. See [the accepted Studio
server migration](studio-server-migration.md).

The runtime application is `apps/icloud`; `apps/studio` owns its Svelte
SvelteKit presentation and Paraglide catalogs. Studio is built before the runtime
application; its compiled server/client output is embedded in that artifact. There is no
separate `apps/server` and no production MCP client. Codex and ChatGPT consume
Streamable HTTP; stdio is not an initial interface. `docs/` stays authoritative,
and retired experiment findings live in `docs/research/prototype-archive/`. Retained
library checks use application dependencies and run in the formal test suite.

```text
apps/icloud/src/
  index.ts         process entrypoint
  modules/         feature registration and lifecycle contracts
  mail/            Mail module and all Mail-owned implementation
    domain/        typed identities, results and provider ports
    services/      mailbox and outbound use cases
    icloud/        IMAP/SMTP/MIME/network adapters
    mcp/           Mail schemas and tool contributions
    storage/       Mail policy and outbound ledger
  server/          HTTP listeners, lifecycle and application composition
  mcp/             shared protocol host for registered tools
  auth/            shared owner Passkey/OAuth authentication
  admin/           private owner setup and management shell
  storage/         opaque encrypted owner state and bootstrap closure
  observability/   operation tracking and draining
  plugin/          configured client artifact generation
  ui/              shared page primitives
  i18n/            typed interface copy
```

Every source subsystem has a README describing its purpose, owned contracts,
use cases, dependencies, state/security boundaries, verification and limitations.
The [source index](../apps/icloud/src/README.md) links each one. Central
[architecture](architecture.md) owns cross-subsystem composition; the
[Mail contract](mailbox-tools.md) owns detailed user-facing operation semantics.
These documents are part of the source deliverable and must change with behavior.

External input is validated at runtime; internal ports carry explicit types.
Mail is the production feature module. Calendar remains an isolated feasibility
experiment, not a production registration. Source/test evidence and historical
owner-reported acceptance are recorded in [current status](current-status.md);
this layout inventory does not identify or verify a running release.

## Separate lifecycle commands

| Lifecycle | Command from repository root | Output and boundary |
| --- | --- | --- |
| Development | `bun bin/dev` | Runs source with watch; requires local app configuration. No deployment. |
| Build | `bun bin/build` | Typechecks then emits `apps/icloud/dist/index.js` for Bun. Does not start a service. |
| Release | `bun bin/release` | Packages the existing build and installed dependencies into a versioned host-platform archive under `releases/`; refuses overwrite. No build, registry upload or publication. |
| Runtime | `bun bin/runtime` | Runs the existing app build only; no compilation or dependency installation. |
| Verification | `bun bin/typecheck`, `bun bin/test` | Checks app and tooling units/types; `bun bin/e2e` uses the separate built-service project. Native helper acceptance remains explicit. |

Each package owns its manifest and independent version. The repository now uses
Bun workspaces and one committed root `bun.lock`; nested module UI manifests/locks
are consolidated into their feature package. Install from the project root:

```sh
bun install --frozen-lockfile
```

Studio depends on public package exports, not neighboring source paths. The
account, Mail and Calendar packages export backend and UI separately; other feature packages
expose UI until their backend extraction phase. Packages use independent versions,
which are separate from the application's release version. Packed workspace
references become exact versions; production installs local immutable tarballs
with an isolated consumer lock and frozen installation. Surface route sources
retain their independent source lock outside the server workspace.


Build emits `apps/icloud/dist`. Artifact assembly defaults to
`apps/icloud/build/<platform>-<arch>` and owns production dependencies at
`apps/icloud/node_modules` inside the assembled artifact. Release archives default
to `releases`. Neither step installs or restarts a service.
Extract the selected archive into `releases/<version>-<platform>-<arch>`.
For production, run that release's `./icloud-plugin install`; the default owned
installation is `~/.decompozr/plugins/icloud`. Root `releases/` holds distribution
artifacts, not production private state. The installation contains immutable
`releases/<version>-<platform>-<arch>`, an atomic `current` link, and separately
managed private configuration/custody/state under `runtime/`.
Run `~/.decompozr/plugins/icloud/current/icloud-plugin run` after configuring
`runtime/config.toml`. Installation never provisions an owner or launches a
service. `update` requires an existing owned installation; `--prefix PATH`
selects an explicit isolated instance. Neither action compiles or downloads.
The prior root `releases/runtime` deployment is historical; migration must stop
the old process and preserve private state and permissions before starting the
installed release without initialization.
 Runtime configuration is explicit TOML passed with `--config`; copy `apps/icloud/config.example.toml` outside the release. Apple credentials are enrolled through the private setup UI, never environment variables. The old `.env.example` is a superseded external-auth prototype. Never package configuration, `.env`, custody files or credentials.
The root MCP manifest intentionally has no configured server: deployment must
provide a reviewed URL using `docs/mcp.remote.example.json`. No app mapping ID or
active public endpoint is invented.

## Native Mac and Apple Container modes

Both are first-class runtime targets for the same service contracts. Native mode
uses macOS Bun. Container mode uses Linux Bun on the matching architecture;
a macOS native binary is not a Linux artifact. Current build output is JavaScript
with external dependencies, not a cross-platform executable. Package/release on
the target OS/architecture with compatible dependencies and test that artifact.
The archive includes dependency files; it still requires a compatible Bun runtime.

Native artifact installation and updates are implemented. Historical native
deployment observations are recorded separately in current status. Earlier application candidates passed isolated Linux
container checks; this does not establish live container acceptance or Linux
validation of release 0.1.17. Persistent login/reboot service installation and
live container deployment remain incomplete. See the
[deployment lifecycle](deployment-lifecycle.md) for operational boundaries.

Historical root build output once used `.flow-runtime/pre-workspace-dist`; it is
not part of the current lifecycle. Current builds use only the application paths above.

## Historical structural verification

Bun 1.4.2: frozen workspace install, strict app/test typecheck and build passed.
Twelve application tests passed (typed service/provider fixtures, MCP discovery
and invalid-input boundary, HTTP-only configuration). A local
`icloud-plugin-0.1.0-darwin-arm64.tar.gz` archive was produced and extracted into a
temporary directory; with an empty environment it resolved dependencies and
stopped at the expected configuration rejection before listening. No private
`.env` was in the archive. This is a packaging/import check, not a successful
runtime login or Linux application acceptance. No playground suite was rerun.

## Test and command ownership

`apps/icloud/src` contains production code and colocated component/unit `.test.ts`
files. `apps/e2e` is an independent Bun package: runtime imports use the existing private built
application modules, and it owns protocol/HTTP/lifecycle fixtures. E2E code is not a
production dependency or release payload. `bin` provides lifecycle command entry
points; reusable build/deployment implementations and their colocated tests live
in `packages/tooling/src`. Playground experiments remain independent.

## Independent package verification

The package-isolation change passed frozen installs independently in all three
packages with no root `node_modules`, application/tooling typechecks and build,
unit tests, and 11 built E2E tests (236 assertions). Version 0.1.19 was assembled
with production dependencies under its application directory and archived using
the application build and root release defaults. An archive extracted outside the checkout passed
installation, initialization with synthetic state, two starts, preserved custody,
and graceful shutdown (25 assertions). Dependency symlinks remain inside their
own package. Existing locked dependency versions were retained.

Container build definitions now install the app and tooling separately. Linux
execution was not rerun: the local Apple Container API server was not running or
registered with launchd. Historical Linux checks do not validate this new layout.

## Flow task runtime

Agent task records, raw logs, fixture screenshots and candidate artifacts use the
project-relative ignored `.decompozr/flow/run/`. This is development workflow state,
not the installed service's configuration, account database or key custody.

Top-level task JSON files are compact checkpoints: goal/phase, accepted decisions,
verification, PR/source/deployment references and next step. Completed records are
history, not live runtime/version reports. Temporary signed-build receipts record
verified source/signature and artifact paths; nested package/artifact JSON belongs
to build outputs. None replaces the installed service's protected `runtime/`.

The active checkout's legacy directory was moved after its writers completed; the
byte-preserving move was checked before task-reference reconciliation. Retain
uncertain state in other checkouts rather than sweeping shared directories. Raw
task artifacts are removed after outcomes are preserved in source docs and upgrade
receipts; compact checkpoints remain for the next migration phase.
