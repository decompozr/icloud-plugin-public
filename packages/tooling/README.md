# Build and deployment tooling

Reusable typed implementations and colocated tests live in `src/`. Root `bin/`
commands are thin stable entrypoints. Build prepares artifacts; release packages
existing artifacts; install/update/uninstall require a marked dedicated prefix;
runtime never builds or installs. Tooling source is not included in production
runtime artifacts. Container build runs these tools in its build stage only.
