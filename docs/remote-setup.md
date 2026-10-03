> Superseded path/runtime guidance: use [workspace layout](workspace.md).
> The initial app is HTTP-only in apps/icloud; old stdio/Node commands below are historical.

> **Preserved proposal — not validated setup instructions.** Feature work is paused.
> Bun is selected; the older Node/npm instructions below are draft material.
> [Project decisions](project.md) take precedence. Do not activate services from these notes.
> [Mailbox scope](mailbox-tools.md) supersedes any general send/draft or approval-policy
> assumptions below. Their preservation is not inclusion in the agreed scope.

# Remote setup: Mac → Tailscale Funnel → ChatGPT

These are operator instructions. No service or public endpoint is activated by
the repository. Keep the Mac awake and online while clients use this server.

## Configure the OAuth provider first

Use an external OAuth authorization server that supports MCP discovery and
ChatGPT's authorization-code flow with PKCE S256. Configure its issuer metadata,
HTTPS authorization and token endpoints, JWKS, and either supported client
registration or the client credentials required by the ChatGPT connection UI.
Allow the exact redirect URI shown during connection setup; do not guess it.
Enable refresh tokens if the provider/client supports them and verify reconnect
and revocation behavior before relying on unattended access.

Create a dedicated API/resource with audience equal to the intended public MCP
resource URL, for example `https://YOUR-MAC.YOUR-TAILNET.ts.net/icloud/mcp`. Define
`mail.read`; add `mail.write` and `mail.send` only when you intend to enable them.
Issue signed JWT access tokens with the configured issuer, audience, expiry and
scope claim. An opaque access token is not supported by this JWKS verifier.
Restrict grants to your own account using the provider's immutable subject ID
and application assignment policy. **Every accepted token accesses the one
mailbox configured on this Mac**; this is not a multi-user hosted service. Do not
allow every user of a shared issuer to obtain this API's tokens.

Set these values privately in `.env` (replace examples):

```dotenv
MCP_TRANSPORT=http
MCP_HOST=127.0.0.1
MCP_PORT=8787
MCP_PUBLIC_URL=https://YOUR-MAC.YOUR-TAILNET.ts.net
MCP_OAUTH_ISSUER=https://YOUR-ISSUER/
MCP_OAUTH_AUDIENCE=https://YOUR-MAC.YOUR-TAILNET.ts.net/icloud/mcp
MCP_OAUTH_JWKS_URL=https://YOUR-ISSUER/YOUR-JWKS-PATH
MCP_OAUTH_SCOPES=mail.read
MAIL_ALLOW_WRITES=false
MAIL_ALLOW_SEND=false
```

Issuer trailing slashes must match the token exactly. The Apple app-specific
password stays on this Mac and is never an OAuth client secret or bearer token.
The server validates tokens; it does not implement a login page, mint tokens,
or provision your provider. Provider-specific setup remains required. See
[OpenAI's OAuth requirements](https://developers.openai.com/plugins/build/auth).

## Connect Tailscale

Install and sign in to [Tailscale for macOS](https://tailscale.com/docs/install/mac)
if needed. Enable CLI integration through Tailscale's settings if `tailscale` is
not on PATH. Review your tailnet's Funnel policy, DNS and HTTPS prerequisites in
[Tailscale's Funnel instructions](https://tailscale.com/docs/features/tailscale-funnel).

Start the server with `npm start`. Before public exposure, verify the loopback
endpoint refuses unauthenticated MCP requests and returns protected-resource
metadata. Then, when ready to expose this service, run:

```sh
tailscale funnel --bg --https=443 --set-path=/icloud http://127.0.0.1:8787/icloud
tailscale funnel status
```

Use the HTTPS hostname reported by Tailscale in `MCP_PUBLIC_URL` and the OAuth
resource configuration; restart the server if it changes. Funnel forwards only the application namespace. Add the two exact standards
discovery routes from the current deployment guide, never a root catchall. Never bypass auth
for convenience. The `--bg` configuration persists; stopping the Node process
does not remove the Funnel configuration. See the [Funnel CLI reference](https://tailscale.com/docs/reference/tailscale-cli/funnel).

## Connect the client

Follow the current [OpenAI plugin packaging and connection guide](https://developers.openai.com/plugins/build/plugins).
In ChatGPT enable developer mode if available, create a connection using your
public `https://…/icloud/mcp` endpoint, and complete OAuth privately. If your account or
workspace disallows custom connections, this code cannot override that policy.

For a remote portable plugin, replace the local stdio server entry in `mcp.json`
in your deployment copy with:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "icloud-mail": {
      "type": "streamable-http",
      "url": "https://YOUR-MAC.YOUR-TAILNET.ts.net/icloud/mcp"
    }
  }
}
```

Do not commit bearer tokens or Apple credentials in that file. If using a
registered app mapping, obtain the real technical ID from the connection UI
before creating `.app.json`; no placeholder registered IDs are provided here.
A local marketplace is a separate installation route, and its support varies
by client surface. Use the actual connection/installation UI for your account.

After linking, discover tools, list folders, and read one user-selected test
message with write switches still off. Test expired-token rejection and scope
upgrades. Then verify the same connection in dots. The Mac-hosted server must
remain online even when the dot itself runs in the cloud. This integration is
not considered installed or validated in dots until that test succeeds.
