# Private owner setup and management

`createPrivateAdmin` implements the private setup wizard and owner dashboard.
Use cases are checking prerequisites, completing first-owner enrollment, replacing
or removing the stored provider credential, viewing connection/capability status,
changing operator capabilities and downloading the configured plugin ZIP.
`page.ts` adapts the host presentation/locale to the compiled Svelte renderer in
`apps/studio`. Studio owns the hydrated shell and reactive browser workflows. The handler supplies
only an owner-checked presentation model to Kit, retaining mutation authority.

## Dependencies and boundary

The caller supplies trusted connectivity diagnostics, owner-session verification,
the opaque owner store, provider credential validation, capability accessors and
optional presentation/plugin archive hooks. Capability keys and display metadata
come from composition rather than Mail storage imports. The handler verifies that
submitted policy keys match the current policy and requires explicit confirmation
for elevation. Enabling capabilities never changes existing OAuth grants.

Owner setup ends after Passkey enrollment. Mail credentials are added through the
public OAuth account chooser after owner login. Private management lists accounts
and targets rotation/revocation by stable account ID. This remains one owner's
installation, rather than unrelated-owner registration or a multi-feature provider
registry. Calendar enrollment still needs an explicit integration.

## Data flow and security

Setup checks private connectivity before Passkey enrollment. An
eligible enrollment session, independent internally injected bootstrap proof precede owner-store enrollment without Apple credentials. Public account addition
requires provider validation before encrypted persistence. Management requires the authoritative owner
session; POST operations require exact private Origin, JSON content type and bounded
validated bodies. The handler must only be mounted on the private listener.

Status returns whether a credential exists, never its contents. Credential rotation
replaces only the named account secret. Local removal does not delete mail, revoke the
Apple password or revoke OAuth grants. Plugin export is owner-only and contains no
server secrets. The configured public MCP URL is connection guidance, not a
readiness check or permission to activate routing.

## Verification and limitations

Colocated handler/page tests cover authorization, setup retries, provider rejection,
secret exclusion, capability updates and rendered interaction hooks. Synthetic
provider/diagnostic fixtures do not establish actual Tailscale reachability, live
Apple login or a physical Passkey ceremony. Browser visual/accessibility checks
remain separate from handler tests. See [setup/auth](../../../../docs/setup-and-auth.md),
[design language](../../../../docs/design-language.md) and
[client artifact](../../../../docs/client-artifact.md).

## Existing connection capability updates

Connections exposes the generic installation-owner registration management flow
when currently enabled scopes are missing from an eligible existing client. Review
shows actual additional permissions and requires fresh confirmation before the
private API changes the registration ceiling. Existing consent, tokens, client
identity and account credentials remain unchanged. Shared/foreign or unrelated
anonymous registrations cannot use this update. Refresh and explicitly consent on
the same client connection afterward; installation or registration does not prove
that the remote host loaded tools. See the [module contract](../modules/README.md).
