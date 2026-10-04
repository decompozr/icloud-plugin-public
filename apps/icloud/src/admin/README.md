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

Owner setup ends after Passkey enrollment. iCloud credentials are added through the
public OAuth account chooser after owner login. Private management lists accounts
and targets rotation/revocation by stable account ID. This remains one owner's
installation. Registered Mail/Calendar probes and metadata are injected by
composition. Account checklists separate provider availability from owner-enabled
state; unknown services are disabled with a reason. Private actions support service
toggles, recheck and per-service account defaults.

## Data flow and security

Setup checks private connectivity before Passkey enrollment. An
eligible enrollment session, independent internally injected bootstrap proof precede owner-store enrollment without Apple credentials. Public account addition
requires provider validation before encrypted persistence. Management requires the authoritative owner
session; POST operations require exact private Origin, JSON content type and bounded
validated bodies. The handler must only be mounted on the private listener.

Status returns whether a credential exists, never its contents. Credential rotation
replaces only the named account secret after at least one registered probe succeeds.
Credential revision guards reject stale results; failed validation preserves the
old secret and evidence. Rechecks retain disabled preferences. Local removal does not delete mail, revoke the
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

Service toggles and rechecks notify composition to advance the readiness epoch.
Successful read evidence cannot survive off/on or an intervening recheck. Observations
for multi-account grants are attributed to the selected account after routing.
