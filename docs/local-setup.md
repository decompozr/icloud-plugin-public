# Local owner setup

This is the current application entry path. CP3/CP4 local integration passed independent review. CP5 artifact validation and CP6 actual routing/client checks are tracked separately.
The native private Tailscale setup route is live. No real owner Passkey or iCloud account has been enrolled automatically.

1. Build with `bun bin/build`. Copy `apps/icloud/config.example.toml` to an
   owner-controlled directory outside the release; use absolute file paths or
   paths relative to that configuration. Configure one hostname with different
   private and public HTTPS ports, plus distinct internal listeners.
2. Run `bun apps/icloud/dist/index.js --config /absolute/config.toml --initialize`
   once. This creates an owner-only random wrapping key, installation marker,
   bootstrap-proof file and pending owner database. The key/marker must stay
   outside the state directory. The command does not start a listener or print
   secrets. Existing or incomplete state refuses reinitialization.
3. Run `bun apps/icloud/dist/index.js --config /absolute/config.toml`.
   Runtime opens existing state, starts separate private/public routers and does
   not install dependencies or compile. The auth provider creates/migrates its
   SQLite schema on initial startup; release migration discipline remains CP5.
4. Configure private Tailscale Serve and public Funnel only at the explicit
   integration step. The private setup page checks installed/authenticated/online
   Tailscale and its own reachable private endpoint before enrollment. In
   container mode a host helper supplies a fresh minimal status file through a
   read-only directory mount; stale/missing diagnostics fail closed.
5. Configure `bootstrap_owner_login` to the intended Tailscale owner login.
   Open the private `/icloud/setup` address as that owner and follow the guided checks.
   Click **Set up Passkey**, then enter the
   iCloud email and Apple app-specific password in that same private page.
   The service tests the provider connection before committing single-owner
   enrollment. The internal bootstrap proof stays server-side; no file copying is required.
   Do not send passwords through chat.
6. The public OAuth flow uses `/icloud/sign-in` and `/icloud/consent`; private `/icloud/admin` permits
   owner login and credential rotation/revocation. Public routing never mounts
   setup/icloud/admin handlers. Revoking the local credential does not revoke it at
   Apple; OAuth token revocation is a separate action.

Back up encrypted state with a deliberate custody/recovery policy. Losing the
key or installation marker fails closed; there is no automatic account reset or
implemented disaster-recovery UI. A real browser Passkey ceremony, actual client
eligibility and end-to-end Tailscale routing are still user/environment checks.

After enrollment, the next integration step is to make the public MCP/OAuth
listener reachable, then add the `/icloud/mcp` URL in the chosen assistant and sign in
with the owner Passkey. The private `/icloud/setup` address is not the connector URL.
For the native listener configured on port 4100, the scoped operator command is
`tailscale funnel --bg --https=443 --set-path=/icloud http://127.0.0.1:4100/icloud`; first inspect existing
Serve/Funnel configuration and confirm port 443 is available. This command is a
separate deployment action, not something the setup form executes. Preserve the
private 8443 rule and unrelated routes. See [client artifacts](client-artifact.md)
for the Codex bundle and ChatGPT connection workflow.

Deployment must mount only the application path, never a root catchall. See
[deployment scope](../deployment/README.md#deployment-scope) for the two exact
OAuth discovery mounts required in addition to `/icloud`.

## Optional sending permission

The next outbound checkpoint keeps `allow_send = false` by default. Enabling
mailbox writes does not enable sending. After implementation acceptance, the owner
must explicitly enable sending and authorize a new OAuth grant containing
`mail.send`; existing read/write grants remain unchanged. Do not enter Apple
credentials into a client. `mail_draft_create` uses `mail.write` and creates only
a new draft; it does not send it. Every outbound call requires a new UUID
`operationId`; reuse that same ID to retrieve a receipt, never generate a new ID
to retry an uncertain operation. No real send/draft smoke test is authorized
by merely enabling the tool.
