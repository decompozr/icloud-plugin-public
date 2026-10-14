# macOS Studio service release

The macOS release contains `DecompozR Studio.app` with a fixed native launcher,
Bun 1.4.2, the release CLI, Studio and its bundled modules. Its identity is
`com.decompozr.studio-service`, signed by Apple team `74NBML8KJB`.
The existing HomeKit App is copied without replacing its signature or entitlements.
Photos continues to use the configured Python/osxphotos reader and PhotoKit helper.

## Build and sign

From a clean, verified release checkout, run `bun run build`, then:

```sh
bun packages/tooling/src/build-artifact.ts /absolute/new/artifact-directory \
  --homekit-build-receipt /absolute/verified-homekit-receipt.json \
  --homekit-signing-team 74NBML8KJB
bun bin/sign-studio-service /absolute/new/artifact-directory CERTIFICATE_SHA1
```

The signing command uses an existing certificate and private key. Run it in the
Mac owner's local terminal session if SSH cannot access that signing identity.
It does not unlock a keychain or change its access rules. Unsigned candidates are
rejected by the installer. Re-signing Bun preserves the executable-memory and
library-validation exceptions needed by its runtime, but excludes DYLD environment
injection. The native launcher sanitizes its environment and disables Bun config
and `.env` autoloading. A release must additionally pass a trusted signed execution
check; ad-hoc fixture results do not satisfy this requirement.

Apple Development signing supports this owner's local installation. Shipping to
other Macs requires a Developer ID distribution/notarization workflow, which this
local installer does not claim to provide.

## Install and update

```sh
/absolute/artifact-directory/icloud-plugin install
# Existing installation:
/absolute/artifact-directory/icloud-plugin update
```

No separate Bun installation is required by the macOS release. The default prefix
is `~/.decompozr/plugins/icloud`. The versioned App resides in `releases/`, while
`current` selects the active release. Configuration, state and logs remain under
`runtime/` and survive updates and uninstall. Existing runtime configuration must
be prepared through the current setup flow before the server can become ready.
Installer activation checks establish the supervisor, not HTTP/Photos readiness.

A per-user LaunchAgent runs the installed App. New installations default to login
startup and server-failure restart; existing settings survive updates. Admin's
System & diagnostics controls retain their independent switches. Login startup
requires that user's macOS login session; this is not a pre-login system daemon.
Unexpected loss of the native launcher drains its children; automatic recovery
currently covers server failures inside the supervisor, not every native-launcher
crash.

Updates lock service control, verify the candidate, drain the old process, then
switch releases. Failed activation attempts drain the replacement and restore the
old pointer. Recovery failures are reported explicitly; an unverified or foreign
process is never forcibly terminated. Uninstall drains and unregisters an owned
App LaunchAgent before removing release files; it preserves runtime data.

## Photos permission

The App is the responsible identity for its background children. macOS Full Disk
Access remains an explicit owner grant: the setup action reveals the installed
App and opens Privacy & Security. Add that installed App, enable access, then retry.
The installer cannot grant Full Disk Access or silently add an authorized entry.
Do not grant the shared Bun runtime solely for this service.

Configured Python, its site packages and hooks remain owner-managed executable
code outside the App seal. The App is not a sandbox against that owner's scripts.
The existing PhotoKit helper retains its separate Photos authorization. Verify a
real read through the managed service after granting access. Permission continuity
across an App update and login/reboot must be tested separately; a stable bundle
identifier and Team alone are not evidence of those results.
