# Bun workspace and application boundaries

The accepted structure has one complete application, `apps/icloud`. There is no
separate `apps/server` and no production MCP client. Codex and ChatGPT consume
Streamable HTTP; stdio is not an initial interface. `docs/` stays authoritative,
and `playground/` remains separate experiments with independent packages/locks.

```
apps/icloud/
  src/
    index.ts       composition root
    server/        HTTP routers, transport and lifecycle wiring
    mcp/           MCP schemas, tool handlers and protocol results
    services/      mailbox use cases; no HTTP/MCP/provider imports
    domain/        typed requests/results/identities and provider ports
    icloud/        IMAP/SMTP/MIME adapters
    auth/          token verification and access policy
    admin/         private setup and owner credential management
    storage/       encrypted owner state and persistent bootstrap closure
  # unit/component .test.ts files live beside their modules
  package.json
  tsconfig.json
  config.example.toml
```

External input is validated at runtime; internal ports carry explicit types.
CP1–CP5 implement these boundaries and pass reviewed local checkpoints. The
maintained owner Passkey/OAuth provider is composed into both private and public
routers; the earlier external JWT verifier remains a compatibility/test module.
The deployed 0.1.16 Mail surface includes send, reply and draft creation, with
owner-reported live acceptance. Deployed release 0.1.17 additionally implements
bounded attachments, existing-draft read/edit/send and forwarding; these new
actions are not yet live-accepted. Owner enrollment and a fresh ChatGPT connection have
been completed. See [current status](current-status.md) and the
[roadmap](roadmap.md) for remaining acceptance and historical evidence.

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
