# Native and Apple Container lifecycle

CP5 goal and acceptance before implementation: build platform-matched artifacts,
package existing output without build/install, start only installed output using
explicit TOML configuration, retain separately located state and custody through
updates, and remove only owned installation files. Actual application startup,
restart and scoped removal use temporary directories without real credentials.
Native/container routes must keep private setup distinct from public MCP.

Build is the only lifecycle step that installs dependencies. Release packages an
already prepared artifact; runtime neither installs nor compiles. Each artifact
records version, OS, architecture and Bun version. The native runtime requires
Bun1.4.2; Linux image supplies that runtime. Real Passkeys, iCloud and Tailscale
activation remain separate user integration checks.

## Build and release

Install dependencies independently in `apps/icloud` and `packages/tooling` using
`bun install --frozen-lockfile` in each directory. From the checkout,
`bun bin/build` emits JS into `apps/icloud/dist`. Then
`bun bin/build-artifact /absolute/fresh-artifact-directory`
prepares production dependencies for the current platform, excluding source,
tests, private config and environment files. `bun bin/release /absolute/artifact-directory /absolute/output-directory` packages that existing
artifact; it refuses overwriting a versioned archive. Without explicit paths,
assembly uses `apps/icloud/build/<platform>-<arch>` and release archives use
`releases`. For this checkout, extract the selected archive into
`releases/<version>-<platform>-<arch>` and invoke its `./icloud-plugin install`. Production installs to
`~/.decompozr/plugins/icloud`, with private configuration/state/custody under
`runtime/` and immutable versions selected by `current`. Production dependencies stay under the artifact app directory. The archive requires the
matching Bun runtime. Build on each target OS/architecture; do not relabel a Mac
artifact as Linux.

`bun bin/build-container icloud-plugin:0.1.0` builds the
Linux image locally using a minimal temporary build context. Its allowlisted
source/manifests exclude credentials, home files and host modules before upload.
Dependencies are installed only in build stages. Runtime runs UID/GID10001 with
no dependency installation. The image does not contain a configured owner or
Apple credentials and does not create a public route.

## Native installation, update and removal

Unpack a trusted reviewed release into a staging directory. Use
`./icloud-plugin install` from that release (default `~/.decompozr/plugins/icloud`),
or `./icloud-plugin update` against an existing owned installation.
Use `--prefix /absolute/install` only for an explicitly separate instance. Each version is immutable;
an atomic `current` symlink selects it. Stop this service before updating and
retain the old release for rollback. Do not switch back after schema migration
without an independently validated backup/migration plan.

Keep TOML config, `state_directory`, `master_key_file` and `installation_marker`
outside the release tree. Use the supplied example config with separate state
and custody locations. Explicit one-time provisioning is
`/absolute/install/current/runtime.sh /absolute/config.toml --initialize`.
Normal production runtime is `~/.decompozr/plugins/icloud/current/icloud-plugin run`,
which defaults to `~/.decompozr/plugins/icloud/runtime/config.toml`.
It never provisions, installs or compiles automatically. Protect config/custody
with owner-only permissions. Losing either key or marker is recovery failure,
not authorization to enroll a new owner.

The launch-agent template is optional and never installed automatically. Replace
all paths and create private log directories before explicit `launchctl bootstrap`.
It starts after user login; logout/sleep/offline interrupt availability. Stop only
`local.icloud-plugin` using `launchctl bootout gui/$(id -u)/local.icloud-plugin`.
Once stopped, `bun bin/install uninstall /absolute/install`
removes only owned releases/current/marker. It retains state, custody, config,
logs and unknown files. Remove the optional plist separately. OAuth grant
revocation and Apple app-password revocation are separate operator actions;
uninstall does not delete mail or alter unrelated Tailscale routes.

## Container configuration and custody

Set `runtime_mode="container"`, `host="0.0.0.0"`, state under `/state`, key and
marker under `/custody`, and separate public/private ports4100/4101. Mount the
private configuration directory read-only at `/config`; persist `/state` and a
separate `/custody` directory outside the image. Both writable mounts must allow
UID10001 access. The installation marker changes during enrollment, so custody
cannot be wholly read-only during setup; an independently mounted master-key
file may become read-only after explicit provisioning. Back up ciphertext and
custody separately. Never mount the entire home directory or repository.

Initialize once by appending `--initialize` to the image command with those
mounts. Start normal runtime without it. Forward each listener separately; the
private setup port must stay on host loopback/private Serve and must never be
sent through public Funnel. Native Apple-container port publishing previously
failed on this Mac; use the separately validated loopback proxy approach with
container IP rediscovery if needed. This template does not configure Tailscale.

A host-only prerequisite helper runs
`bun bin/tailscale-status /private/diagnostics/status.json --watch`.
It reads CLI status and atomically emits only installed/authenticated/online and
ISO checkedAt. Mount its directory read-only at `/diagnostics` and point
`tailscale_status_file` there. The app must reject stale snapshots. Do not mount
the Tailscale socket or expose raw CLI output. Stop the helper with SIGTERM.

## CP5 verified artifacts and limits

On Bun1.4.2, the native artifact at `.flow-runtime/build/native-cp5-final` passed
**5 lifecycle tests / 41 assertions**, including the actual installed
`current/runtime.sh` launcher, explicit-only initialization, failed/mismatched
update preserving current, retained custody/state, anonymous MCP rejection,
restart and closed listeners. Proxy tests preserve POST/GET/DELETE, authorization,
MCP session/protocol headers, multiple cookies and event streams; stopping the
proxy aborts an open upstream stream. The matching versioned native archive is
under `.flow-runtime/releases-final`.

The locally built Linux image `icloud-plugin-cp5-final:0.1.0` starts the actual
application as UID10001 with no source/build step at runtime. Two actual image
startup/stop cycles preserved the key, exposed the private setup health route
and rejected anonymous MCP calls. The same built application E2E graph passed
**5 tests / 147 assertions** under that image using a read-only test-only mount:
synthetic Passkey/OAuth enrollment/MCP/restart, typed provider, loopback IMAP/SMTP
and unsubscribe fixtures. The cbor fixture encoder is JavaScript-only with native
acceleration disabled; no Mac native modules were mounted. Permission errors
from copied owner-only manifests were fixed by normalizing public artifact
manifests to0644. Known BetterAuth SQLite array/TEXT warnings remain.

Reproduce after building the application/E2E bundles:

```sh
CP5_ARTIFACT_DIR="$PWD/.flow-runtime/build/native-cp5-final" bun test apps/e2e/lifecycle
python3 apps/e2e/lifecycle/container.py icloud-plugin-cp5-final:0.1.0
python3 apps/e2e/lifecycle/container-e2e.py icloud-plugin-cp5-final:0.1.0
```

The test harnesses remove owned temporary containers and state. Images/releases
remain local artifacts, not published releases. These tests do not establish a
physical Passkey ceremony, real Apple account access, Tailscale routing, cloud
client enrollment, host sleep/reboot/logout availability or recovery after
schema-changing rollback. Container host proxy usage is
`bun bin/container-proxy CONTAINER_NAME`: it discovers the
current IP per request and exposes separate host-loopback public/private ports;
it never configures Serve/Funnel.

## Historical queued 0.1.1 validation

The HTML-only MIME fix is packaged separately as version0.1.1. It is **queued**,
not installed over the running0.1.0 service. No live process, owner state,
custody files or routes were changed for this validation.

- Native build: `.flow-runtime/build/native-queued-0.1.1`.
- Native archive: `.flow-runtime/releases-queued-0.1.1/icloud-plugin-0.1.1-darwin-arm64.tar.gz`.
- Linux image: `icloud-plugin-queued:0.1.1`, image manifest-list digest
  `sha256:481d4fbb0751bd0321bbbf4531bfc79de66c5893bfbee217f9b9bca31997507c`.

Both artifact manifests report0.1.1/Bun1.4.2/arm64 with the correct darwin versus
linux platform. The native artifact passed the actual installed-launcher startup,
explicit initialization, two restart and cleanup scenario (**1 test,17 assertions**)
in temporary state. The Linux image passed the changed HTML-only built HTTP/MCP
MIME scenario (**1 test,17 assertions**) as UID10001. The scenario exercises the
actual MIME parser, readable HTML fallback, removal of script content,500-character
summary bounds and truthful truncation. Broad unchanged suites were not repeated.

Source checkout is uncommitted; no Git revision provenance is claimed. Read-only
hash comparison found identical entry bytes in the current build, native artifact
and Linux image:

- `apps/icloud/dist/index.js` SHA256:
  `ef1f71ad57493363fb48031f3f6ce75db5c41ddf7fe3c8a93699ad003233664f`.
- `bun.lock` SHA256:
  `50bf746769f2fab5dcb0cc6197b26f18238814a2962895f8df2c92bb4546f9d4`.

The targeted Linux command is
`python3 apps/e2e/lifecycle/container-e2e.py icloud-plugin-queued:0.1.1 html.e2e.test.js`.
Temporary containers/mounts were removed. Updating the live installation remains
a separate controlled action after the ongoing owner-enrollment checkpoint.

## Current private wizard deployment

The native private instance was updated to immutable 0.1.3 while preserving state,
custody and Serve rules. The earlier queued-update section is historical.
Set `bootstrap_owner_login` to the intended Tailscale login before enrollment;
Serve supplies the trusted identity. No setup proof is entered in the browser.
For container private ingress, configure `private_proxy_address` to the exact
trusted host proxy address. This trust boundary includes the local OS account;
do not expose the private listener directly. Native 0.1.3 installed-artifact
checks pass 25 assertions, including real HTTP browser asset delivery. The
0.1.3 wizard update has not been revalidated in a Linux image.

## Deployment scope

Install/update/rollback/uninstall operate only on a dedicated marked application
instance directory and its immutable releases. Never install at a filesystem root,
kill processes by port/name, reset global Tailscale configuration, mount the host
root into a container, or remove another service’s route. Native runtime needs no
sudo; container runtime remains nonroot. Keep state and custody across updates.
Stop only the recorded process after verifying its executable/working directory.

Private Serve exposes only the application namespace (repeat the path on the
proxy target because Serve strips the mount prefix):

```sh
tailscale serve --bg --https=8443 --set-path=/icloud http://127.0.0.1:4101/icloud
```

Public exposure is a separate operator action, not performed by owner setup.
After checking the selected port and paths are unused or owned by this instance:

```sh
tailscale funnel --bg --https=443 --set-path=/icloud http://127.0.0.1:4100/icloud
tailscale funnel --bg --https=443 --set-path=/.well-known/oauth-protected-resource/icloud/mcp http://127.0.0.1:4100/.well-known/oauth-protected-resource/icloud/mcp
tailscale funnel --bg --https=443 --set-path=/.well-known/oauth-authorization-server/icloud/auth http://127.0.0.1:4100/.well-known/oauth-authorization-server/icloud/auth
```

The two standards-required discovery mounts are explicit exceptions outside the
application prefix; they are not a root catchall. Remove only a known owned mount
with the same `--https` and `--set-path` plus `off`. Snapshot and compare unrelated
configuration before/after every change. Never use a global reset or whole-port
off when unrelated routes may share it. The container loopback proxy likewise
rejects all paths except `/icloud` and descendants and these two exact metadata
paths before contacting its upstream. A legacy `/setup` redirect exists only in
the private application router; scoped ingress intentionally does not expose it.

## Optional native login service

The [LaunchAgent template](../docs/launch-agent.plist.example) starts only an
installed native artifact. Replace every `/ABSOLUTE/…` placeholder with the
actual absolute Bun executable (`command -v bun`), dedicated install prefix,
private configuration file, and private log directory. XML-escape path characters
such as `&`. Its stable label and filename are `local.icloud-mail-mcp` and
`local.icloud-mail-mcp.plist`. Do not reuse that label for another instance.

The invocation is equivalent to:

```sh
/absolute/path/to/bun /absolute/install/prefix/current/apps/icloud/dist/index.js --config /absolute/private/config.toml
```

Keep configuration, state, and custody outside `current`; the configuration must
refer to the existing installation. Never add `--initialize` to the agent. The
entry point follows the installed `current` symlink on the next process start;
changing that symlink does not itself restart a running process. Native runtime
needs no container proxy or dependency installation at launch.

Before opting into background operation, validate the configured copy with
`plutil -lint /absolute/path/to/local.icloud-mail-mcp.plist`. Create its private
log directory with owner-only access and keep the plist owner-writable only.
Check that no existing instance owns the listener ports and stop only the
verified owned foreground process before starting its replacement. Test the
same artifact/configuration in the foreground first; invalid configuration with
KeepAlive enabled would otherwise cause repeated failed starts.

Loading is an explicit operator action, not part of build or artifact install:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.icloud-mail-mcp.plist
launchctl print gui/$(id -u)/local.icloud-mail-mcp
```

Copy the reviewed configured file to that exact path before loading. Verify the
reported process and private HTTP readiness afterward. To stop this agent, use
`launchctl bootout gui/$(id -u)/local.icloud-mail-mcp`; do not unload unrelated
agents or remove account state. Tailscale route ownership is separate and must
remain scoped as described above.

This is a per-user login agent, not a boot-before-login service. Logout, sleep,
network loss, and a powered-off Mac can interrupt access. No login/reboot/sleep
acceptance is claimed by supplying this template. Apple Container mode instead
requires its own container, host diagnostics watcher, and scoped host proxy
lifecycle; do not use this native template to launch a Linux artifact.

## Linux 0.1.14 artifact check

The isolated Linux/arm64 checkpoint built the actual runtime image and passed
11 E2E tests (236 assertions), including owner enrollment/OAuth, authenticated
plugin ZIP download, outbound fixtures, MIME reads and graceful draining.
No live configuration, credentials, or mailbox were mounted. Runtime UID 10001
and installed template/icon/browser assets were checked; application source is
absent from the runtime image.

The build context explicitly includes the public plugin manifest, workflow skill
and icon. Public plugin-template files are normalized to readable permissions in
the image so the nonroot runtime can package them; state/custody permissions are
not relaxed. The E2E runner creates a disposable derived image containing `unzip`
for archive validation, retaining UID 10001. Production has no added unzip package.
The runner removes its container, derived image and temporary fixture directory.
The audit production tag was removed and the previously stopped builder restored
to stopped after this checkpoint. This does not establish host reboot, sleep/wake,
real provider, or external client acceptance on Linux.

## Linux 0.1.15 scope-upgrade check

An isolated Linux/arm64 production image passed 11 E2E tests (236 assertions).
The separate historical-resource upgrade fixture dynamically imported that
image's installed owner-auth module and passed 1 test (60 assertions), preserving
existing grants while testing freshly authorized scopes. The E2E runner explicitly
sets `CP5_ARTIFACT_DIR=/opt/icloud` and resolves fixture authentication dependencies
from the Linux image. No real tokens, account state or mailbox were used.

Production image manifest SHA256:
`eff7ae93de4d7bee40c6e5e4d79f839d61c3ac5d1ce70b1115e85fba324bd3ea`.
Runtime UID 10001 and absence of `test-fixtures` in installed output were checked.
The audit image, disposable test images, extra bundled regression and temporary
logs were removed; the builder was returned to its prior stopped state.
