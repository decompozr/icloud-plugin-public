# Build and deployment tooling

Reusable typed implementations and colocated tests live in `src/`. Root `bin/`
commands are thin stable entrypoints. Build prepares artifacts; release packages
existing artifacts; install/update/uninstall require a marked dedicated prefix;
runtime never builds or installs. Tooling source is not included in production
runtime artifacts. Container build runs these tools in its build stage only.

Uninstall retains the regular-file ownership marker and private runtime. Install
can reuse that real prefix only when both `current` and `releases` are absent;
installed prefixes require update, and unmarked or symlinked prefixes are refused.
Older uninstalls that removed ownership proof require explicit recovery.

Install tooling dependencies here with `bun install --frozen-lockfile`. This package owns its manifest, lockfile and `node_modules`; it does not share a root dependency installation. Native assembly defaults to `apps/icloud/build/<platform>-<arch>` and archives to `releases`.

The client export and installed runtime plugin template include both
`icloud-mail` and `icloud-calendar` skills. Calendar is an optional registered
module, disabled by default; packaging its guidance does not enable its scopes.
Both skills use the same configured MCP endpoint. Exports contain only the
manifest, these skills, the configured MCP connection, icon and license notices;
playground experiments, credentials, state and recovery ledgers are excluded.

Install/update switch local versioned releases while preserving state, custody
and owner policy outside those releases. Uninstall removes only the marked
installation's release entries, never remote calendars or events. Artifact
lifecycle tests use disposable local prefixes and do not deploy or install a
connection into a real client. Runtime Calendar behavior must be verified
separately from successful packaging.

Calendar packaging verification (2026-10-03): application typecheck, declaration
build and runtime/browser bundling passed; installed-template ZIP test passed
(1 test, 8 assertions); tooling suite passed (10 tests, 134 assertions). A native
0.1.20 artifact and tar archive were assembled in a disposable directory. The
assembled Calendar registration exposed no tools with disabled policy and
independently exposed read, write, scheduling and sharing tools as enabled.
Temporary install/update/uninstall/reinstall preserved dummy owner state,
credential and policy bytes. Release contents included Calendar runtime and
both skills, excluding playground and test modules. No real connection or runtime
was installed. These checks establish packaging, not live provider acceptance.
