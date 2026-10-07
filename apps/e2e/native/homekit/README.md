# Explicit native HomeKit read acceptance

These scripts were moved from the former playground without adding them to the
ordinary fixture test runner. Run from the repository root with an explicitly
approved signed-build receipt, Home inventory and private output directory:

- `python3 apps/e2e/native/homekit/background-check.py RECEIPT PRIVATE_OUTPUT_ROOT`
- `bun apps/e2e/native/homekit/main-mcp-read-check.ts RECEIPT INVENTORY PRIVATE_OUTPUT_ROOT`
- `bun apps/e2e/native/homekit/production-control-read-check.ts RECEIPT INVENTORY PRIVATE_OUTPUT_ROOT`

They launch the selected native helper and read real Home data. The MCP script
uses a disposable synthetic account, grant/token verification and loopback HTTP;
it does not test the user's existing main MCP connection. Control read acceptance
previews a same-value operation and tests denial; it never calls control apply.
No physical control, definition mutation or household automation is authorized by
moving these scripts. Each script owns and stops its native sessions. Outputs can
contain private inventory and must stay outside Git. Revalidate against the exact
signed helper before claiming current native acceptance.

Offline production policy checks are under `apps/homekit-helper/tests/`; they
compile Foundation-only Swift without launching HomeKit or requesting permission.
