# iCloud application source

The application composes shared infrastructure with feature modules. Mail owns its
complete behavior under `mail/`; the host consumes registered capabilities. The
central [architecture](../../../docs/architecture.md) explains composition and the
[workspace guide](../../../docs/workspace.md) explains package/build ownership.

| Subsystem | Owned responsibility and entry documentation |
| --- | --- |
| [modules](modules/README.md) | Registration contracts and module lifecycle |
| [mail](mail/README.md) | Mail use cases, providers, tools and feature state |
| [server](server/README.md) | Listeners, transport, settings and composition |
| [mcp](mcp/README.md) | Generic MCP host and registered-tool dispatch |
| [auth](auth/README.md) | Owner Passkeys, OAuth, token and session verification |
| [admin](admin/README.md) | Private setup and owner-management interface |
| [storage](storage/README.md) | Owner enrollment and opaque secret custody |
| [observability](observability/README.md) | Operation lifecycle and bounded telemetry |
| [plugin](plugin/README.md) | Configured downloadable client artifact |
| [ui](ui/README.md) | Shared page styles and markup primitives |
| [i18n](i18n/README.md) | Typed owner-interface language resources |

`index.ts` owns process startup/teardown. Source documentation is part of each
subsystem's implementation: behavior changes must update the owning README and
contract links. Tests live beside their modules; protocol/process scenarios live
in [apps/e2e](../../e2e/README.md). Calendar is not a production subsystem.
