# K0 stock Bun runtime boundary

Current policy note: the accepted 2026-10-05 revision trusts the local macOS user
and uses official Bun. This report retains historical app-only boundary findings;
its earlier policy conclusions are superseded by the [revised plan](../../docs/keychain-migration-plan.md#api-signing-and-caller-boundary-k0).
It neither requires a custom Bun runtime nor proves revised K0 acceptance.

Status: **negative finding reproduced; K0 gate not passed** (2026-10-05).
This is a bounded code-loading experiment, not a Keychain access test or product
implementation. The [dual migration plan](../../docs/keychain-migration-plan.md)
still requires both original-master-key and account-password migrations.

## Expected boundary and observed result

The proposed broker needs a fixed-entry signed application that cannot execute
arbitrary caller-supplied code under its approved identity. Stock `bun build
--compile` does not provide this boundary on the tested Bun 1.4.2.

The runner compiles a synthetic entry point, disables all four configuration
autoload switches, applies an ad-hoc hardened-runtime signature with only
`com.apple.security.cs.allow-jit`, and verifies it strictly. The entry point checks
`BUN_BE_BUN` and `BUN_OPTIONS` before its normal output. Each case starts a fresh
process; external code prints only a nonsecret test label and PID.

| Case | Observed result |
| --- | --- |
| Normal invocation | Embedded entry runs, exit 0. |
| `BUN_BE_BUN=1` plus an external script | External script runs instead of the guarded entry, exit 0. |
| `BUN_OPTIONS=--preload=<external-script>` | External preload runs before the embedded guard exits 64. |
| Strict signature verification before/after | Both pass. |
| Executable bytes and designated requirement before/after | Unchanged. |
| Transient payload cleanup | Task-owned binary, scripts and entitlement file removed. |

[Retained summary](runtime-boundary-evidence.json) records same-agent execution.
An independent source/raw-evidence review confirmed the finding and bounded
claims; it did not rerun the experiment or certify a production security boundary.
Its nonblocking reproduction finding was resolved by rejecting malformed runtime
output and checking preload's exact marker-only output and guard exit 64.
The implementation was corrected to compare the actual designated-requirement
stdout, and the corrected runner reproduced the result. The first run's stderr
comparison alone was not requirement evidence; its script execution result was
consistent with the corrected run.

This does not demonstrate credential extraction: no broker or Keychain operation
was involved. It demonstrates an unmet prerequisite for authorizing stock Bun
based solely on its signed executable identity. The ad-hoc identity does not test
Developer ID distribution or renewal. No signing identity was installed, no
global trust or user configuration changed, and no network/service was invoked
by the runner.

## Consequence for K0

Do not treat a signature, sealed bundled JS, LaunchAgent environment scrubbing,
or an entry-point JS guard as proof that stock Bun is a fixed-entry application.
The same user can directly invoke the runtime with another environment. A
launcher that spawns a directly callable stock executable has the same gap.
Hardened runtime and disabled config autoload did not prevent the two tested
code-loading paths.

The next design gate must choose and prove a native pre-runtime boundary that
removes or rejects generic-CLI and external code loading **before** any JavaScript
can run. Possible directions are a dedicated audited Bun build with those paths
disabled at native startup, or a native fixed-entry host with a compatible embedded
runtime. These are unverified alternatives, not adopted product dependencies.
Building/installing a new runtime, upstream modifications and the release
maintenance commitment require an explicit scope decision. Broker identities,
API/accessibility, real signer renewal, OS lifecycle and authorized custody remain
separate gates. No generic-helper exception or weaker same-UID boundary is adopted.

Dependent K2/K3 activation stays paused; K1 fixture-only contracts can proceed
without asserting a viable native backend. Existing file custody remains active.

## Reproduction and artifact ownership

```sh
bun playground/keychain/run-runtime-boundary.ts
```

The current runner uses existing macOS Bun and `codesign`; installs nothing. The
earlier `run_runtime_boundary.py` remains historical experiment provenance, not
the default runner for new work. Output
identifies an owner-private external temporary directory with `record.json`,
`results.json` and `summary.json`. Unexpected runtime output or a negative control
that no longer reproduces fails the run; it must not be reclassified as secure.
The transient payload is removed in `finally`. Raw nonsecret records remain until
review and knowledge reconciliation; remove only this run's exact owned directory
after those gates. No Keychain items, jobs or credentials need cleanup.

The official [Bun executable documentation](https://bun.sh/docs/bundler/executables#act-as-the-bun-cli)
documents the CLI switch, and its
[runtime-options section](https://bun.sh/docs/bundler/executables#runtime-arguments-via-bun_options)
documents environment-driven runtime flags. Local reproduction, rather than the
documentation alone, establishes the observed boundary failure above.

## Embedded strict option follow-up — 2026-10-05

The Bun-first runner checks baseline and strict-option executables, with the
same disabled configuration loading and hardened ad-hoc/JIT signing. The
[retained follow-up evidence](strict-runtime-boundary-evidence.json) records
same-agent execution on **Bun 1.4.2+744846f84, macOS 27.0.1**:

| Case | Baseline | Embedded `--disallow-code-generation-from-strings=strict` |
| --- | --- | --- |
| Normal entry, indirect `eval("1 + 1")` | Allowed; result 2. | Also allowed; exact flag is present in `process.execArgv`. |
| `BUN_BE_BUN=1`, external entry | External code runs. | External code runs. |
| `BUN_OPTIONS=--preload=<file>` | External code runs before guard exits 64. | External code runs before guard exits 64. |
| Bytes, designated requirement, strict signature validation | Unchanged/passes. | Unchanged/passes. |

Bun's current [string-code restriction documentation](https://bun.sh/docs/runtime/code-generation-from-strings#what-the-flag-does-not-cover)
explicitly excludes file startup/preloads and CLI mode. Its stated strict `eval`
behavior was **not enforced by the installed revision in this reproduction**.
An option appearing in `execArgv` is not proof that its policy is effective.
Do not treat current web documentation as a local-version acceptance result, or
install/upgrade Bun automatically to obtain it. Even the documented policy does
not close the already observed fixed-entry gaps.

The runner asserts these version-specific observations; if they change it fails
and calls for investigation. It never changes `k0_passed` to true. Its first
preparation run rejected the `# designated =>` display prefix before functional
checks; the second rejected the assumption that the strict option enforces eval
denial. Neither is counted as a completed matrix. No credential or Keychain
operation occurred. This is additional code-loading evidence, not a repeat of
the prior Keychain/signing-continuity experiment.

An independent read-only source/raw-evidence review found no confirmed blocker
in the runner or these bounded claims. The reviewer did not rerun the probe.
Standalone TypeScript checking passed using Bun and the existing local compiler;
these checks do not establish product/native migration acceptance.

### Required runtime scope decision

**Historical proposal, superseded by the accepted 2026-10-05 user-level trust
boundary:** a restricted Bun build is no longer required. The observations below
still rule out app-only isolation claims; they do not block standard helper access
by the trusted local user. See the [revised plan](../../docs/keychain-migration-plan.md#api-signing-and-caller-boundary-k0).

**Proposed next scope, not adopted:** investigate a dedicated Bun build with a
native startup boundary that fixes the embedded entry, rejects generic CLI,
preloads/inspector and unsealed code-loading inputs before JS execution. Keep
application code and orchestration in Bun. A bounded first deliverable is a
pinned-source patch/build design and explicit dependency/maintenance inventory;
building a new runtime or installing build dependencies requires the user's
scope decision. No production signer or release transition belongs to that slice.

Acceptance must exercise direct same-user invocations, modified resources,
environment/argv/config injection, worker/addon/FFI loading and authenticated
message-bound IPC on the actual runtime. Scrubbing an external launcher's
environment, using a JS entry guard, or simply embedding more flags is insufficient.
The decision must also name the release owner for maintaining the restricted
runtime across Bun security updates. A compatible native embedded host remains
unverified; do not switch the product to Python or Swift by default. If the
runtime scope is declined, revise the architecture explicitly before dependent
native migration activation. The full dual migration objective remains open.
