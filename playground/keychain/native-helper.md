# Scoped native custody helper source checkpoint

The [helper source](../../apps/icloud/src/storage/native/CustodyHelper.swift) implements
one framed stdin request and stdout response. Trusted launch configuration supplies
the installation UUID and approved access group; request data cannot choose a
service, keychain path or backend. It validates exact field sets, UUID syntax,
safe positive revision/generation, owner bounds, interaction/payload constraints,
header/payload lengths and trailing bytes before dispatch. Reads/deletes prohibit
interaction; adds are create-only. Master values remain exactly 32 bytes.

The source uses the previously compiled data-protection query policy: SecItem,
fixed generic-password namespace, non-synchronizing items, LAContext and
AfterFirstUnlockThisDeviceOnly adds. Known missing/duplicate/authentication/UI
statuses map to bounded errors. Unknown mutation statuses and post-dispatch I/O
failures remain outcome_unknown, never a new add/overwrite. Error frames carry no
secret or raw OS diagnostic. Buffer clearing is best effort; Swift strings,
CoreFoundation and transport copies cannot all be reliably erased.

`bun playground/keychain/run-native-helper.ts` compiles with existing Swift using
warnings-as-errors/macOS13 target, then typechecks the production branch. It only
executes a binary compiled with CUSTODY_FIXTURE: main dispatch selects the memory
function at compile time, never the native function. Twenty-one checks through
the real Bun CustodyHelper adapter exercise bytes, ownership, status mapping,
mutation unknown results and malformed typed/extra/interactivity/identity/payload
requests. Strict standalone TS checking passed. No native Keychain call, live
credential, signer/profile installation or product startup selection occurred.

Native storage, UI suppression, profile/entitlement validity, signing renewal,
ordinary updates and login/lock/reboot contexts remain unqualified. Compilation
is not supported-product-OS acceptance. The application build currently has no
native-helper packaging/selection route; these source files are not an installed
backend. Fixtures do not prove storage durability or application owner/grant
authorization, which belongs to the surrounding journals and authenticated
maintenance/runtime composition. No file-Keychain or account fallback is added.

Next gate: qualify app-like helper packaging, stable release identity and approved
access group/profile, followed by explicitly authorized isolated native acceptance.
Retain the current file custody until revised K0 and actual migration/lifecycle
checks pass. Temporary compile/cache files are removed after child completion.

## App-like fixture bundle

The `--bundle-fixture` mode compiles the same memory helper into an APPL `.app`,
validates Info.plist, signs ad-hoc, verifies strict validity and exact fixture code
identifier, then verifies rejection after a sealed resource changes and acceptance
after restoring its original bytes. All twenty-one adapter checks run from the
inner bundle executable. Five packaging checks pass. No restricted entitlements,
embedded profile, real identity, installer/LaunchAgent or Keychain operation is
used. This is bundle-format/code-integrity evidence, not production group access
or signing continuity. See the [release contract](../../apps/icloud/src/storage/native/README.md).
