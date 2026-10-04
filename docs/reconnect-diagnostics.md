# Temporary reconnect diagnostic capture

This opt-in diagnostic records only five allowlisted fields: UTC completion time,
fixed stage, exact known route without query, HTTP status, and a safe error code.
It covers discovery, registration, authorization (including the owner sign-in and
account-selection steps), token exchange, and MCP. It never records request or
response bodies, headers, query parameters, full URLs, identities, client IDs,
credentials, authorization codes, tokens, provider content, error messages or
stack traces. It creates no HTTP endpoint and changes no grants or routing.

Normal provider API errors pass through its supported after-request hook: only
the structured OAuth error-code member is accepted, using an exact enum allowlist.
Arbitrary values become `unavailable` without serialization. Application scope
rejection and MCP bearer rejection explicitly supply their known enum codes.
Other errors and redirects record `unavailable`; successful HTTP responses use
`none`. This is HTTP evidence, not proof that a grant or tool operation succeeded.
No response body or redirect query is parsed by diagnostics. A redirect-only
provider error may therefore have no identifiable error code.

## Delivery and activation

This change needs a separately approved release/install and service restart.
The existing 0.1.24 process cannot activate source that it has not loaded. No
production activation is performed by building or testing this candidate.

After approved deployment, create an empty, regular, current-user-owned mode0600
file named `reconnect-diagnostics.enable` in the installation's already configured
`state_directory`. Its modification time begins a 30-minute window. The marker
content is never read. Symlinks, shared permissions, foreign ownership, future
timestamps and expired markers disable capture. Removing the marker disables it
immediately; a fresh marker or updated modification time starts a new capture.
No TOML edit or additional restart is needed to enable/disable the new runtime.

The same directory receives `reconnect-diagnostics.json`, an atomically replaced
mode0600 array retaining at most 256 records (under128KiB). Output symlinks, shared
permissions and foreign-owned output are rejected without touching their targets.
Temporary output is created exclusively; existing temporary files are untouched.
No append-only log, database schema or persistent owner/auth record is changed.
I/O failure is swallowed and cannot fail the HTTP request. Captured requests
must finish inside the same active window; aborted HTTP requests are omitted.
Concurrent requests keep separate error contexts. On process restart the memory
buffer starts empty; the next captured event replaces the old bounded output.
Expiry stops recording but leaves the last bounded diagnostic file for review.

Before asking the user to reconnect, verify activation with harmless resource
discovery and anonymous MCP GETs: expect discovery200 and MCP401 with
`invalid_token` in the private diagnostic file. These probes create no grants.
Then record the retry time and inspect the stages/statuses around it. Local/public
probes are not proof that ChatGPT infrastructure can reach the service. If no
event appears for the retry, report that no matching request was observed rather
than assuming an OAuth stage failed. Avoid inferring a legacy registration ceiling
from a generic client-side connection banner.

Delete only the two diagnostic files when the capture is no longer required.
Do not remove state databases, change grants, inspect credential values, or
restart/redeploy a second instance as a diagnostic step.

## Verification

`bun test apps/icloud/src/observability/reconnect*.test.ts` uses disposable local
files and synthetic/in-memory OAuth state only. Tests cover schema/privacy canaries,
unknown values/routes, no request-secret access, bounded retention, expiry,
permissions/symlinks, I/O isolation, overlapping requests, actual provider error
codes through the HTTP bridge, and all five stages including anonymous MCP.
