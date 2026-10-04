# Calendar discovery and reconnect

Service capability, OAuth client registration, account consent, tokens and the host's cached tool catalog are separate boundaries. Enabling Calendar changes the first boundary only. Do not patch authentication databases or widen existing tokens/consents. This workflow preserves the original Mail connection until replacement acceptance succeeds.

Calendar tool descriptors previously supplied only top-level `securitySchemes`, unlike Mail. They now also mirror the exact scope requirements in `_meta.securitySchemes` for host compatibility. Regression coverage inspects the actual MCP client-visible descriptor.

## Diagnose without secrets

1. Read the protected-resource and authorization-server metadata. Both should advertise the enabled Calendar scopes; responses are now explicitly non-cacheable. If absent, use authenticated administration to confirm effective Calendar capabilities. A policy row or an unauthenticated 403 alone proves nothing about their values.
2. Refresh the host's tool catalog. With a valid Mail token, `tools/list` advertises every policy-enabled Calendar tool and its OAuth requirement; it does not grant execution. A Calendar read call with insufficient permission returns the tool-level OAuth challenge, preserving currently enabled Mail scopes and offline access.
3. After owner Passkey sign-in on the private origin, `GET /icloud/admin/oauth-clients` reports enabled scopes, registered scope ceilings, and recovery instructions for owner-created clients or clients with owner consent. It never returns client secrets, token values or raw consents. Public access returns 404 and unauthenticated private access returns 403.

## Supported scope upgrade

For a client actually owned by the signed-in owner, explicit `POST /icloud/admin/oauth-clients` with JSON `{ "clientId": "observed-client-id", "additionalScopes": ["calendar.read"], "confirm": true }` uses BetterAuth's supported client-update API. The request must originate from the private origin in an authenticated owner session. It preserves registered Mail scopes and only allows additions enabled by current service policy. Missing confirmation is rejected. This is an operator API, not a newly added management page.

Updating a client ceiling does not update grants. The host must then request fresh authorization for the required Mail scopes plus `calendar.read` (and `offline_access` if already in use), select the same saved account, and present explicit Calendar consent. Do not request Calendar write, schedule or share merely to read a calendar.

## Anonymous legacy DCR clients

BetterAuth 1.7.7 rejects owner updates to anonymous DCR clients, including its admin update endpoint for ordinary scope updates. The recovery API returns `NEW_CLIENT_REGISTRATION_REQUIRED` instead of changing ownership or bypassing that check. A reconnect reusing that client ID can still fail `invalid_scope`.

Keep the working Mail connection. Through the host's supported connection setup, create a new registration/connection against the same MCP URL with refreshed discovery, then choose the existing saved account and explicitly consent to the requested Mail and Calendar read permissions. If the host's reconnect action reuses the old client ID, use its new connection/registration flow; do not delete the old working connection as a diagnostic shortcut. This flow needs no new iCloud account or app password. Host UI names and availability must be checked in the actual client.

OpenAI documents that DCR clients are registered once and reused for a connection, and that tool-level reauthorization needs both OAuth descriptor metadata and a runtime challenge: https://developers.openai.com/plugins/build/auth

## Acceptance and remaining gate

Backend tests exercise an actual pre-Calendar client registration followed by restart with Calendar declared, a supported owner-client scope update, unchanged existing grant rows, anonymous legacy rejection, new anonymous registration, account selection, explicit consent and token verification preserving Mail. MCP tests verify Calendar descriptors remain discoverable to a Mail-only token and execution is blocked before a provider call.

These are backend tests, not connected ChatGPT acceptance. Final live acceptance requires calling `calendar_list_calendars` through the connected plugin and then a bounded `calendar_query_events` or `calendar_get_event` using an observed calendar/event identity. Preserve original Mail access and test it again after reconnect. An OAuth prompt or metadata success is not acceptance.

Observed 2026-10-03 Toronto: production metadata advertised all four Calendar scopes. This thread's connected plugin exposed Calendar tools, but its actual calendar-list call returned reauthentication required for `calendar.read` plus existing Mail/offline scopes. No permissions were approved, no production changes were deployed, and no event was read. The supplied Library image was unavailable through this executor's exposed materialization tools and was not inspected. The independent consent UI candidate is untouched.
