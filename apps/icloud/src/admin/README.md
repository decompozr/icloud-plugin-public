# Private owner setup and management

`createPrivateAdmin` implements the private setup wizard and owner dashboard.
Use cases are checking prerequisites, completing first-owner enrollment, replacing
or removing the stored provider credential, viewing connection/capability status,
changing operator capabilities and downloading the configured plugin ZIP.
`page.ts` renders the shell and `browser.ts` implements its same-origin interactions.

## Dependencies and boundary

The caller supplies trusted connectivity diagnostics, owner-session verification,
the opaque owner store, provider credential validation, capability accessors and
optional presentation/plugin archive hooks. Capability keys and display metadata
come from composition rather than Mail storage imports. The handler verifies that
submitted policy keys match the current policy and requires explicit confirmation
for elevation. Enabling capabilities never changes existing OAuth grants.

The current credential form remains the single Apple account address/app-specific
password workflow. It is not a general multi-feature credential registry: adding
Calendar with different enrollment requirements needs an explicit integration.
The shell uses shared UI/i18n; Mail-specific presentation is supplied from Mail.

## Data flow and security

Setup checks private connectivity before Passkey enrollment or credentials. An
eligible enrollment session, independent internally injected bootstrap proof and
successful provider validation precede owner-store enrollment. A failed validation
can retry without exposing the password. Management requires the authoritative owner
session; POST operations require exact private Origin, JSON content type and bounded
validated bodies. The handler must only be mounted on the private listener.

Status returns whether a credential exists, never its contents. Credential rotation
replaces the single stored account. Local removal does not delete mail, revoke the
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
