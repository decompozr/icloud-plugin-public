# Photos access regression: launch-context diagnosis

## Finding

On 2026-10-13 the installed 0.1.113 Python reader works when invoked from the
executor shell, directly or through the installed Bun provider. The same production
MCP health request fails under the managed LaunchAgent. TCC attributes its Python
child to the background Bun service and explicitly denies Photos access. This is a
launch-context permission failure; a Python implementation/version failure does not
explain the successful invocation of those same installed bytes.

## Matched read-only checks

| Invocation | Result | Observed TCC responsibility |
| --- | --- | --- |
| Configured Python, database header read | 16 bytes read | SSH wrapper |
| Configured Python, installed reader health | Success, osxphotos 0.77.2 | Executor shell context |
| Bun, installed provider, same Python/reader/library health | Success | Executor shell context |
| Production MCP Photos health | photos_permission_required | Background Bun PID 646 |

The current configured interpreter resolves to Python 3.12.15. osxphotos is 0.77.2
and photoscript is 0.6.1. The interpreter path equals the reused path recorded in
the 2026-10-06 helper manifest. No prior interpreter hash is available to establish
historical byte equality; current success/failure comparisons use the same file.

The current service starts via a per-user LaunchAgent whose program is Bun with
the installed release entrypoint. PID 646 has parent PID 1. Managed background
service support was introduced on 2026-10-09 in commit 959cb2e. Starting from an
authorized terminal and starting through launchd are distinct permission contexts;
terminal access is not established for the managed service by having the same UID.

TCC readback at 2026-10-13 13:42:55 (host log time) identifies the Python child
PID 44185, responsible Bun PID 646, and says access to kTCCServicePhotos is denied.
It also reports that the responsible hardened-runtime executable lacks the Photos
library entitlement required for prompting. This does not mean adding an
entitlement alone grants access. The direct Python probe is attributed to the
previously authorized SSH wrapper instead. No grants or TCC changes were made.

The owner's previous iTerm success is consistent with this attribution difference,
but direct iTerm retesting was unavailable: computer-control tooling explicitly
rejected access to that app. No alternative control path bypassed that restriction.
The current matched shell/production checks establish the failure without claiming
an actual iTerm run or the historical first failure time.

## Consequence

The existing PhotoKit helper's authorization is a separate path and does not grant
the Python database reader the background service's missing access. Bun is the
responsible process in the denied background path, rather than the database reader
implementation. This finding does not require an additional Reader app or a new
Apple signing certificate as a diagnostic prerequisite. The draft Reader solution
is retained for review, with implementation/deployment paused pending a selected
service-access design. No generic Bun grant, new helper installation, dependency
change, service restart or Photos write was performed during this investigation.

[Apple DTS discussion of terminal versus launchd access](https://developer.apple.com/forums/thread/118508)
provides platform context; local TCC readback and matched checks are the evidence
for this installation.

## Controlled one-shot LaunchAgent experiment

A follow-up experiment ran the exact same read-only health probe twice, with the
same explicit environment variables, Bun executable, Python interpreter, installed
reader and selected library. The first run was spawned from the executor SSH
shell; the second was spawned by a temporary per-user LaunchAgent with RunAtLoad
and no keep-alive. No production listener or daemon was started by the probe.

| Case | Bun PID / parent PID | Result |
| --- | --- | --- |
| Executor shell | 81855 / 81853 | Reader health succeeded |
| Temporary LaunchAgent | 81901 / 1 | photos_permission_required |

The temporary job was unloaded successfully and launchctl readback confirmed it
was absent. Production service process record, release symlink and configuration
hash matched before and after. This strengthens the launch-context explanation:
changing only the launch context reproduced the failure without a dependency,
helper or production configuration change. This is same-agent experimental
verification, not independent review or an actual iTerm run.
