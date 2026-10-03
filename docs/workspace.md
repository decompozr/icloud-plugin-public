# Bun workspace and application boundaries

The accepted structure has one complete application, `apps/icloud`. There is no
separate `apps/server` and no production MCP client. Codex and ChatGPT consume
Streamable HTTP; stdio is not an initial interface. `docs/` stays authoritative,
and `playground/` remains separate experiments with independent packages/locks.

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
| Development | `bun run dev` | Runs source with watch; requires local app configuration. No deployment. |
| Build | `bun run build` | Typechecks then emits `apps/icloud/dist/index.js` for Bun. Does not start a service. |
| Release | `bun run release` | Packages the existing build and installed dependencies into a versioned host-platform archive under `releases/`; refuses overwrite. No build, registry upload or publication. |
| Runtime | `bun run runtime` | Runs the existing app build only; no compilation or dependency installation. |
| Verification | `bun run typecheck`, `bun run test` | Checks app and tooling units/types; `bun run e2e` uses the separate built-service project. Playground remains explicit. |

Install workspace dependencies with `bun install --frozen-lockfile` after the
root lockfile is updated. Runtime configuration is explicit TOML passed with `--config`; copy `apps/icloud/config.example.toml` outside the release. Apple credentials are enrolled through the private setup UI, never environment variables. The old `.env.example` is a superseded external-auth prototype. Never package configuration, `.env`, custody files or credentials.
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

Native artifact installation and updates are implemented, and the owned native
service runs 0.1.17. Earlier application candidates passed isolated Linux
container checks; this does not establish live container acceptance or Linux
validation of release 0.1.17. Persistent login/reboot service installation and
live container deployment remain incomplete. See the
[deployment lifecycle](deployment-lifecycle.md) for operational boundaries.

Old root build output was preserved under ignored `.flow-runtime/pre-workspace-dist`.
It is not current output. No existing private configuration was moved or created.

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
files. `apps/e2e` is a separate Bun workspace: runtime imports use the existing private built
application modules, and it owns protocol/HTTP/lifecycle fixtures. E2E code is not a
production dependency or release payload. `bin` provides lifecycle command entry
points; reusable build/deployment implementations and their colocated tests live
in `packages/tooling/src`. Playground experiments remain independent.
