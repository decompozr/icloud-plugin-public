# Photos module

Optional macOS local Photos provider in the shared Bun runtime. Existing mail
configuration and policy are unchanged. osxphotos 0.77.2 reads synced local
metadata; native PhotoKit performs supported album operations and asset deletion;
Photos scripting applies title, description, keywords and favorite values.
SQLite is never used to mutate the Photos library.

## Setup and permissions

Run `bun src/photos/setup.ts /absolute/private/photos-runtime` from apps/icloud.
This explicitly provisions an isolated uv/Python 3.12 environment and compiles a
Swift helper; no global default changes. Configure the optional `[photos]` block
shown in config.example.toml. The library must be selected explicitly; writes
require the system library, and scripting additionally requires the open library
be that library. Full Disk Access for the host and Photos/Automation permissions
are distinct. Dependency installation never happens in an MCP request.

PhotoKit authorization is an explicit local operator step:
`open -W "/absolute/private/photos-runtime/iCloud Photos Helper.app" --args --authorize`.
If macOS denies this, no native write is attempted. Grant Photos access through
System Settings; do not treat Full Disk Access as PhotoKit authorization.
The helper is packaged as a locally signed Mac app with a usage description and stable bundle identifier. Runtime configuration points to its Contents/MacOS/photos-helper executable.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Read and write tools

Read: health, persons, query, albums, detail, preview, compare_album,
cleanup_candidates and operation. IDs bind a canonical library path and UUID;
album IDs also distinguish ordinary/shared types. Queries normalize case and
whitespace in existing labels, require offset-bearing date bounds and explicitly
return ambiguous labels. Pages describe the current local snapshot; offset
pagination is not a stable server snapshot across concurrent library changes.

Writes: prepare/apply for create_album, rename_album, delete_empty_album,
add_to_album, remove_from_album, set_metadata. Metadata values replace the named
fields; omitted fields are untouched. Keywords replace the entire keyword list.
Separate delete_prepare/delete_apply accept exact asset IDs. All operations
require a durable preview plan, explicit confirmation, matching owner, current
policy and an unexpired unchanged precondition snapshot. Applied or unknown
operation IDs cannot execute again. Native writes read back local state;
this never proves iCloud upload completion. Metadata batches can be partially
applied; the operation remains unknown and includes per-item outcomes.

Scopes are photos.read, photos.write, photos.delete. Delete cannot be invoked
with only ordinary write consent. Changes require explicit configuration and
OAuth consent; old mail grants do not expand. The operation ledger is owned by
Photos within the application database and survives restart. It contains private
asset metadata and must be protected like the rest of application state.

## Shared Albums and cleanup

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Cleanup currently produces fingerprint groups and screenshots for review only.
It does not classify blur/expiry or assume WhatsApp material is disposable.
Fingerprint matches do not establish Live Photo motion equivalence. Deletion uses
Photos' normal delete operation and never empties Recently Deleted. No automatic
delete follows a comparison or cleanup query.

## Verification

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

