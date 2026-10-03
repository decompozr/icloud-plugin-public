# Accepted setup and authentication flow

This is the accepted behavior contract. CP3/CP4 implement it with reviewed local
E2E; the native private setup route is live, while the real owner ceremony and
external client integration remain pending.
The service supports native Mac/Bun and Apple Container/Linux-Bun. Tailscale stays on the host; the current private setup uses native mode. The tested container path uses separate mounted state/custody and a host-loopback proxy; broader host lifecycle acceptance remains open. The [project decisions](project.md) and [mailbox scope](mailbox-tools.md)
continue to apply.

## Owner setup

1. The owner reaches first-time setup privately through Tailscale.
2. Setup registers the owner's Passkey and accepts the iCloud mail login and an
   Apple app-specific password. The main Apple account password is not used.
3. The service tests the mail connection and securely stores the mail credentials
   server-side. Encrypted storage, external key custody and failure/retry mechanics are
   implemented and locally tested; real account validation remains user-driven.
4. After successful owner enrollment, bootstrap access is disabled. Later owner
   administration requires authentication; bootstrap must not remain a route for
   another person to enroll or replace the owner.

Being reachable through the tailnet alone must not silently establish ownership.
The implementation pins the expected Tailscale owner login and uses a short-lived
browser grant bound to the staged Passkey session. Internal proof and atomic
owner storage prevent reopening enrollment after completion. The guided setup
section below defines the current browser flow; real owner actions remain manual.

## Client connection and ongoing use

The chosen design exposes reachable MCP and OAuth endpoints for the intended
cloud clients. ChatGPT and Codex connect using OAuth; the owner signs in to the
authorization flow with a Passkey. Clients receive plugin access tokens, never
the Apple mail credentials. The service uses its stored mail credentials to
perform authenticated, permitted mailbox operations.

Public reachability does not permit anonymous mailbox operations. OAuth token
validation and server-side capability checks remain required. Passkeys identify
the owner during login; they do not replace the plugin access tokens used by
clients. This is the selected design, not a claim that every ChatGPT or Codex
integration must use this topology or authentication method.

The authenticated owner can manage the connection and rotate or revoke access
through an admin surface. Contracts must distinguish client grants/tokens,
owner Passkeys and stored Apple credentials; revoking one is not assumed to
revoke all others. Provider-side revocation and recovery behavior remain to be
specified and tested.

Agents still own scheduling, rules, approval decisions, notifications and
reports. Mail content cannot authorize setup, credential changes or other
administration. Server authentication and input validation are independent of
an agent's decision to approve a particular mailbox action.

## Open questions and observable acceptance

| Question | Required evidence before implementation is considered validated |
| --- | --- |
| Can private enrollment and public login use the intended Passkey? | Establish WebAuthn RP ID and permitted origins, then demonstrate registration and login from the chosen addresses. Do not assume a Passkey enrolled for one hostname works on another. |
| Do client OAuth flows interoperate? | Verify exact client redirect handling and successful owner login/token use in Codex and ChatGPT; reject invalid grants/tokens and anonymous mailbox calls. |
| Who can claim first-time ownership? | Define ownership proof and demonstrate one-use enrollment, failure recovery, and inability to reopen bootstrap after completion or restart. |
| How are credentials protected and recovered? | Define storage/key boundaries; verify secrets do not reach clients/logs, persistence survives restart, rotation works and revocation/recovery has explicit outcomes. |
| What is the container/Tailscale topology? | Choose and test host versus container networking and persistence; account for restart, logout, reboot, sleep/wake and scoped uninstall. |

Production/live checks above remain unexecuted. Synthetic WebAuthn/token, local
OAuth-model HTTP and encrypted-storage experiments provide limited evidence;
they do not validate real enrollment, client linking, key provisioning or mail login.
See [the experiment register](experiments.md) for status.

## Required authentication and storage outcomes

These specify required behavior, not a chosen library, database, encryption
algorithm, key store or complete OAuth architecture. See
[engineering knowledge](knowledge.md) for evidence and its limits.

| ID | Requirement and observable acceptance | Evidence / remaining acceptance |
| --- | --- | --- |
| A01 | Passkey registration/login must verify the intended RP ID, explicit allowed origin, challenge, signature and required user verification. Challenges must expire and be consumed once, bound to the expected ceremony/session and owner. Reject mismatches and replay. | CP4 real provider cryptography/session persistence tested with synthetic authenticator; actual browser ceremony pending. |
| A02 | Authorization codes must be short-lived and one-use, bound to client, exact permitted redirect, resource, granted scopes and S256 PKCE challenge. Exchange must validate the verifier and reject mismatches/expired/reused codes. Client integration must preserve and validate state. | CP4 real provider HTTP registration/PKCE/token/refresh tested; actual Codex/ChatGPT account connection pending. |
| A03 | Each mailbox request must validate access-token authenticity, issuer/resource audience, expiry, permitted owner and required capability; reject absent, invalid, expired, revoked or insufficient grants before mail access. Tokens must never contain Apple credentials. | L1/L8 synthetic token and fixture-route checks; production token format, revocation persistence and refresh lifecycle open. |
| A04 | Public discovery/login endpoints must not allow anonymous mailbox or admin actions. Admin identity/session checks and mailbox client permissions must stay explicit and separate. | L1/L8 limited route evidence; real route, session, consent and client acceptance open. |
| A05 | Bootstrap requires ownership proof independent of tailnet reachability. Concurrent first enrollment must have one winner. Failed proof/provider validation must not install ownership or credentials; successful enrollment must atomically persist ownership and close bootstrap across restart. | CP3 atomic owner state and CP4 synthetic Passkey/provider-validation flow tested; live provider and disaster recovery pending. |
| A06 | Completed enrollment must not reopen after credential revocation or ordinary restart. Missing/corrupt established state must fail closed into an explicit recovery procedure, not silently allow a new owner. | L9 restart/revocation sketch; missing-state detection, disaster recovery and backups still require design/acceptance. |
| A07 | Stored Apple credentials require server-side encryption with integrity protection; key material must have a defined protection/recovery boundary separate from stored ciphertext. Reject wrong keys or tampering, exclude secrets from tokens/logs/results, and preserve valid state across restart. Authenticated rotation/revocation must report actual outcomes. | CP3 encrypted store/rotation/tamper tests and native external key provisioning complete; backup/secure deletion/provider-side revocation remain open. |

Owner Passkeys, OAuth grants/tokens and Apple credentials are three distinct
revocation domains. Administration must name which domain changed and must not
claim that local deletion revoked provider credentials or all existing tokens.
Recovery must not bypass owner verification. Real connection validation remains
part of setup; fake validation in a test cannot satisfy that requirement.


The [concrete routing recommendation](architecture.md#concrete-authrouting-recommendation-pending-integration-checks)
uses separate private/public listener ports on one hostname, with explicit
WebAuthn origins and cookie/session separation. This topology is implemented; its private native route is configured and verified. Public routing remains pending. The [key/recovery recommendation](architecture.md#credential-key-and-recovery-recommendation)
provides two custody options; the active native instance uses an external owner-only key file. Recovery custody and broader host lifecycle remain open. A missing-state recovery sketch now has local evidence, while production
rollback/crash recovery remains unverified.

## Guided owner setup UX (current requested change)

The private setup page must guide the owner through four visible stages:
connection checks, owner Passkey, iCloud Mail connection, and completion. Show
one stage and one primary action at a time, with back navigation, accessible
progress/errors, disabled duplicate submissions and server-backed resume.
Diagnostics describe the service host, not a claim about the browser device.

The owner clicks **Set up Passkey**; they must not locate, copy or enter an internal
bootstrap proof. Internal ownership authorization still must prevent arbitrary
tailnet members from claiming the installation. The proof stays server-side and
must never be embedded in HTML, URLs or browser storage. The private Serve ingress must match the configured `bootstrap_owner_login`.
A short-lived Secure, HttpOnly, SameSite cookie binds setup to that login and
the staged Passkey session; each sensitive request checks origin, identity and
unclaimed state. The reverse proxy and local operating-system account are
trusted. Container ingress additionally requires the configured exact proxy
address; loopback alone is not protection against a compromised local account.
Public routes never dispatch bootstrap handlers. English is the default UI;
i18next supplies typed English and Traditional Chinese resources.

Explain how to create an Apple App-specific password and why the normal Apple
account password is inappropriate. Reveal that form only after verified Passkey
state; a failed provider check must permit retry without losing the completed
Passkey step. Completion means the mailbox connection is stored, not that public
routing or ChatGPT/Codex authorization has already happened. Existing enrolled
owners go to management instead of restarting enrollment.

Passkey creation options use the account label `iCloud Plugin Admin` and relying
party name `iCloud Plugin`. The opaque credential user ID stays stable throughout
verification; an internal framework email is not the system-facing account label.
A staged session resumes setup instead of creating another credential.

The connection step is titled **Connect your iCloud** under the iCloud Plugin
brand. Supporting text explicitly limits the current connection to Mail. The
completion screen separates stored credentials from assistant authorization:
prepare a reachable MCP/OAuth endpoint, add its `/icloud/mcp` URL in the chosen client,
sign in with the owner Passkey, then test by listing folders. The private setup
URL is not the MCP connector URL. Completing setup does not activate Funnel.

Step 4 is **Connect ChatGPT**, not a claim of verified client installation. It
provides individually copyable name, description, configured public MCP URL and
a read-only first prompt, plus OAuth/owner Passkey instructions. Public endpoint
activation remains an explicit prerequisite; the page neither enables Funnel nor
claims remote reachability. No client secret or Apple credential is displayed.

The tutorial follows the current [official ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt):
Settings → Security and login → Developer mode, then [Plugins](https://chatgpt.com/plugins)
and +. Name, description and connection URL are provided separately. OAuth uses
dynamic registration; optional static client credentials remain blank. Workspace
policy and plan availability still apply.

## Application namespace

All application routes use `/icloud`: `/icloud/setup`, `/icloud/admin`,
`/icloud/mcp`, `/icloud/sign-in`, `/icloud/consent`, `/icloud/assets/*` and
`/icloud/auth/*`. Public/private listeners remain separate. The issuer is the
public origin plus `/icloud/auth`; the protected resource is the public origin
plus `/icloud/mcp`. Standards discovery stays at the origin-root well-known
paths `/.well-known/oauth-authorization-server/icloud/auth` and
`/.well-known/oauth-protected-resource/icloud/mcp`. Only private GET `/setup`
redirects to `/icloud/setup`; old root mutation/auth/MCP APIs are not retained.
The RP hostname and existing owner/Passkey/credential records are preserved.

The current user-observed dialog is **Create custom MCP server**. The tutorial
uses its exact controls: Name, optional Description and Icon, Connection → Server
URL (rather than Tunnel), Authentication → OAuth, the acknowledgment
**I understand and want to continue**, then **Create as a plugin**. Advanced
OAuth settings can remain collapsed; the screenshot does not establish their
hidden fields. Public MCP/OAuth reachability remains a prerequisite.

Step-4 copy values are selectable static text with an icon-only copy control,
localized accessible names, temporary success checkmark and live feedback.
Clipboard failure selects the text and explains manual copying; these are not
editable form fields. Long URLs wrap within the card.

Within wizard step 4, six numbered sections organize the tutorial: Open ChatGPT,
Create custom MCP server, Set up authentication, Create as a plugin, Authorize
access, Try it. The public endpoint prerequisite comes first. The copied product
description is `Connect your AI assistant to iCloud.`; current capability
limitations remain separate and truthful.

If ChatGPT reports dynamic registration unavailable, first check public reachability
of `/icloud/mcp` and the two canonical OAuth metadata routes. In the observed
local deployment, public port443 was not enabled while local metadata correctly
advertised DCR. Do not compensate for unreachable discovery by inventing client
credentials or entering Apple credentials into the ChatGPT dialog.

Tutorial instructions emphasize actionable UI labels with restrained strong text.
Translations are parsed into text/strong segments and rendered with escaped text
or DOM text nodes, never arbitrary translated HTML. OAuth advanced settings may
remain collapsed only after automatic discovery succeeds. If discovery fails,
verify public endpoint reachability and retry; do not invent manual credentials.

### Authentication request limits

Authentication limiting is explicitly enabled in every environment, independently of `NODE_ENV`, and stored in the auth SQLite database. The single-owner service intentionally uses a shared per-path bucket: it does not trust `Forwarded`, `X-Forwarded-For`, or other client-supplied IP headers. The HTTP adapter does not currently supply a verified proxy identity. This avoids attacker-controlled header rotation bypasses, but an attacker can exhaust a shared bucket and temporarily delay the owner's login; this is not a distributed denial-of-service defense.

Per minute, dynamic registration permits 10 requests, token exchange 60, and each Passkey endpoint 30; other auth endpoints permit 120. Internal introspection is exempt because it is server-to-server verification and is not publicly routed. Limits persist through reopening the provider database. Metadata and mailbox permissions are unchanged. A future per-client policy requires an explicit trusted ingress identity contract, not arbitrary forwarded headers. No new send or reply scopes are introduced here.

### Tool discovery and incremental consent

The MCP catalog describes all tools enabled by current operator policy, even when the caller's existing access token lacks a particular tool's scope. Each descriptor declares its action scope plus the transport-mandatory `mail.read` scope; read tools declare `mail.read` once. This lets a client discover an action for which it may request fresh consent. Discovery grants no permission: every invocation must still check current policy and the access token's required scope before entering the operation or provider, returning the existing insufficient-scope challenge when needed. Disabled capabilities remain absent/unavailable.

A user-provided ChatGPT configuration screenshot states that when selected tools all declare scopes, their scopes plus Base scopes determine the request; otherwise Defaults plus Base are used. Hiding send descriptors from read/write tokens can therefore create a discovery/consent cycle. Removing token-based catalog filtering addresses that server-side obstacle. Actual ChatGPT refresh and incremental-consent behavior remains unverified until the owner performs it; no existing grant or client registration is changed by catalog visibility.

The step-up challenge includes the canonical protected-resource metadata URL and the union of `mail.read`, the required action scope and recognized mail scopes already on the token that are still enabled by operator policy. This avoids asking a client to replace a usable grant with a send-only token that cannot pass the transport's read prerequisite. It is a request for new owner consent, not a grant update. See [OpenAI authentication UI](https://developers.openai.com/plugins/build/auth#triggering-authentication-ui) and [MCP scope challenge handling](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#scope-challenge-handling).
