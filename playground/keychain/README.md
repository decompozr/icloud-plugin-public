# macOS Keychain custody experiment

Status: **closed as a feasibility experiment**. The durable findings and
production gates are reconciled into [engineering knowledge](../../docs/knowledge.md#macos-keychain-custody-and-update-identity-2026-10-05).
[Bounded evidence](evidence.json) preserves acceptance results without temporary
paths or signing secrets. These recipes are retained for deliberate reproduction;
they are not scheduled or automatically run during setup/build/runtime.

This is an isolated experiment, not a production credential backend, migration,
installer or uninstaller. It tests whether automated provisioning, unattended
reads and deletion are feasible with the current Bun/native service topology.
The user accepts setup-time authorization but rejects recurring runtime prompts.

## Scope and reproduction

Run on a logged-in Mac with existing `swiftc`, `codesign`, `bun` and `launchctl`:

```sh
python3 playground/keychain/run.py
```

The runner compiles and ad-hoc signs two Swift binaries in an owner-only external
temporary directory. It creates one randomly generated 32-byte value in the
default file-based Keychain under a UUID-namespaced
`local.icloud-plugin.experiment.*` service. It outputs only byte counts and a
digest of this synthetic value, never plaintext or production credentials.
Only creation permits Keychain UI. Every read disables interaction and must
succeed unattended or return an error. A one-shot, uniquely labeled LaunchAgent
uses the same binary; no KeepAlive or repeated authorization attempts are used.

The runner reconciles its job registration and deletes its exact Keychain item
in `finally`, verifies the item is absent, and verifies the job is unloaded.
It retains raw results, binaries and a task record at the printed temporary path;
these contain no exported Keychain value. Inspect an interrupted record before
rerunning or cleaning it up. Cleanup failure is an error, not a passing result.

No iCloud service calls, production key/database reads, installation changes,
Keychain locking, logout/reboot, signing-identity installation, trust changes or
Tailscale changes are performed. The runner does not configure broad access for
all applications. The ordinary installation owner/state is untouched.

## Observed results — 2026-10-05

Self-checking on macOS 27.0.1 (26A434), Apple Silicon, Swift 6.4, with the default
Keychain already unlocked. An initial manual sequence and the reproducible
runner produced matching results. No setup prompt was observed in these runs;
the probe created its own item with the default access policy. This does not test
the separate “Always Allow” ceremony for a pre-existing item.

| Case | Observation |
| --- | --- |
| Automatically create a synthetic item | Success (`0`). |
| Read in fresh processes repeatedly, with UI prohibited | Success; all 32-byte digests match. |
| Attempt duplicate creation | `errSecDuplicateItem` (`-25299`); existing value preserved. |
| Copy unchanged binary to another release path | Unattended read succeeds. |
| Recompile v2, ad-hoc signed with the same identifier | Unattended read fails with `errSecAuthFailed` (`-25293`). |
| Replace binary at its original path with v2 | Same rejection; retaining the path is insufficient. |
| Restore original v1 | Unattended read succeeds; item remains intact. |
| Invoke original helper as a Bun child | Unattended read succeeds. |
| Invoke original helper from a transient LaunchAgent | Unattended read succeeds in the existing GUI session. |
| Delete exact item automatically | Success. |
| Read/delete after removal | `errSecItemNotFound` (`-25300`). |
| Unload and inspect transient job | Confirmed absent. |

The v1/v2 designated requirements are different code-directory hashes, despite
the identical identifier. This is consistent with Apple's description of
[ad-hoc signatures and code-directory requirements](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html).
The negative tests suppress UI, so they establish rejection without interaction;
they do not demonstrate an actual recurring prompt or prove what accepting one
would do.

## Decisions and unresolved production gates

- Automatic setup and repeated unattended reading are feasible in this tested
  session. Automatic Keychain-item deletion is also feasible. Full application
  setup/uninstall and real credential migration are not implemented or validated.
- A stable path or identifier alone does not preserve ad-hoc binary trust across
  rebuilds. Ordinary application updates may retain an identical helper, but a
  helper update still requires a deliberate trust transition. Stable certificate
  signing was initially a candidate; the isolated certificate experiment below
  now verifies an exact certificate-pinned requirement across three builds. No
  usable production code-signing identity was found in the preceding read-only
  inspection. Do not silently widen
  an ACL or accept an identifier-only trust rule to hide prompts.
- Keychain trusts the helper, not its Bun caller. The copied-helper and Bun-child
  results show why a general-purpose helper returning secrets cannot be presented
  as isolation from other processes running as the same user. Production design
  must define an authenticated caller boundary or explicitly accept this limit.
- The file-based APIs used to suppress UI and inspect lock status emit deprecation
  warnings. This probe is not a recommendation to ship them unchanged. Select the
  production Keychain implementation, caller identity and signing model using
  [Apple's macOS Keychain guidance](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains).
- Lock/unlock, logout/login, reboot, no-login operation, Developer ID-signed
  upgrades, denied first authorization and recovery from Keychain loss remain
  untested. No unattended/reboot guarantee is claimed. Runtime must fail with a
  clear status instead of repeatedly invoking interactive Keychain reads.
- Moving Apple credentials alone does not remove the current master-key file:
  other authenticated/encrypted state still depends on it. Moving that key must
  preserve its exact bytes and installation identity, validate state before
  cutover and avoid silent file fallback after Keychain becomes authoritative.
- Ordinary uninstall currently retains state/custody. Removing a Keychain master
  key while retaining dependent ciphertext can make reinstalls unrecoverable.
  Preserve-state uninstall versus complete removal remains a user decision.

## Certificate-pinned multi-version experiment — 2026-10-05

```sh
python3 playground/keychain/run_signed.py
```

This second runner uses existing OpenSSL and an isolated, owner-only temporary
file-based Keychain. `Sandbox.swift` creates it with a synthetic password supplied
through stdin. If creation adds it to the user search list, the sandbox removes
only its own entry. Search-list and default-keychain snapshots match before and
after setup and after cleanup. No system/login identity or global certificate
trust is installed. The probes explicitly select this temporary keychain.

The runner creates two one-day self-signed code-signing certificates. Private-key
access is granted to `/usr/bin/codesign`; the partition-list adjustment is scoped
to signing keys in this exact disposable keychain, not the login keychain or the
synthetic generic-password item. Fixed passwords appearing in CLI arguments are
solely disposable test passwords, never real user credentials. Temporary private
keys and PKCS12 files are deleted in `finally`, along with the isolated Keychain.

Three distinct Swift binaries are signed with signer A and the same explicit
designated requirement:

```text
identifier "local.icloud-plugin.experiment.probe" and certificate root = H"<signer-A fingerprint>"
```

The requirement authenticates both the identifier and the signing certificate;
it is not an identifier-only rule. Strict code-signature verification passes for
each binary; their SHA-256 hashes differ while their designated requirements
match. v1 creates one synthetic 32-byte item. Every subsequent read disables UI.

| Case | Self-checked result |
| --- | --- |
| v1, v2 and v3 in distinct paths; three fresh reads each | All succeed, identical value digest. |
| Replace the same installed-helper path with v1, then v2, then v3 | All succeed without interaction. |
| Return to v1 after v3 | Succeeds. |
| Different signer, same identifier | Rejected (`-25293`). |
| Same signer, different identifier | Rejected (`-25293`). |
| Ad-hoc signature, same identifier | Rejected (`-25293`). |
| v3 read after all negative controls | Succeeds, original value intact. |
| v3 through Bun and a transient LaunchAgent | Both succeed without interaction. |
| Delete item and inspect absence | Success, then `-25300`. |
| Remove job, private signing material and isolated Keychain | Verified; search list/default remain unchanged. |

The final signed runner reports `passed: true`, `cleanup_verified: true`. The
original ad-hoc runner also passes after adding the explicit-keychain parameter
to the shared probe. Early preparation attempts failed before functional tests
(certificate CN length, empty-password PKCS12 compatibility, requirements syntax
and canonical requirement formatting); their isolated keychains/private material
were cleaned, and those attempts are not counted as successful upgrade evidence.

This establishes that a stable, certificate-authenticated code requirement can
retain Keychain access across changed binaries in this unlocked file-based
Keychain session. It does not prove persistence across logout/reboot, actual
“Always Allow” approval, real application releases or Developer ID distribution.
The earlier helper-caller boundary limitation remains: trusting this executable
does not authenticate arbitrary programs that invoke it.

The certificate was pinned exactly. Certificate replacement/renewal under another
fingerprint is not covered by this passing result. A production Developer ID
requirement and renewal/rotation strategy need their own tests. Keep production
signing keys in the release/build custody boundary, never distribute them with
the runtime; otherwise a local process could sign its own trusted replacement.
[Apple's signing guidance](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html)
permits self-signed identities for testing and distinguishes them from identities
for public distribution. The disposable identities here are not a proposed
production signer.

## Evidence and recovery

Each runner directory contains `record.json`, `results.json`, compilation/signing
output and the LaunchAgent's nonsecret output. The record identifies the exact
service/job and status. Successful completion requires `passed: true` and
`cleanup_verified: true`. Synthetic Keychain items and jobs from completed runs
are removed; the signed experiment's isolated keychain and private signing files
are also removed. The durable evidence and knowledge above remove any recovery
dependency on raw temporary artifacts. Task closure handles their disposal after
publication gates; no production acceptance or full application tests are claimed.
