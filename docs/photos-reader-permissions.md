# Dedicated Photos reader

## Problem and boundary

Background library reads must not depend on Full Disk Access granted to a terminal,
SSH wrapper or general Bun executable. The existing PhotoKit helper still reports
authorized on this Mac; its bundle, binary and permission are preserved. PhotoKit
authorization does not establish permission to open the osxphotos SQLite snapshot.

Photos0.4 uses a separate **DecompozR Photos Reader.app**, identified by
`com.decompozr.photos-reader`. A real signing identity is required; setup rejects
ad-hoc production signing and never changes TCC or asks for authorization. Updates
must preserve its bundle identity and signing requirement. The app seals a copy of
the already installed Python3.12/osxphotos0.77.2 runtime and the fixed reader source.
It validates its own seal before access, accepts only bounded read commands and
one signed selected-library configuration, and exposes no interpreter, script,
environment or arbitrary command-line override. Python bypasses site startup hooks and uses only fixed bundled import roots.
Isolated Python runs with bytecode
writes disabled and bounded output/time. The app never edits the Photos database.

Studio launches it through Launch Services. Permission diagnostics run the same
app's access probe instead of opening the database in Bun. Metadata preconditions
also use the broker; exact snapshot and open-library checks remain before Photos
scripting. Existing mutations, consent, saved plans and unknown-outcome rules remain
in force. Historical plans lacking the new open-library observation require fresh
review rather than automatic replay.

## Xcode signing

The PhotosReader Xcode project uses the existing development team and a normal
macOS app target. Build packaging signs fixed nested runtime code before Xcode
signs the app; no keychain, ACL or global xcode-select setting is changed. The
setup command uses the full installed Xcode through a per-process DEVELOPER_DIR.
Xcode still uses the same signing keychain; its local GUI can present the owner
a signing prompt that the remote execution context cannot answer.

The operator may add --prepare-only to the setup command to stage resources without
signing or installing. Preparation reports a destination-specific copied project with
resources bound to that exact staging directory. Open that reported Xcode project,
choose PhotosReader / My Mac and Build. Do not Run or grant access to a test fixture. GUI output remains
a candidate until signature/provenance and protected installation are verified.

## Explicit operator setup

Reuse the existing compatible dependency environment and an available signing
identity; no runtime or package manager is installed by this command:

```sh
bun modules/photos/src/setup-reader.ts /absolute/new/private/reader-runtime \
  --python /absolute/existing/python \
  --library "/Users/you/Pictures/Photos Library.photoslibrary" \
  --sign "Apple Development: Your Existing Identity"
```

The private destination must be new/empty. Failed setup and existing runtimes are
preserved. The resulting app has fixed bundled dependencies; the external Python
used for setup does not receive a disk-access grant. After signing verification,
configure `photos.reader_helper` with its `Contents/MacOS/photos-reader` path and
restart through the supported service control. Preserve config/custody/database
and the old PhotoKit helper before the state-preserving upgrade.

Only the owner can approve **DecompozR Photos Reader** in the service Mac's
Privacy & Security > Full Disk Access. This is distinct from the already granted
PhotoKit permission. The existing Full Disk Access shortcut reveals the configured
reader app in Finder and opens Settings; it grants nothing. Subsequent checks
launch a fresh reader, so no general Bun grant is needed. Opening Settings, signing
the app, or a successful build is not permission acceptance.

## User story and acceptance

An owner who previously authorized Photos keeps that PhotoKit helper and grants
file access only to the dedicated reader. They use the module requirement shortcut,
see the named app on the service Mac, approve it in OS Settings, then check again.
Failures remain explicit; no authorization prompt or data write is triggered by
refresh. Accept only a successful actual broker library read after the OS grant,
plus preserved native helper authorization and protected deployment state.

## Current evidence and deployment gate

Native Swift compiles, module and server typechecks pass, and UI checks report zero
errors/warnings. Photos source tests74/419, targeted host tests6/49 and metadata
preflight tests1/3 pass. The isolated ad-hoc fixture verifies access to its ordinary
fixture file, refusal of another library/write command, and rejection of a tampered
resource seal (3 tests/17 assertions, including sealed startup hooks and the stalled-input deadline). A60KB stalled-input fixture is terminated within1.3seconds using a compile-only
test deadline; signed .pth startup hooks do not execute. The fixture grants no permission, is never
installed, and does not prove stable production signing or real Photos access.

Independent bounded review reports no remaining scoped source blocker after
fixing startup hooks and the blocked-input deadline; its safe fixtures3/11 pass.
Production Developer signing currently fails with `errSecInternalComponent`;
login-keychain inspection reports `User interaction is not allowed`. No keychain
password, ACL, trust setting or TCC entry was modified. Resolve native signing access
on the Mac before building the stable signed app. The actual deployed0.1.113 remains
intact;0.1.114 is an undeployed candidate. Signed packaging, protected upgrade and
actual dedicated-reader OS permission/read acceptance remain required.

Xcode27 project discovery and the unsigned app build pass. A Developer-signed
Xcode probe is still rejected with errSecInternalComponent during nested signing.
This confirms switching build tools alone does not resolve native keychain access;
local signing interaction remains required. Neither probe was installed or granted
Full Disk Access.

The destination-bound Xcode project also builds successfully with signing disabled,
and isolated project-generation tests4/16 pass. Independent recheck3/13 confirms
that preparation cannot point the GUI at another staged library. The local GUI
project is prepared but actual signed output remains to be verified.
