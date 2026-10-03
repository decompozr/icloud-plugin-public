# Architecture direction and resolved internal contracts

This document separates engineering choices we can specify now from deployment
choices requiring confirmation or live evidence. It does not authorize production
implementation. Accepted product direction remains in [project decisions](project.md).

## What the references teach about structure

| Reference | Structure and connection ownership | Useful pattern / limitation |
| --- | --- | --- |
| [minagishl, afa62af3](https://github.com/minagishl/icloud-mail-mcp/tree/afa62af3f24f3168199f885856fcfd459444d0e2/src) | TypeScript MCP entry point with one mail client combining IMAP, MIME and SMTP. | Direct Bun/TypeScript comparison, but shared selected-mailbox state, ignored target IDs and unbounded parsing must not be copied. Its node-imap dependency logs out on end; it does not inherit Julien's CLOSE-cleanup problem. |
| [bufordeeds, f6064932](https://github.com/bufordeeds/icloud-mail-mcp/blob/f606493271a51920a12392b9375c4468e10c6a4f/server.py) | One Python module owns env configuration, FastMCP tools, fresh per-call IMAP context, SMTP and MIME helpers. | Small connection lifetime boundary and logout cleanup; limited organization surface, full-message fetch for snippets, no observed timeout/retry strategy or tracked tests/license. |
| [JulienRabault, efee3eef](https://github.com/JulienRabault/icloud-mcp/tree/efee3eef9a24f699b024475f7db950c17646acd8/src/icloud_mcp) | MCP adapter and typed models over separate IMAP/SMTP, MIME, search, flags/move and folder modules. Fresh synchronous IMAP connection per tool; cached settings. | Separation of parsing/search from I/O is useful. Read-only/PEEK reads are deliberate. Writable CLOSE cleanup, missing UIDVALIDITY and silent partial search failures undermine correctness. |

The failures are not interchangeable. The pinned
[node-imap move implementation](https://github.com/mscdex/node-imap/blob/867aa88a335a266b904e0271afa36f69af31a869/lib/Connection.js#L694-L776)
stops on COPY/stage errors; without UIDPLUS its fallback temporarily alters
unrelated Deleted flags around global expunge. That still violates our isolation
requirements. ImapFlow 1.7.8's continuation after rejected COPY/STORE is a separate
[L3 observed hazard](research.md#systematic-extension-identity-and-failure-observations).
Julien checks explicit COPY/STORE results but its finally-CLOSE can expunge despite
those errors. No reference supplies the complete authentication/deployment design.

## Recommended decomposition

Keep a small single-owner Bun service with these responsibilities, not a generic
provider framework:

1. MCP adapter validates tool inputs and maps stable results/errors to clients.
2. Mail operation layer owns target preflight, capability checks and staged
   outcomes; it never delegates correctness to a library convenience move call.
3. Mail session adapter owns verified TLS, timeouts, mailbox selection and cleanup.
   Begin with one operation-owned session, or explicitly serialized sessions;
   pooling is not needed until justified by measurements.
4. Pure MIME/search/selection helpers produce bounded data and can be tested
   without mailbox access. No semantic summarizer or schedule/rules engine.
5. Owner identity/OAuth and bootstrap/icloud/admin enforce separate access boundaries;
   secret storage provides a narrow server-only interface and explicit recovery.

This decomposition is a recommendation grounded in the references, not a mandate
to choose a particular IMAP library or auth framework. ImapFlow remains viable
for primitives demonstrated locally, but its unsafe move fallback must not be
used unchanged. A vetted library upgrade would require repeating failure checks.

## Internal contract defaults

These conservative defaults resolve API ambiguity for the next specification
iteration; they are engineering choices, not observed iCloud properties. They may
be revised explicitly if acceptance evidence requires it. No provider access is
needed to define them.

| Contract | Default |
| --- | --- |
| Message identity | Structured `{mailbox, uidValidity, uid}`. `mailbox` is the exact server path, `uidValidity` a decimal string, `uid` a positive 32-bit integer. Do not use RFC Message-ID or sequence number as a mutation key. |
| Batch selection | One mailbox and UIDVALIDITY per call; 1–50 unique identities. Reject duplicates or any invalid/stale/missing target before writes. Later disappearance is reported per target. |
| Result model | `status`: completed, rejected, partial or unknown; `items` include original identity, per-target outcome and verified destination identity when available. An unknown outcome never carries a blind-retry suggestion. |
| Error categories | invalid_input, stale_identity, not_found, unsupported_capability, ambiguous_destination, unauthorized, upstream_failure and outcome_unknown. Transport/tool errors must not expose secrets or private bodies. |
| List/search page | Default 20, maximum 100 messages, deterministic descending UID within one mailbox. Continuation binds query, mailbox, UIDVALIDITY and a starting upper UID boundary; rollover invalidates it. Newer arrivals do not shift later pages. Deletions may shorten pages and must not be fabricated. |
| Summary read | Envelope/header metadata and optional bounded text excerpt, never model-generated semantic prose. State omitted fields/attachments. |
| Full read budget | Default ceiling 1 MiB fetched MIME and 100,000 returned text characters. Inspect size where available; enforce actual received bytes too. Oversize is explicit, not silent complete output. These are starting operational limits, not parser guarantees. |
| Restore | Require recorded original destination or a caller-provided existing folder. Unknown original location returns a destination-required result; no automatic Inbox assumption. |
| Unsafe move | If no supported safe selected-message method exists, return unsupported before copying. Do not use global-expunge fallback or silently downgrade to copy. |

These contracts constrain M01–M11. Exact MCP tool names and cursor encoding can
follow implementation conventions; those details need not block correctness.
Cross-folder search, if exposed, must report attempted/succeeded/failed folders
and cannot claim complete results when a folder fails.

## Remaining decisions are specific

| Question | What resolves it |
| --- | --- |
| Actual iCloud MOVE/UIDPLUS, keyword persistence, Junk semantics | Authorized capability and selected-message observations; standards or upstream claims cannot establish account behavior. |
| Private enrollment/public OAuth addresses and routing | A concrete Tailscale listener/origin proposal, owner confirmation and browser/client acceptance; preserve private admin isolation. |
| Credential keys and recovery | Choose host/container key custody and recovery policy before production storage. Synthetic encryption does not settle this. |
| Complete OAuth/Passkey framework | Evaluate an established candidate against A01–A07 and actual client requirements; do not build from the tiny grant sketch. |
| Container deployment | Choose between native publisher repair and the now-tested host proxy alternative; verify the actual application image and Tailscale routes. Direct-IP Alpine success alone is insufficient. |
| Unsubscribe execution policy | Specify mailto/one-click/manual-link support, destination checks and outcome evidence before enabling execution. Header discovery can be specified independently. |

## Concrete auth/routing recommendation, pending integration checks

Use one stable tailnet hostname with two independently routed HTTPS listeners:
private Tailscale Serve on port 8443 for bootstrap/icloud/admin, and public Funnel on
443 for OAuth/MCP. Each forwards to a different loopback application listener.
The public router must not dispatch bootstrap/icloud/admin handlers. Path-only separation
on a shared Serve/Funnel port is not a privacy boundary: the last exposure mode
applies to that port. [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel),
[Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve).

Use the hostname, without a port, as the candidate WebAuthn RP ID. Verify the
exact private registration and public login origins separately with purpose-bound
challenges. Cookies are not isolated by port: use distinct session names/audiences
and Origin/CSRF controls, not an assumption that a private-port cookie is private.
[WebAuthn RP identifiers](https://www.w3.org/TR/webauthn-3/#relying-party-identifier),
[cookie port boundaries](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5).

Better Auth's OAuth provider and Passkey plugins are an engineering candidate for
the Bun service; its docs cover a Bun SQLite adapter. This is a library evaluation,
not an accepted storage/framework choice. Use either its MCP wrapper or its OAuth
provider integration as appropriate, not both registrations blindly. Custom
bootstrap-only enrollment, dual origins and route allowlisting require actual
package tests. [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider),
[Passkeys](https://better-auth.com/docs/plugins/passkey),
[Bun adapter](https://better-auth.com/docs/adapters/sqlite).

Client integration must use exact registered redirects, issuer/resource binding,
S256 and persistent client records. Copy the actual callback from ChatGPT's
connection UI; Codex's callback is separately configurable. Do not assume a common
callback or wildcard. Client discovery/registration and refresh-token rotation
need complete flow acceptance, beyond the prior tiny grant model.
[OpenAI authentication requirements](https://developers.openai.com/plugins/build/auth).

This is now a concrete recommendation to test, not an undefined origin question.
Actual browser ceremony, owner domain setup, framework suitability and both client
connections are still unverified. Topology acceptance and key/recovery custody
remain explicit decisions; no routes have been activated by documenting this.

## Credential key and recovery recommendation

Prefer a service-specific wrapping key held in the Mac Keychain through a narrow
host helper, separate from the application's encrypted data volume. An alternative
is an owner-managed protected key file mounted read-only with independently held
backup material. These are custody choices for the owner, not selected deployment
facts; neither has been configured. Keychain helper access while locked/rebooting
and runtime key transfer still require host validation.
[Key custody research](../playground/icloud/setup/README.md#key-custody-candidates-research-not-configured).

A local recovery model now fails closed when established state or its external
installation marker is missing; authenticated backup plus one-use offline proof
restores the same owner with bootstrap closed. Five setup tests/37 assertions
passed. This resolves a candidate missing-state contract, not rollback resistance,
crash-safe proof consumption or production recovery. The original encryption key
is still necessary; a Passkey cannot recreate a lost data key. Restored grants
and sessions must have an explicit invalidation policy before production use.

## Auth candidate evidence now available

The isolated [Better Auth probe](../playground/auth-provider/README.md) tested
version 1.7.7 with Passkey/OAuth-provider plugins on Bun 1.4.2. SQLite migrations
created Passkey, client and refresh-token tables. Real loopback HTTP discovery
advertised S256/refresh/scopes/registration; a public native fixture client
registered without a secret, anonymous authorization redirected to sign-in, and
an invented code was rejected. One test/15 assertions passed.

This closes basic package/Bun/migration/discovery feasibility. It does not prove
successful owner Passkey login, authorization-code issuance, refresh rotation,
resource enforcement or either target client. Installed source accepting resource
parameters is not end-to-end audience enforcement. The library remains a viable
candidate, not the selected or completed authentication system.

## Runtime candidate evidence now available

Two follow-ups close basic Bun container and alternative local-route feasibility:
a host-loopback Bun proxy successfully reached the container's direct IP before
and after restart/IP rediscovery; verified official Linux Bun 1.4.2 ran a dummy
HTTP counter in disposable Alpine with its required runtime libraries. Counter
persistence and graceful shutdown worked; all owned resources were removed.
[Runtime results](../playground/runtime/README.md).

The native localhost published-port failure remains unresolved. Logs support a
routing failure; a host Local Network permission explanation is a hypothesis,
not a diagnosed cause or authorization to change it. A host proxy is now a tested
candidate alternative, so native publisher repair need not block discussing a
viable topology. The actual application/MCP/auth image and Tailscale routes still
need acceptance, and the owner has not selected this deployment layout.

## Next finite checks

The remaining work is not all external validation. Local integration still needs:

1. A real candidate-provider owner/login → code → token → protected-resource flow,
   including refresh/revocation and replay rejection; discovery/invalid-code
   tests do not prove these paths.
2. Private/public router and session isolation with the chosen Passkey enrollment
   ceremony, followed by a real browser check of the selected RP/origins.
3. The actual Bun MCP/auth application behind the proposed proxy, including MCP
   methods/streaming and headers. The successful proxy fixture exercised dummy
   HTTP GET only, not general MCP forwarding.
4. The selected key-custody/recovery boundary under lock/restart and failure,
   including marker/backup rollback and grant invalidation.

Separately, live checks require owner-authorized iCloud capability/selected-message
observations, actual Tailscale routing and Codex/ChatGPT account linking. These are
specific remaining acceptance tasks, not reasons to leave internal contracts
undefined or to restart broad research.

## Accepted implementation boundaries

The user has selected one complete `apps/icloud` application with separate
`server/`, `mcp/`, `services/`, `domain/`, `icloud/`, `auth/`, `admin/` and `storage/`
boundaries. Runtime input is validated, domain/provider interfaces and results
are typed, and service logic does not depend on HTTP or MCP. The server owns
transport/lifecycle; the MCP handler maps protocol requests to application
services; iCloud adapters own provider I/O. No production MCP client is added.

Native Mac and Apple Container are first-class target modes. Development,
build, release and runtime have distinct commands/artifacts; startup must not
compile or install. Streamable HTTP is primary and stdio is excluded initially.
[Workspace paths and lifecycle commands](workspace.md) describe the concrete
layout and current draft limitations.
