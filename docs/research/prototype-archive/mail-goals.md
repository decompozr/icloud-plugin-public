# Next mail experiments: goals and expected observations

> Historical research archived on 2026-10-07. Commands and prototype paths below describe the original experiment, not supported commands in the current checkout. See [retirement and current replacements](../retired-prototypes.md).

These are finite library experiments, not proposed production handlers. All use
loopback IMAP or synthetic MIME, never Apple credentials or public services.

| ID | Goal | Expected observation / acceptance |
| --- | --- | --- |
| M1 | Inspect message identity boundaries. | Missing UID fetch returns no message; a fresh connection exposes changed UIDVALIDITY. Record whether the library itself prevents using an old UID (do not mistake metadata for a guard). |
| M2 | Inspect move failure and partial completion. | Reject COPY at the fixture; observe whether subsequent STORE/EXPUNGE occurs. Separately reject STORE after successful COPY and observe what the API reports and which commands follow. Unexpected dangerous behavior is a finding, not successful product acceptance. |
| M3 | Inspect mailbox lock serialization. | Two overlapping tasks acquiring different mailbox locks emit SELECT/store sequences that stay grouped by lock; cleanup emits no implicit CLOSE/EXPUNGE. This checks cooperative use of one client, not other sessions. |
| M4 | Inspect Unicode MIME and data bounds. | Decode synthetic Unicode headers/body; confirm full parsing includes attachment bytes and inspect whether partial source is silently accepted. Record why transport limits/explicit truncation remain needed. |

A finite experiment is complete when its expected observations and limitations
are recorded, including a failure or unsafe result. Live iCloud capability and
client compatibility acceptance remain distinct and cannot pass from fixtures.
