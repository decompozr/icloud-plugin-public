# Shared owner authentication

Authentication establishes the installation owner and client access to the protected
MCP resource. `createOwnerAuth` composes Better Auth Passkey and OAuth provider
support using a caller-owned Bun SQLite connection. It returns `publicHandler`,
`privateHandler`, `verifyBearer`, `ownerSession` and `enrollmentSession`; the caller
retains database close ownership. `bootstrap.ts` handles private setup access and
`rate-limit.ts` bounds repeated access attempts. The older external JWT verifier
is a compatibility/test path rather than the application's primary owner flow.

## Use cases and data flow

Private registration combines an independent bootstrap proof, allowed origin and
user-verified Passkey ceremony. The staged authentication user becomes authoritative
only after the owner store commits that exact user ID. Interrupted enrollment can
leave an unowned Passkey/session; it cannot authorize clients or administer the
installation. The admin workflow can resume eligible staged enrollment.

Public sign-in, account selection/addition and consent issue scoped OAuth access
through code/PKCE and optional refresh flows. With an account store, every fresh
authorization reaches `/icloud/connect`, including authenticated sessions. Signed
OAuth continuations bind the chosen account to explicit consent and grants; bearer
introspection returns `accountId`, and refresh preserves it. The chooser validates
new Apple credentials before encrypted storage; clients receive no Apple password.
Existing grants migrate only to the immutable original account identity. Bearer verification uses authenticated introspection and checks
active token, owner, expiry, issuer and resource audience. Scope declarations and
current allowed scopes come from application/module composition; authentication
does not impose a Mail-specific minimum scope. The MCP host enforces each tool's
required scopes. `offline_access` is optional persistent authorization, never an
automatic expansion of an existing grant.

## Security, state and browser integration

The public handler allowlist refuses enrollment and administrative routes; listener
selection is owned by the server, not request-controlled forwarding headers. Private
mutations separately enforce origin and owner/bootstrap checks. No password signup
is enabled. Opaque tokens permit provider introspection/revocation; internal resource
client secrets remain encrypted server-side under a key derived from the persistent
auth secret. Secret rotation requires an explicit migration, not silent replacement.

Provider state includes Passkeys, sessions, challenges, clients, consents and grants.
It is distinct from the opaque owner credential store. Initialize one factory per
auth DB at a time. `pages.ts` delegates sign-in/consent presentation to compiled Svelte Studio components and the connection handler owns account selection; Studio performs hydrated browser interactions; the protocol-only compatibility
`browser.ts` exposes
same-origin SimpleWebAuthn ceremonies. Scope labels are supplied by composition as a string or locale-to-description map
and inserted as text, rather than hardcoded Mail semantics. `scope-labels.ts` selects
the current page locale (case-insensitive), then the module default, then the scope
identifier. Mail owns its translations under `mail/consent.ts`. UI styles come from shared
`ui`; auth-specific interface copy remains in `i18n.ts`.

The provider base path and issuer use `/icloud/auth`; the protected resource is
`/icloud/mcp`. Root well-known OAuth discovery routes are protocol exceptions.
Cookies use the `icloud` prefix and `/icloud` path; cookies are not isolated by
listener port, so route/session/origin boundaries remain necessary.

## Verification and limitations

Colocated owner, bootstrap, rate-limit, page and scope-upgrade tests exercise signed
synthetic authenticators, HTTP OAuth flows, replay/revocation, resource/scope checks
and persisted reopen behavior. The test-fixture folder documents synthetic owners.
Run with the application's unit suite or the root `bun bin/test` dispatcher.
[Built E2E](../../../e2e/README.md) covers full listener/application integration.
Physical authenticators, current deployed routes and actual client consent remain
separate evidence; historical counts do not establish this refactor's acceptance.

Pinned Better Auth migration checks can warn about its own SQLite TEXT versus
string-array column mapping on reopen. Do not suppress these diagnostics or patch
installed library code merely to silence them; repeat reopen/consent/introspection
checks when upgrading. See [setup/auth](../../../../docs/setup-and-auth.md) and
[scope diagnosis](../../../../docs/oauth-request-scope-diagnosis.md).
