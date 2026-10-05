# Local owner setup and remote passkey association

This change is opt-in. Existing installations retain their private remote sign-in and credentials until the installation owner activates local management. No credentials, grants, route configuration or accounts are replaced.

For native installations, configure `local_origin="http://localhost:PORT"` with a port distinct from both public and private listeners. The setup-plan CLI probes a bounded loopback port range and prints a template containing the selected origin. Apply the reviewed configuration before starting the runtime; a port probe does not reserve the port across startup. Container mode does not expose this listener.

Run `icloud-plugin run --config /path/to/config.toml --prepare-local-owner` (or invoke the installed runtime with the same flags). This requires the installation owner's OS custody access. It writes a private one-use authorization valid for ten minutes and opens localhost setup on macOS. `--no-open` prints the URL without opening a browser. The proof is carried in the URL fragment, removed before the ceremony, and redeemed into an HttpOnly SameSite cookie. Localhost identity, forwarded headers, or Tailscale headers alone cannot enroll or reopen an owner. Expired authorizations may be regenerated; pending ones are not silently overwritten.

Create the localhost passkey and complete setup. For an existing installation the credential is associated with the established owner. Its remote passkeys and all accounts remain unchanged. Local and remote cookies use distinct names and signing secrets; WebAuthn validates different RP IDs (`localhost` and the configured remote hostname).

After authenticated local enrollment, the owner may explicitly confirm creation of a remote pairing link. `POST /icloud/admin/remote-owner` with JSON `{ "confirm": true }` creates a one-use five-minute link for the configured private origin. Open that link to add a remote RP credential to the same owner; this is an additive operation. No credential is deleted. Remote pairing cancellation/reload may resume the bounded cookie ceremony, while an expired link requires a new explicit local confirmation.

The local listener does not expose OAuth token/registration endpoints or MCP. Public MCP remains on the existing public listener and OAuth remains at its existing issuer. Global service policies continue to constrain all connections. Local credentials do not grant additional Mail or Calendar permissions.

Recovery requires OS custody and a fresh explicit authorization. Lost or corrupt authentication databases are still rejected at startup; this flow does not silently rebuild them or replace installation custody. A full lost-custody recovery mechanism and passkey deletion are outside this change.
