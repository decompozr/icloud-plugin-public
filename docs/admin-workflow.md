# Single-owner administration flow

The overview separates service/Tailscale observations from global Mail and Calendar capabilities. Account cards display each email once and describe the shared iCloud credential. Global capabilities limit what clients may request; changes do not expand existing grants.

Client connection cards come from active account-bound consent and tokens, intersected with registration and global policy. Registration metadata and inactive history are Advanced details. A management preview names all affected accounts and actions before revoking every grant for that client; removing registration additionally hides its metadata. Neither operation deletes an iCloud credential. Mutations serialize with OAuth issuance across the shared database, and pending codes, refresh tokens, access tokens and consent are removed together.

The OAuth portal authenticates the owner, selects or verifies an iCloud account, and offers granular Mail/Calendar permissions. The provider verifies the chosen subset against the original signed request; refresh keeps the reduced scope. Back/cancel and page lifecycle clear secret inputs.

Each diagnostic fetch retains its own prior observations after failure. A failed or old fetch shows snapshot freshness; it does not erase a past successful read or claim current provider availability. Foreground refresh is bounded to ten 30-second cycles and pauses for hidden pages or unsaved forms. Refresh restarts the cycle. Initial status remains unknown until observed.

Native local management uses the protected flow in [local owner setup](local-owner-setup.md). Local and remote passkeys belong to the same owner but different RP identities. Enrollment and pairing remain explicit user ceremonies. Existing remote login, grants and accounts remain usable while adding a local passkey. The local listener exposes neither public MCP nor OAuth issuance.

Verification uses disposable state and dummy provider credentials: application authorization/custody/RP tests, genuine provider consent/token/refresh/revocation tests, isolated desktop/mobile browser checks, and immutable-artifact lifecycle checks. Physical passkey hardware, real provider reads and live client acceptance remain separate checks. No future roadmap module is presented as usable.
