# Official Bun / scoped helper protocol experiment

Status: synthetic process transport passed; K0 remains incomplete (2026-10-05).
Question: can official Bun exchange exact master/password bytes with a separate
local process while binding requests to fixed custody operations and selectors?

Run `bun playground/keychain/run-helper-protocol.ts`. The runner supervises a
second official Bun process modeling a native helper with an ephemeral memory
store. No native Security API, Keychain, live credentials, signer or installation
is touched. Standard output contains only the redacted result summary.

The candidate frame is an eight-byte prefix (big-endian JSON-header length and
raw-payload length), followed by a strict UTF-8 JSON header and raw bytes. Version,
request UUID, read/add/delete, master/password kind, exact installation/account
identity and interaction policy are explicit. Selectors come from the existing
fixed namespace functions, not caller-supplied service/path strings. Reads and
deletes prohibit interaction; read requests carry no secret payload. Add is
create-only. No secret is placed in process arguments or inherited environment.

Observed thirteen requests preserved the exact 32-byte master and password bytes,
bound response UUIDs, rejected missing alternate accounts without fallback,
rejected duplicate adds, rejected interactive reads and arbitrary service fields,
deleted only the exact master and retained the account password. Array-valued
action/installation identity fields were rejected without string coercion. Truncated and
oversized frames were rejected by the decoder. Standalone TypeScript checking
passed after annotating the payload type to support Buffer-backed byte arrays.

Limits: the child is Bun with synthetic memory, not the native helper. The fixture
collects process streams before decoding; the production adapter needs limits
during collection, timeout/termination and uncertain-mutation handling. This run
does not prove transport denial to other OS users, native UI suppression, helper
signature/access policy, ordinary-update continuity or login/lock availability.
Wiping owned buffers is best effort and does not erase every transient copy.
No real credential value or digest is recorded. Historical Keychain evidence
remains separate; this experiment does not rerun or replace it.

Next: implement a bounded Bun-side adapter using this candidate framing with
synthetic process failure tests, then qualify the selected native backend under
applicable authorization. Do not select it in product runtime until revised K0
and migration/lifecycle gates pass.
