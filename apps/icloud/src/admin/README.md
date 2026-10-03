# Private setup/admin boundary

Goal before implementation: actual private HTTP handler displays Tailscale
prerequisites before owner enrollment or Apple credential inputs; successful
Passkey session + independent bootstrap proof + provider validation precede
atomic storage enrollment. Failed validation permits retry. Existing owner alone
may rotate/revoke locally stored credentials. No secret appears in responses.

Caller mounts this handler on the private listener only and supplies trusted
Tailscale diagnostics, owner authentication and a real provider validator.
Fixtures do not establish actual Tailscale reachability or Apple connectivity.
State-changing requests require exact private Origin and JSON bodies. Bootstrap
proof is injected internally only after trusted owner/grant checks, never
requested from the browser or included in a URL. Setup and admin pages use no third-party scripts.
Browser Passkey registration requests a session from the maintained auth handler;
synthetic handler tests do not prove a physical authenticator ceremony.
