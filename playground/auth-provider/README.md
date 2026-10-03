# Better Auth candidate experiment

Goal before execution: determine whether a maintained auth provider initializes
under Bun with native SQLite, Passkey and OAuth plugins, migrates its schema,
and serves real discovery/registration/authorization/token routes.

Expected: discovery advertises S256, refresh and registration; a public fixture
client registers; missing owner login redirects to login rather than issuing a
code; invalid grants fail. This is candidate evidence, not selection or proof of
real ChatGPT/Codex, Passkey login, consent, refresh or resource enforcement.

Only temporary SQLite and loopback HTTP are allowed. No real credentials,
production changes, browser login or public exposure. Reproduce here with
`bun install --frozen-lockfile` then `bun test`.

Sources: https://better-auth.com/docs/plugins/oauth-provider,
https://better-auth.com/docs/adapters/sqlite,
https://better-auth.com/docs/plugins/passkey,
https://better-auth.com/docs/concepts/database.

## Observed 2026-10-01

Bun 1.4.2; `better-auth`, `@better-auth/passkey` and
`@better-auth/oauth-provider` pinned to **1.7.7**. **1 test passed, 15 assertions**.

Actual native Bun SQLite migrations created `passkey`, `oauthClient`, and
`oauthRefreshToken` tables. The actual Better Auth handler served HTTP discovery,
advertising S256, refresh-token grant, registration, and configured mail scope.
A public native fixture client registered without a client secret; an anonymous
authorization request redirected to `/sign-in`; an invented authorization code
was rejected with `invalid_grant`. All requests used loopback. SQLite and its
temporary directory were removed and the listener stopped in `finally`.

Two integration corrections were observed during the spike:
- Migrations import from `better-auth/db/migration`, not `better-auth/db`.
- A fixture using an HTTP loopback redirect needed `application_type: native`;
  the implicit web application registration returned 400. This agrees with the
  provider's documented redirect policy and is not a client compatibility test.

## Capability evidence versus remaining proof

| Capability | Evidence level |
| --- | --- |
| Bun + native SQLite + plugins | Executed initialization and migrations |
| OAuth discovery / public DCR / login gate | Executed actual HTTP routes |
| Passkey support | Plugin initialized and table created; registration/login NOT executed here |
| S256 / refresh | Advertised by provider metadata; successful code/refresh exchange NOT executed here |
| Scopes | Configured and advertised; authorization enforcement NOT demonstrated here |
| Resource indicators | Installed provider source accepts RFC 8707 resource parameters; successful audience-bound issuance NOT demonstrated |
| MCP | Provider docs describe MCP usage; no MCP resource integration/client connection executed |

This identifies a concrete candidate that avoids assuming a handwritten OAuth
server is necessary. It does not select Better Auth or establish security of the
finished system. Still required: private owner bootstrap, browser Passkey flow,
consent and session integration, full S256 code/refresh/revocation roundtrip,
resource/scope enforcement, proxy origin configuration, and real clients.
The fixture deliberately enables unauthenticated DCR only to exercise registration;
production registration policy is undecided. No owner session is fabricated, so
this test does not bypass the login gate to claim a successful authorization.

Development smoke only. Service build/release/install/update/uninstall and schema
upgrade/recovery are unexecuted. Do not use this test configuration in production.

## Successful-flow extension goal (before execution)

Use a test-only email/password signup to create a fixture user, then register a
synthetic ES256 credential via actual Passkey HTTP endpoints. Clear the session
and authenticate using that credential before real OAuth authorization/token/
refresh requests. No session or grants are inserted directly. Signup is fixture
bootstrap, NOT the planned production private owner-enrollment implementation.
Expected: durable challenge consumed once, real credential login, successful
S256 exchange and refresh through provider routes. Browser/physical Passkey and
public/private routing remain unproven.

### Extension observed

`flow.test.ts` successfully executed actual HTTP email signup (fixture bootstrap),
WebAuthn registration, challenge replay rejection, sign-out, synthetic signed
WebAuthn login, DCR, consent, S256 code exchange and refresh exchange. No session,
credential or grant was inserted directly into the database. Consent must submit
`oauth_query` from the provider's signed consent redirect query string; posting
only `{accept:true}` fails. This extension uses in-memory SQLite and proves
challenge consumption in one process, not restart durability.

Combined provider suite: **2 tests passed / 29 assertions** under Bun 1.4.2.
The earlier table describes original smoke coverage; this extension upgrades
successful synthetic Passkey, code and refresh exchange to executed evidence.
Resource audiences, revocation and real browser remain unverified.

## CP3 / CP4 integration notes (proposal, not implementation)

Actual mounted routes under `/api/auth`:
- GET `/passkey/generate-register-options`, POST `/passkey/verify-registration`
- GET `/passkey/generate-authenticate-options`, POST `/passkey/verify-authentication`
- `/oauth2/authorize`, `/oauth2/consent`, `/oauth2/token`; metadata supplies URLs.

Passkey-first owner enrollment is supported through
`passkey({registration:{requireSession:false,resolveUser,afterVerification}})`.
`resolveUser` establishes proposed identity; `afterVerification` can atomically
create/link the owner after real signature verification; request
`createSession:true` establishes a library session. Production must guard BOTH
registration routes on the private listener and require the one-use bootstrap
proof, including final verification. Public listener must not expose an alternate
signup/registration path. This spike's email signup is not a production proposal.

Important pinned-source finding: both registration and authentication library
verifiers use `requireUserVerification:false`. Enforce application UV policy with
`registration.afterVerification` and `authentication.afterVerification`, checking
`registrationInfo.userVerified` / `authenticationInfo.userVerified` before session
creation. Configure user-verification-required options as well; browser options
alone are not server enforcement.

The library creates verification rows and signed challenge cookies, and consumes
verification values before verification. Use persistent SQLite rather than this
extension's in-memory database; test restart, expiry, replay and concurrent
bootstrap completion before acceptance. Keep bootstrap state and owner linking
transactional; avoid creating an owner before proof merely because options were
requested. Refresh tables exist, but revocation/rotation replay policy must still
be exercised with the finished resource verifier.

Use one stable external issuer and explicit RP ID/origin allowlist. Private/public
ports can share RP hostname, but cookies are not port-isolated; use separate
cookie names/path/session purposes where private admin and public login differ.
Do not accept arbitrary forwarded host/origin values or treat cookies as proof
that a request arrived via Tailscale. Two different hostnames require a valid
browser RP relationship and explicit testing, not simply an origin array. Exact
private routing/topology remains a design decision. Current app HTTP adapter
must mount provider routes before body parsing that would consume their body and
bind actual issuer/resource/scope verification to MCP access.
