# Auth experiment goals (L7 / L8)

Isolated Bun spike, not production authentication. No mailbox credentials, public
listener, real OAuth client, or physical Passkey is used.

## Expected observations, before execution

- L7: SimpleWebAuthn verifies a synthetic ES256 registration and assertion;
  rejects wrong origin, RP ID, challenge, signature, and missing user verification.
  Same RP with explicitly allowed origins can validate at the server. This does
  not prove browsers allow unrelated origin/RP combinations or real Tailscale DNS.
- L8: a minimal in-memory grant model exercises S256 PKCE, exact client/redirect/
  resource binding, one-use/expired codes, client state checking, and scope limits.
  `jose` verifies signed tokens and rejects wrong audience/issuer/signature,
  expiration, missing token, insufficient scope, and revoked identifiers.

## Reproduce

From this directory: `bun install --frozen-lockfile` then `bun test`.
Dependencies and lockfile are isolated here. No server remains running.

## Boundaries

The grant model is test scaffolding, not a complete OAuth authorization server:
no discovery, client registration, owner consent, refresh tokens, CSRF/session
storage, durable revocation, or actual ChatGPT/Codex connection is implemented.
The synthetic authenticator asserts presence/verification bits itself, so these
checks do not prove Touch ID, user presence, browser RP policy, credential sync,
or real enrollment/login. Real domain/private-public routing remains unexecuted.

Sources: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server),
[PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636),
[jose](https://github.com/panva/jose).

## Observed results — 2026-10-01

Bun 1.4.2: **30 tests passed, 0 failed** (7 WebAuthn, 22 OAuth-model/token,
1 loopback HTTP roundtrip with 11 assertions).
Pinned candidate dependencies: SimpleWebAuthn server 14.0.1, jose 6.2.2,
cbor-x 1.6.4. These are evaluated candidates, not production selections.

- The actual SimpleWebAuthn library accepted standard CBOR `none` registration
  and an ES256 assertion with a newly generated test key. It rejected bad RP
  hashes, origins, challenges, user-verification flags and signatures.
- A second explicitly allowed origin using another port on the same hostname
  succeeded server-side. Changing the RP hash failed. This supports keeping a
  consistent RP design; it does not establish how internal/external addresses
  should be deployed or authorize unrelated-hostname RP reuse.
- The first fixture used a cbor-x tagged Map encoding that SimpleWebAuthn did not
  decode as a standard map; disabling extension map tags corrected the fixture.
  This was fixture construction, not evidence of a Bun or passkey defect.
- The S256 result matches RFC 7636's published vector. Grant binding, one-use,
  expiry, state echo/client check, and requested scope rejection pass in the
  handwritten model. These do **not** validate an OAuth server implementation.
- Actual jose cryptographic token signing/verification worked under Bun, including
  negative issuer, audience, signing-key, expiry, scope and in-memory revocation
  checks. Scope and revocation checks are application model logic, not jose
  features. Revocation persistence and refresh-token behavior remain untested.

## Decision input and remaining acceptance

Bun can execute the candidate verification libraries for these fixture paths.
A stable RP/origin configuration is still required. The service must independently
persist/consume authentication challenges and protect owner sessions; library
signature verification alone is not replay protection. No production architecture
or complete OAuth provider is selected by this spike.

Actual private enrollment, real Passkey use, Tailscale/Funnel routing, discovery,
PKCE/consent flow in ChatGPT and Codex, and persistent owner bootstrap must be
verified separately. No browser tooling was available for this run, so all
WebAuthn evidence here is synthetic server-verifier coverage only.

Development: isolated package. Build/release/install/update/uninstall of the
service: outside this spike and unexecuted. Dependencies can be restored from
this lockfile; no global installation or persistent process was created.

## L8 loopback transport follow-up goal (before execution)

Exercise the same model through real loopback HTTP: authorization redirect,
client state check, PKCE token exchange, and bearer-protected fixture resource.
Expected: valid roundtrip succeeds; bad redirect, wrong verifier, reused code,
missing bearer and incorrect bearer fail through HTTP. Bind `127.0.0.1` on an
OS-selected port and always stop the server. This remains a fake client and
minimal protocol model, not a standards-complete OAuth provider.

Follow-up observed: real Bun loopback HTTP authorization returned a 302 to the
registered fake callback; the fake client parsed Location and checked state,
exchanged the code using S256, and accessed the bearer-protected fixture route.
HTTP rejected a modified redirect, wrong verifier, reused code, absent bearer,
and invalid bearer. The listener stopped in `finally`. Callback navigation is
simulated by parsing Location; no browser, callback listener, owner login or
external provider was involved. Full OAuth/Passkey integration remains unverified.
