# K0 stock Bun runtime boundary

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
python3 playground/keychain/run_runtime_boundary.py
```

Requires existing macOS `bun`, `codesign` and Python; installs nothing. Output
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
