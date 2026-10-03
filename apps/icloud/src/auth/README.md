# Owner authentication acceptance

CP4 component goal: real Better Auth Passkey owner session and OAuth provider,
private-only bootstrap registration, owner-only authorization, explicit origins,
persistent challenges/grants, opaque resource tokens with introspection and
immediate revocation. No password signup is enabled. The authoritative owner ID
comes from the separate owner store; uncommitted/orphan credentials cannot access
admin or authorize mailbox grants.

Before completion: synthetic signed authenticator HTTP E2E must cover bootstrap
proof, UV enforcement, registration/login replay, public/private isolation,
consent + PKCE + resource scope, refresh and revoke. Factory integration into
both application listeners must be independently reviewed before CP4 is accepted.

Opaque access tokens are intentional: pinned Better Auth 1.7.7 explicitly cannot
individually revoke JWT access tokens. Resource verification uses authenticated
provider introspection and exact audience/issuer/scope/owner checks. Internal
resource client secrets must remain encrypted server-side and never be returned.

## Component API and integration boundary

`createOwnerAuth` owns a caller-provided persistent Bun SQLite connection and
returns `publicHandler`, `privateHandler`, `verifyBearer`, `ownerSession` and
`enrollmentSession`. Caller retains DB close ownership. Initialize one factory
per auth DB at a time. `ownerId` and `checkBootstrapProof` use the authoritative
owner store; no identity is implicitly accepted because its Passkey is valid.

Private enrollment sends `x-bootstrap-proof` for both options and verification,
with `createSession:true`. The library creates the staged user only after valid
signature and UV proof. Application then reads `enrollmentSession`, validates
mail credentials, and atomically calls owner-store enrollment with that user ID.
Storage and auth databases are separate: an interrupted attempt may leave a
staged user/passkey. It cannot authorize OAuth or administer the mailbox until
its exact ID becomes the owner. Retry can use its session to finish setup;
signing out permits a fresh enrollment attempt. Setup completion must recheck
proof and authenticated enrollment session; this component does not store mail
credentials or consume bootstrap proof.

Only the private listener may call `privateHandler`; route selection is NOT
based on user-controlled host or forwarded headers. Public handler refuses
registration and all unlisted administrative/signup paths. App must separately
serve login/consent HTML and pass its private admin requests through
`ownerSession`. Configure one stable public origin; RP/origin browser validity
still needs actual deployment validation. Do not forward the private enrollment
listener through Funnel.

Internal resource-client credentials are encrypted with AES-GCM under a key
derived from the persistent auth secret and stored in the auth DB; tokens are
validated through the provider's actual introspection. No external request can
reach introspection through these allowlists. Auth secret rotation requires a
planned migration/re-encryption and is not silently supported. Keep that secret
outside the database and stable across restarts.

## Verified component evidence

`bun test tests/auth/owner.test.ts`: **1 scenario, 29 assertions passed**; app
`bun run typecheck` passed. Tests use an actual loopback HTTP listener for public
routes and direct private Request handler invocation. Covered registration proof,
UV failures, route/origin isolation, unowned session rejection, signed login,
challenge replay, consent, PKCE, resource audience, refresh, access-token revoke,
refresh revoke, wrong verifier consumption, and unknown resource rejection.
SQLite close/reopen plus component recreation preserved owner session and usable
resource tokens. This is not a child-process restart or complete application
server integration. Reopening migrations emits known library SQLite TEXT versus
string-array warnings; reopen behavior passes.

Physical browser Passkeys, private/public deployed origin routing and the main
server's enrollment/MCP integration remain separate CP4 acceptance work.

## Browser interface and diagnostic conclusion

`pages.ts` provides local sign-in/consent HTML; `browser.ts` is a separately bundled
same-origin module using pinned SimpleWebAuthn browser 14.0.0. It exports
`registerOwner` for the private admin UI. Options are parsed before browser calls;
UV is requested and independently enforced server-side. Client identity and scope
text use DOM text nodes. Signed OAuth continuation filters unrelated query fields;
the server remains responsible for signature validation. No CDN or inline ceremony
script is used. Main serves `/assets/auth-browser.js` and both HTML routes.

Provider test now has **32 assertions**, including actual signed login-page query
forwarding through Passkey verification to OAuth callback. UI helper tests add
**2 tests / 10 assertions**. Physical browser ceremonies remain unverified.

SQLite warning root cause is pinned Better Auth `get-migration.mjs`: its array
compatibility check requires a column type containing `json` (line 326), while
its SQLite `string[]`/`number[]` creation mappings deliberately use `text` (lines
536–544). Therefore its own reopened schema triggers the diagnostic. Resource,
scope, client and consent array behavior after reopening was exercised by the
successful introspection/consent test; no incorrect mapping was observed. Logs
are not suppressed and installed library code is not patched. Future dependency
upgrade should retest the same reopen path rather than alter working SQL types
only to silence the library's check.

## `/icloud` route migration

The provider now explicitly uses `basePath: /icloud/auth` and issuer
`<public-origin>/icloud/auth`; its base URL remains the origin. Browser pages,
assets, setup and admin destinations use `/icloud`. Passkey RP ID and allowed
origins are unchanged because URL paths do not identify a WebAuthn RP.

RFC 8414 discovery is `/.well-known/oauth-authorization-server/icloud/auth`;
the library also exposes `/icloud/auth/.well-known/oauth-authorization-server`.
RFC 9728 resource discovery for `<origin>/icloud/mcp` is
`/.well-known/oauth-protected-resource/icloud/mcp` (main HTTP router owns this).
These root well-known routes are protocol exceptions, not root application APIs.

Auth cookies use the `icloud` prefix and `/icloud` path; setup grants also use
`/icloud`. Existing users sign in again using their existing Passkey. No owner,
Passkey or encrypted mail credential is removed. External OAuth connections
must reconnect at the namespaced resource/issuer; old token audience/issuer is
not silently accepted.

The internal introspection client is persisted under a key derived from the
issuer and resource. Migration creates a correctly linked client for the new
resource and preserves the old encrypted record/client for rollback; subsequent
starts reuse the new entry. A regression test asserts preservation of the old
entry plus new canonical discovery routes and rejection of the old auth API.
