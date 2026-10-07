# iCloud HomeKit native helper

The optional iCloud MCP module owns this Catalyst helper source. The Bun broker
launches a signed local application through LaunchServices and validates Apple
signing anchor, developer team, source SHA256, protocol version and local Mac UID.
The helper has no public listener. macOS native Home authorization is separate from
OAuth account/Home enrollment in the existing authenticated MCP.

This is a development candidate, not an installed production release. Current
protocol is v0.14.0. Signing configuration and the upstream license are preserved
in `native/`; task-branch artifacts must not be installed as production releases.

## Build

```sh
python3 apps/homekit-helper/build.py --output /absolute/private/builds --desktop-session --configuration Release
```

The command uses the declared Xcode toolchain per process. On this Mac, development
signing requires the logged-in desktop security session; the desktop option runs
actual xcodebuild through a task-owned Terminal command and closes only its exact
completed window. It does not change keychain ACLs, export credentials or change the
global Xcode selector. `result.json` records source HEAD/hash, build result, embedded
source hash, signature verification and exact-window cleanup. Never launch a failed
or unsigned candidate. The old playground build entry point delegates here.

## Runtime modes and evidence

The production module uses `--read-only` or bounded `--lifecycle-directory` mode.
Lifecycle mode manages app-owned definitions and disabled triggers; it hides generic
physical controls. The experimental normal mode still exists for retained explicit
physical acceptance tooling and must not be selected by the production broker.

Private ledgers and event journals belong to owner/account/Home state directories.
No paths in this README authorize copying a private Home inventory or credential.
Replay is bounded to the latest 16 MiB and reports gaps rather than claiming complete
history. Source tests and private acceptance harnesses remain in
`playground/homekit`; the parked relationship graph patch remains inactive.

The full module/roadmap remains on the retained `plan-homekit-end-to-end` branch
while integration into the current Studio/Web-standard host is underway. This branch
first restores the helper source and verifies background presentation. See
[deployment lifecycle](../../docs/deployment-lifecycle.md) for the installed service
boundary; this helper acceptance is not a production HomeKit UI/MCP deployment.
Preserve signed rollback builds and unknown-operation ledgers until reconciliation.


## Retained packaging and preflight (integration pending)

The implementations in this section remain on `plan-homekit-end-to-end`; they are
not yet wired into the current Studio/Web-standard host branch. The retained
artifact builder can opt in a signed helper with
`--homekit-build-receipt /private/result.json --homekit-signing-team TEAM_ID`
after its positional fresh output directory. It validates the receipt, current
signature/source/protocol/HomeKit entitlement, copies the app into
`apps/homekit-helper/HomeKitProbe.app`, and verifies the copied signature again.
Native macOS artifact metadata records exact app path, protocol, source hash and
team. No helper is included unless explicitly selected; container artifacts reject
HomeKit payloads. Staging does not enroll a Home, modify configuration or launch the
helper. Current tested payloads are development candidates, not releases.

`bun bin/doctor --config /approved/runtime/config.toml` adds offline helper checks
when HomeKit is configured. It does not launch HomeKit or claim native Home/OAuth
acceptance. The broker performs the same preflight before LaunchServices startup.
Supported Info.plist must contain `HomeKitProtocolVersion` and source SHA256; older
bundles lacking that metadata fail preflight even when their Swift source hash
matches. HomeKit entitlement/team are required; this Catalyst target does not have
an App Sandbox entitlement and the checker does not invent that requirement.

The existing installer verifies any optional HomeKit payload before and after
copying a release. `icloud-plugin rollback --release VERSION-PLATFORM-ARCH
--prefix /approved/install` switches to an already retained, platform/Bun-compatible,
verified release. It preserves runtime configuration/state/operation ledgers and
never reverses Home changes. Reconcile configuration pins and enrollment explicitly
if helper source changed; never retry an unknown mutation during recovery.


## Background presentation

The helper is a LaunchServices agent (`LSUIElement=true`) and does not create a
main window by default. Native HomeManager/IPC remains on the application run loop.
Explicit `--show-window` creates the diagnostic window for setup or troubleshooting;
it does not change read-only/lifecycle/control policy. The status reports presentation
mode and visible UIKit window count. System permission prompts remain owned by macOS;
background mode does not bypass Home authorization. The production broker never
passes the diagnostic-window flag. A menu-bar UI is not required for this mode.

### Catalyst background acceptance

`LSUIElement` alone did not suppress the Catalyst host window/Dock on this Mac.
A narrow bridge calls documented public `NSApplication` selectors to select accessory
activation policy and hide the application after Home authorization. It uses neither
private selectors nor changes to signing/entitlements. UIKit/HomeManager IPC remains
active; diagnostic `--show-window` bypasses hiding. Initial permission UI is not
hidden before authorization. Actual fresh signed v0.14 acceptance verified accessory
policy, zero owned visible windows, authorized/ready read-only Home status and exact
owned-PID teardown. Five Foundation-only launch-policy checks passed. This proves
the tested local presentation behavior, not login/sleep/logout or main-MCP deployment.

Run `python3 playground/homekit/background-check.py SIGNED_BUILD_RECEIPT PRIVATE_OUTPUT_ROOT`
for a read-only presentation acceptance. Failed LSUIElement/orderOut trials are
retained privately alongside the successful run. Build commands auto-close only
their exact completed task Terminal windows.

Production payload staging requires a successful Release configuration receipt; Debug builds remain local test artifacts. Local deployment uses the established Apple Development signing identity; no public Developer ID/notarization claim is made.
