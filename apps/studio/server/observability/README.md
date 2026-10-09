# Operation lifecycle and telemetry

`OperationMonitor` tracks active accepted operations, rejects new work while draining
and lets shutdown wait for idle. It emits a correlation ID, declared tool/action,
active count, duration, outcome, allowed error code and optional nonnegative counts.
It does not emit arguments, message content, identities, credentials or raw errors.

Feature code supplies an `OperationClassifier` with fixed tool/action/error-code
allowlists and classification functions. The monitor bounds classifier results
before forwarding them to its sink. Mail-specific interpretation belongs in Mail;
the shared monitor has no Mail domain import. Unknown classifier output falls back
to safe bounded fields. Classifiers are trusted source code and must never declare
private content as labels.

`run` wraps the actual operation; `beginDrain` closes admission and `waitForIdle`
waits for tracked work. This is in-memory lifecycle state, not a durable job queue,
retry mechanism or audit log of message bodies. Sink or classifier failures must
not change provider outcomes. The caller owns listener shutdown and resource close.

Colocated tests exercise privacy, completion/error paths, concurrent work and drain
behavior; server lifecycle tests cover HTTP integration. A process crash can still
interrupt in-memory tracking; Mail's durable ledger separately preserves outbound
uncertainty. See [server lifecycle](../server/README.md).
