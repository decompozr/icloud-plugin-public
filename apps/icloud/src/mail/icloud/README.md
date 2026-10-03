# iCloud Mail adapters

This is Mail's provider boundary, not a host-wide iCloud framework. `adapter.ts`
implements IMAP sessions, mailbox/message operations and MIME parsing. `outbound.ts`
implements SMTP composition/submission and IMAP draft operations. `unsubscribe.ts`
handles supported outbound unsubscribe mechanisms and destination restrictions.

The Mail module supplies the current credential; adapters implement domain ports
used by services. Operation-owned sessions keep mailbox selection and cleanup
local. Selected-message move logic checks provider capabilities and failure results;
unsafe global-expunge convenience fallbacks must not replace that logic. Network
success, message acceptance and confirmed user-visible delivery are distinct.

Credentials and private MIME stay inside the provider/service path; telemetry must
not contain them. Unsubscribe handling constrains destinations, redirects and
response sizes and is not an arbitrary browsing facility. Exact behavior and bounds
are maintained in [mailbox contracts](../../../../../docs/mailbox-tools.md).

Colocated move/outbound/unsubscribe tests exercise injected transports and failure
paths. Real iCloud capabilities, SMTP delivery and subscription cancellation require
separate authorized live evidence. Calendar would use a separately owned CalDAV
adapter, not methods added to these Mail adapters.
