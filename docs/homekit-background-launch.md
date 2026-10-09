# Quiet HomeKit background operations

As the owner working in another app, I want a Home read/control to return through
the agent without a transient helper window or a focus change. Bound read, definition
and control helpers use LaunchServices hidden/background options before Catalyst
constructs a host window. Explicit enrollment preserves the system Home-data
permission ceremony; the native diagnostic --show-window path remains explicit.
Errors return through the existing MCP/Studio feedback paths.

Signed builds reuse an already unlocked Aqua caller directly. Background callers
use the existing Aqua Terminal context with hidden launch.
The builder starts an isolated hidden Terminal instance, verifies its worker
ancestry against the existing process baseline, and terminates only that exact
task-owned instance after completion. Existing Terminal windows remain untouched. No global Terminal/Xcode setting,
keychain ACL, credential or LaunchAgent changes are involved.

Acceptance: sample from launch through readiness, not only steady state; no
visible helper/task windows and no agent-caused focus change, while signed helper
readiness and Home access remain valid. Physical unlocked-desktop observation and
first-time macOS permission presentation must be reported separately when unavailable.

Task verification: a real hidden desktop worker retained Aqua session 100002,
graphic access and an unlocked signing keychain; only its exact task window 2982
was hidden and closed. Existing-window and failed-inspection guards were checked
without opening a GUI. A fresh independent signed helper launched through the
modified adapter and reported Home readiness plus enabled/active daily scheduling.
The launch-to-readiness window sampler recorded zero visible helper windows.
The Mac was at loginwindow during sampling; unlocked desktop visual/focus
acceptance and first-time Home-data permission presentation remain unverified.
The native source pin and signed helper payload are unchanged by this adapter/build
workflow change; no additional native signing build is required for release 0.1.105.
