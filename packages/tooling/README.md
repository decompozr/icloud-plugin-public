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
