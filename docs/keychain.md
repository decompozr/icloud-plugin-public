# Keychain migration: retained knowledge and restart plan

Status: **paused by the product owner; no real credential migration or native
runtime activation occurred.** Consolidated 2026-10-05. This is the single retained
reference for the investigation. Experimental programs, dormant migration code,
fixture workers and duplicated plans were removed from the working tree after
their findings were reconciled here. They remain recoverable from Git history.

## Product decision and value

The proposed outcome moves both every iCloud account's Apple app-specific password
and the **exact original 32-byte installation master key** to macOS Keychain.
Moving passwords alone does not remove the master key or its responsibilities.

Official Bun is the default. Language priority is Bun, then Python, then Swift
when necessary; a thin Apple-framework bridge is acceptable. No custom Bun fork
or app-only isolation from arbitrary same-user programs is required. The local
trust boundary is the macOS user. Remote owner/account authorization, OAuth scope
isolation and operation authorization remain mandatory.

Keychain's useful gain is OS-managed encrypted custody of the root key and reduced
accidental exposure through settings/files/backups. It is not a solution to a
compromised authorized runtime or malicious programs inside the accepted local
trust boundary. The owner paused further investment to reconsider value versus
migration, update and recovery maintenance cost. Resume by deciding this product
tradeoff, not by adding more inactive infrastructure.

The owner has an Apple Developer account. Downloading users do **not** need one.
Developer ID signing/notarization and any required profile are publisher-side
distribution inputs; App Store submission is not required. Actual release
certificate/profile configuration was not qualified. Earlier descriptions that
implied every user needed a developer account were incorrect.

Setup-time macOS approval/Always Allow is acceptable when needed; recurring runtime
or ordinary-update prompts are not. Pre-macOS-login availability is not promised.
Default uninstall retains state; changing full removal to the default was not
decided. No production signer installation, live credential access, deployment or
release occurred. Later source/protocol experiments made no Keychain calls.

## Evidence: what actually passed

Results below are historical, version/context-specific observations, not current
product acceptance. Counts are per run, not additive unique coverage.

| Investigation | Observed result | Boundary and verification |
| --- | --- | --- |
| Original file-Keychain experiment, PR #29 | Create/read/delete synthetic 32-byte values; repeated reads, identical copied executable, Bun child and user LaunchAgent work without UI. Duplicate add returns -25299; removed item returns -25300. | macOS 27.0.1 build 26A434, arm64, Swift 6.4, unlocked file-based Keychain in a logged-in GUI user context. Same-agent self-check, not independent execution. |
| Default ad-hoc signature | Same bytes at another path can read; changed binary with same identifier or replacement at the same path is denied (-25293); restoring original bytes works. | Default designated requirement includes build identity. Filename/identifier alone does not prove update continuity. |
| Disposable certificate-pinned signing | Three different builds with the same certificate+identifier requirement read identical bytes; same-path replacement, rollback, Bun child and LaunchAgent pass. Other signer, other identifier and ad-hoc controls are denied. | One-day self-signed synthetic identity; exact certificate pin. No Developer ID, renewal, actual Always Allow, locked/logout/reboot/pre-login or real release acceptance. |
| Original cleanup | Synthetic items, jobs, isolated keychains and private signing material removed; default keychain/search list unchanged. | Checked by the original experiment. No production store was migrated or deleted. |
| Stock Bun boundary | Bun 1.4.2+744846f84 compiled, hardened/ad-hoc/JIT binary executes external code through BUN_BE_BUN and preload through BUN_OPTIONS without changed bytes/signature/requirement. | Negative app-only identity result, not credential extraction. The JS entry guard runs too late. Not a blocker under the accepted local-user boundary. |
| Embedded strict option | Same revision advertises strict string-code restriction in execArgv, but tested indirect eval still succeeds; external entry/preload still run. | Local observed behavior outranks accepted flags/current web docs. Source/evidence independently reviewed; no custom runtime adopted. |
| Unix peer audit token | Approved/copied program accepted; unapproved controls denied. Shared-FD interleaving authenticates a later approved writer for an earlier unapproved message. | Peer-token lookup is not message-origin authentication. Synthetic IPC, zero Keychain calls. XPC/mutual caller authentication never qualified and is no longer required. |
| Scoped helper protocol | 13 requests preserve raw master/password bytes, fixed selectors, response UUID binding, create-only conflict, missing-without-fallback, exact deletion and noninteractive read policy; malformed/array fields rejected; parent environment sentinel excluded. | Official Bun parent/child with ephemeral memory store, not native storage. Strict TS and independent rerun passed. |
| Bounded Bun adapter | Streaming stdout/stderr caps, strict reply identity/frame/length, deadline/cancellation and terminal direct-child cleanup; applied-but-lost mutation reply becomes outcome_unknown without retry. | Six subprocess tests/26 assertions; combined authority/coordinator suite 79/612. Typecheck/build and independent review passed. Blob/Bun copies and descendant lifecycle are not fully erased/proven. |
| Modern query construction | Eight Swift/Bun cases match selectors, including slash, quote/backslash, Unicode/emoji and U+2028; data-protection/no-sync flags and LAContext policy set. | Warnings-as-errors, macOS13 compilation target; no SecItem calls. Initial password versus account namespace tag mismatch caught and fixed. Compilation target is not supported-product-OS acceptance. |
| Native dispatch source | 21 checks through actual Bun adapter/native fixture cover bytes, ownership, strict identities/types/extra fields, status mapping and unknown mutations. Production branch typechecks. | Compile-time memory path only; no native Keychain calls. Independent source/evidence review and strict TS, not independent Swift execution. |
| App-like bundle | Five checks: plist, strict ad-hoc validity, exact fixture identifier, sealed-resource tamper rejection and restoration; same 21 memory checks from inner executable. | No embedded profile, restricted entitlement or production signer. Not access-group, publisher trust or ordinary-update acceptance. |

The original signing experiment's preparation failures (certificate CN length,
PKCS12 compatibility and requirement formatting) were corrected and excluded from
passing functional results. Later fixture Buffer/Blob/spawn typing problems were
corrected before successful strict checks. No secret value or secret digest is
needed in this document.

## Backend evaluation and distribution

macOS file-based and data-protection Keychains have different access models.
Keychain is item-controlled, not automatically readable by every process just
because the user logged in. An authorized helper may return owned secret bytes to
the trusted local user; this does not authenticate its arbitrary callers.

| Candidate | Useful evidence / requirements | Remaining decision |
| --- | --- | --- |
| File-based/login Keychain | Original native CRUD and signed changed-build experiment passed in an unlocked synthetic keychain. No data-protection provisioning profile requirement. | Select an exact keychain, not the whole default search list. Runtime UI suppression in the original probe uses deprecated SecKeychain APIs; isolate/review any compatibility exception rather than shipping the probe unchanged. Qualify real trust/update/lock behavior. |
| Data-protection Keychain | Modern SecItem + LAContext query source compiles; explicit no-sync and AfterFirstUnlockThisDeviceOnly candidate. | Requires user login context and authorized access-group entitlements/profile in an app-like bundle. No actual profile/access/UI/update behavior qualified. No fallback to file-based storage. |
| Apple security CLI | Local help documents hexadecimal add (-X), create-only default and optional explicit keychain. Apple source shows command parsing and password output handling. | Read-only evaluation only. -i/-q refer to CLI interaction/verbosity; absence of a documented Keychain UI-suppression contract and exact binary-output semantics need qualification. Never put secrets in argv or use broad -A/-U shortcuts. Not adopted. |

Neither candidate is the current product backend. The file-based alternative was
approved for evaluation, not deployment. Evaluation did not read/write the login
Keychain. The modern helper's proposed production ID was
org.decompozr.icloud-plugin.custody; it was not adopted as a live release identity.

For data protection, validate actual application identifier/access-group values
from a trusted profile; do not infer ApplicationIdentifierPrefix from TeamIdentifier.
Prepare the complete app-like bundle before signing. Fixture IDs/markers and
compile-time memory binaries must be rejected by a future release pipeline.
Private signing keys stay release-side, never installed as plugin runtime assets.
Public distribution/Gatekeeper/notarization, item ACL/access-group policy and
signer renewal are separate acceptance questions.

## Exact key and cryptographic inventory

Custody changes must preserve installation UUID, owner, account UUIDs, labels,
legacy-account mapping, revisions, routing, grants, Passkeys, issuer/resource/RP
contexts and still-valid provider sessions. No key rotation or owner reenrollment.

| Consumer | Preserve |
| --- | --- |
| Owner store and installation marker | Exact master bytes, marker HMAC, pending/enrolled state, legacy-v1 and account-v2 ciphertext contexts and complete registry. |
| Photos web session | Saved AAD binds owner/account/realm/accountRevision/generation. Custody-only change keeps valid sessions; rotation/revocation invalidates them. Separate Apple web login/2FA, not app-specific password. |
| Owner/local auth | owner-auth-v1 and local-owner-auth-v1 derivations, existing origin/session/Passkey/OAuth behavior. |
| Internal resource client | icloud-resource-client-v1 encryption; issuer/resource-specific verifier record. Decryption failure must not silently register a replacement client. |
| Mail outbound ledger | outbound-ledger-v1, owner/account namespace, operation/message IDs, pending/finalized/unknown receipts. Unknown send never becomes a new send. |
| Calendar ledger | calendar-ledger-v1, policy-owner versus owner/account operation/sync namespaces, hashed row keys and existing AAD. Preserve disabled policy and unknown operations. |
| Readiness/account consumers | Backend authority plus custody epoch, independently of semantic revision; no late read or probe can revive stale evidence. Account A failure never selects B. |
| Installation/lifecycle | Stable private custody directory, config/marker/database paths, ordinary-update compatibility and retained-state reinstall. Container/Linux remains explicit file mode. |

The experimental validators covered populated marker, legacy/v2 account,
stored-AAD Photos session, auth client and Mail/Calendar encrypted rows. Opening
application factories is unsafe for validation because they may migrate/repair,
register clients or normalize dispatched operations. Use existing handles without
DDL/re-enrollment. Ordinary SQLite hot-journal recovery may require readwrite
create:false handles; hold real stopped exclusion before opening them.

## Transaction and recovery design to preserve

SQLite and Keychain do not share a transaction. Persist intent before external
operations; use exact identity/value readback and CAS before authority changes.
HMAC metadata uses the original key. Full durability includes file+directory
fsync and SQLite FULL/EXTRA settings. No PID-liveness-based stealing of old leases.
Persistent journal modes must also be enforced: DELETE/TRUNCATE/PERSIST/WAL;
MEMORY/OFF are rejected. FULL alone did not establish crash durability in the
earlier guard, and that gap was reproduced and corrected.
Cooperative leases do not prove older/custom/noncooperating writers stopped.

Master authority must be discoverable before HMAC-dependent owner/auth DB startup.
Manifest/config installation binding must be verified once the exact key is read.
The proposed master sequence is:

1. file_authoritative: capture a consistent stopped protected recovery snapshot.
2. copy_intent: persist operation/target and add the original bytes create-only.
3. keychain_verified: fresh noninteractive equality read plus all-consumer validation.
4. keychain_authoritative: durable authority commit; Keychain becomes the sole source.
5. file_cleanup_pending -> complete: retire only the exact legacy file after restart
   and protected restore/rollback acceptance.

Missing/conflicting/locked/denied keys never generate a new key, repair auth DBs,
reopen enrollment or use stale file fallback. Lost applied results require readback,
not blind overwrite/retry. Verified-item loss must not recreate it silently.

Account copy retains SQLite authority until verified. One SQLite transaction then
commits the exact native pointer and clears ciphertext, preserving semantic
revision/session generations for custody-only movement. A separate custody epoch
invalidates readiness. Tombstones deny reads before exact item deletion; orphan/
staging cleanup stays pending until explicit absence readback.

Addition reserves a stable UUID but publishes no usable credential until verified
commit. Reconnect requires explicit revoked-account UUID/epoch CAS and retains its
label. Rotation stages a new immutable generation, then atomically changes pointer,
revision and session invalidation, retaining old-item cleanup dependencies. Provider
validation checks owner/lease/epoch before and after waits. Native post-await guards
must include owner binding, not only a lease; an initial outer-only guard bug was
reproduced and fixed in both addition and rotation verify/commit stages.

Resumption resupplies exact transient HMAC-bound password bytes; journals never
store plaintext recovery input. Generation high-water marks prevent reuse after
cancellation. Format-1/2/3 experiments modeled copy, rotation and addition; old
readers reject unsupported formats. Format-2 master baseline establishment intent
prevents recapturing a lost established baseline. Counts/presence prevent omission,
but do not prove whole-state rollback resistance or detect same-count changes.
Protected external freshness/recovery acceptance remains necessary.

Preserve observed/unknown provider mutation results after dispatch, even if a
credential is revoked meanwhile. Stop later dispatches; reject late reads, sync
commits and readiness results. Mail receipt finalization uses the already-admitted
account namespace. Token issuance versus concurrent custody mutation atomicity
was not proven. Buffered strings/CF/transport copies cannot all be securely wiped.

Implementation lessons: materialize Bun cached SQLite queries with .all() when
validation may interrupt iteration; do not assume a reusable iterator is fresh.
Validate stored AAD rather than rebuilding expected session context. Strict UTF-8,
including BOM preservation, prevents silent password normalization; unsupported
opaque legacy envelopes require remediation. Metadata credentialStored must follow
authenticated authority rather than the presence of legacy ciphertext.

## Setup, updates and removal acceptance

- Setup may authorize once, with cancellation leaving resumable state. Runtime
  reads never authorize, unlock with stored passwords, create items or display UI.
- Qualify changed releases, same-path replacement, rollback, signer renewal and
  a user LaunchAgent. Old incompatible installers/releases cannot select active
  native formats. Build/setup/runtime/release remain separate.
- Test plugin-owner-not-logged-in separately from macOS lock/unlock, logout/login,
  sleep/wake, reboot-after-login and pre-login. Unavailable returns bounded state.
- Test lost writes/results, duplicate/conflicting values, stale CAS, disk-full,
  SQLite/WAL/hot-journal errors, symlinks/replaced private paths and interrupted
  cleanup. Historical inode/nofollow checks do not seal hostile same-user paths.
- Qualify protected recovery before retiring the original key file. Restore key,
  DBs, marker, config and journal as a consistent set; reconcile later revocations,
  grants and unknown operation receipts. A symlink-only rollback is insufficient.
- Do not assume a copied Keychain file is a portable backup; current Apple guidance
  describes protected-entropy dependencies. Never disable SIP or depend on private
  Keychain internals for product recovery.
- Default uninstall retains installation identity, both custody stores, DBs, marker,
  config and dependent state. Opt-in full removal previews exact owned selectors,
  journals interrupted removal and verifies absence while the remover still exists.
  Never delete a master while retained ciphertext needs it; no whole-Keychain sweep.
- Local removal is not Apple password revocation or secure erasure of backups/WAL.

## Restart only if the value justifies the remaining work

| Phase | Required outcome | Historical state at pause |
| --- | --- | --- |
| K0 | Choose/qualify backend, access/UI policy, distribution/update trust and OS lifecycle. | **Not passed.** File-Keychain synthetic feasibility; modern source/query/bundle fixtures only. |
| K1 | Explicit authority, journals/CAS, exclusion, compatibility and operational recovery. | Partial synthetic implementation; removed from checkout. Never a completed product gate. |
| K2 | Original master migration, every consumer, restart and protected recovery. | Synthetic coordinators/validators only; no real key moved. |
| K3 | Every account copy/add/rotate/revoke, exact cleanup and routing/session/readiness. | Synthetic journals/readers/optional Mail/Calendar/Admin/OAuth integration; never selected. |
| K4 | Setup, ordinary updates, rollback/reinstall and both removal modes. | No complete installed/lifecycle acceptance. |

Start with the smallest backend/signing/UI experiment that resolves a real unknown.
Reuse these results. Follow **experiment -> knowledge -> revised plan -> implement**.
Agree on value, supported user contexts and a stopping condition first. Do not
repeat the closed basic experiment, require end-user developer accounts, revive
app-only isolation by default or use fixture counts as evidence of rollout progress.
Any future real Keychain writes, signer provisioning, installation or release need
their applicable authorization. Retaining these notes does not resume migration.

## Recovery references and authoritative Apple sources

- [Original PR #29](https://github.com/decompozr/icloud-plugin/pull/29): closed file-Keychain investigation.
- [Full pre-cleanup source/evidence snapshot](https://github.com/decompozr/icloud-plugin/tree/f1352a3b6952fe97920a73a61c2dfea144af3bd3): all experimental source, JSON results and long draft plan. Recover selected files from this commit if revisiting; do not restore the whole dormant subsystem by default.
- [Official Bun helper/source snapshot](https://github.com/decompozr/icloud-plugin/tree/168060cc19a70836b368de588550ec82e2fe2645): native source and memory-dispatch recipe; not an accepted native release.
- [TN3137: macOS Keychain implementations](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains): API differences, login/profile constraints and backup limitations.
- [TN3125: provisioning profiles](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles): publisher-side profile/entitlement authorization.
- [Developer ID distribution](https://help.apple.com/xcode/mac/current/en.lproj/dev31de635e5.html): public distribution outside the App Store.
- [Keychain authorization choices](https://support.apple.com/en-ie/guide/keychain-access/kyca1243/mac).
- [Code requirement language](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html).
- [Bun standalone CLI behavior](https://bun.sh/docs/bundler/executables#act-as-the-bun-cli): local-version tests remain the authority for observed behavior.

Cleanup preserves the historical source commits through the merge history, removes
working-tree migration/experiment code and centralizes its knowledge here. Installed
runtime, real credentials, native Keychain items and conversation history are not
modified by repository cleanup. Other task worktrees are outside this cleanup scope.
