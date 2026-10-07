# iCloud HomeKit helper

A signed, background Catalyst application backs the existing authenticated iCloud
MCP. The host owns OAuth consent, owner/account/Home binding and capability policy;
the helper owns public HomeKit SDK access and native operation receipts. It has no
public listener and runs only in the broker's private, owned IPC session.

The production product is `HomeKitHelper.app`, protocol v1.0.0. Its bundle identifier
remains `com.decompozr.homekit-probe` solely to preserve existing Apple Home permission
and signing identity. The product and server no longer expose experiment modes.

## Structure

- `LaunchConfiguration` permits enrollment reads or exact enrolled-Home read,
  definition and control modes. Default/invalid startup cannot enable controls.
- `JSONRPCTransport` handles bounded framing and serialized responses;
  `HelperRPC` dispatches supported commands without legacy general-write routes.
- `HomeKitRuntime` owns the Home manager and composes catalog, event, definition
  and control services. Each feature owns its state and SDK callbacks.
- `ControlPolicy`, `OperationJournal` and `ResourceLedger` preserve type/revision,
  ownership/reference and durable once-only boundaries. Unknown/mismatch results
  are retained without automatic replay or rollback.

Mutating modes require an explicit Home and private ledger. Definitions remain
app-owned scenes and supported disabled triggers. Execution/enable controls need
separate host policy and fresh `homekit.control` consent. Opaque shortcut/predicate,
unsupported trigger and array/dictionary write restrictions remain explicit.

## Build and deployment

Use the existing runner:

```sh
python3 apps/homekit-helper/build.py --output /absolute/private/builds --desktop-session --configuration Release
```

It records the complete native code/build-input manifest, source commit, embedded
fingerprint, signing verification and exact task-window cleanup. It does not export
credentials, change keychain ACLs or change the global Xcode selector. Build deployable
artifacts from clean verified remote main through the existing release tooling.

Legacy signed v0.14/v0.15 payloads remain recognized for rollback. New artifacts stage
`apps/homekit-helper/HomeKitHelper.app`. Helper-pin/enrollment reconciliation preserves
the approved owner/account/Home and grants; it never repeats operations or adopts
resources by name. Retain rollback releases and uncertain receipts. Source/build
success is not physical control, natural push or whole-module acceptance.

## Offline policy checks

Run from the repository root:

```sh
python3 apps/homekit-helper/tests/presentation.py
python3 apps/homekit-helper/tests/control-journal.py
python3 apps/homekit-helper/tests/runtime-boundaries.py
```

These compile exact Foundation-only production policies without HomeKit/device
I/O. Explicit signed-helper read acceptance tools live in
[`apps/e2e/native/homekit`](../e2e/native/homekit/README.md), separate from fixtures.
