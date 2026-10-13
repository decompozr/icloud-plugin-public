# Local automatic Photos Reader signing

## Accepted direction and current facts

The owner authorizes CLI builds but rejects GUI signing, repeated personal login
keychain unlock, and Full Disk Access for the generic Bun runtime. The dedicated
Reader remains the selected access boundary. Current macOS signing identity is
visible but the login keychain is locked in the execution context; signing failed.
The workflow below uses a disposable build keychain only. It does not unlock or
modify the personal login keychain, trust settings, TCC or remote services.

## Primary evidence

- [Apple DTS: errSecInternalComponent](https://developer.apple.com/forums/thread/712005)
  distinguishes keychain unlock from private-key ACL approval and explains why SSH
  does not unlock the GUI login keychain. Changing Unix UID alone does not establish
  the same security context. Use an established signing identity and proper context,
  not root or permission bypasses.
- [GitHub macOS signing workflow](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
  imports protected signing assets into a temporary job keychain, unlocks it
  automatically with a separate password, signs, then removes the temporary keychain
  on a self-hosted runner. This is automation of authentication, not bypassing it.
- [fastlane setup_ci](https://docs.fastlane.tools/actions/setup_ci/) also creates a
  temporary signing keychain and uses readonly signing-asset retrieval in CI.
  Adding fastlane is unnecessary for this project; existing CLI tools can implement
  the same pattern.
- [Apple cloud-managed certificates](https://developer.apple.com/help/account/certificates/cloud-managed-certificates/)
  and [TN3161](https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates)
  describe signing assets held by Apple's infrastructure. Cloud signing has its
  own account roles/workflow setup; existing Team visibility does not prove this
  repo is enrolled or authorized for cloud-managed Developer ID signing.

## Future immutable release delivery (proposal)

Provision a build-only signing identity once. Run existing xcodebuild/codesign in
an isolated signing environment, using a per-job keychain and protected signing
assets injected by a designated secret store. Its password is independent of the
Mac login password; never store or request the owner's login password. Restrict
private-key use to trusted signing tooling and trusted release jobs. Do not copy
examples that allow every app or change the personal login keychain's ACL.

Produce immutable signed Reader artifacts from verified main and ship them with
the single local/remote release bundle. Runtime installation, startup, Photos reads
and ordinary upgrades must not require the owner's signing key or local re-signing.
External distribution should evaluate Developer ID Application/notarization; only
an Apple Development identity has been verified on the current host. Protect and
verify Team/bundle identity, resource seals, native dependencies and artifact hashes.

The existing draft seals the selected library path inside the app. A general
pre-signed release must not require editing signed app resources for each user's
library. Moving registration/configuration into a separately validated private
runtime configuration requires a reviewed boundary design before implementation;
this research does not silently weaken the current fixed-library/seal checks.

## One-time prerequisites and outstanding decisions

Automation needs a machine-usable signing identity: a dedicated CI identity,
an explicitly provisioned encrypted identity, or Apple's cloud-managed workflow.
Authorization alone cannot decrypt the currently locked personal private key.
Reusing that exact identity may require one initial export/authentication; a newly
provisioned build identity or cloud workflow can avoid dependence on that keychain.

The credential source, secret-store destination and signer environment (local
isolated builder versus cloud/CI) must be selected before transferring private
signing assets or enrolling a service. No signing asset may be uploaded by inference
from ordinary Git permission. Prefer an existing approved signer/store if available.

First-owner Photos permission for the dedicated app remains a separate OS grant;
CI signing does not confer Full Disk Access. Stable signed release identity is the
intended update boundary, but actual permission continuity still requires live
verification. No claim of unattended signing or deployed Reader acceptance is made.

## Implemented local CLI workflow

`bin/sign-photos-reader` accepts an explicitly provisioned encrypted PKCS#12 identity
and its password in two owner-owned regular files with mode `0600`. Symlinks,
hardlinks, relative paths and oversized files are rejected before keychain creation.
The identity argument is the expected certificate SHA-1 fingerprint, not a secret.
The password file may end in one newline. Never use the Mac login password.

```sh
bun bin/sign-photos-reader \
  --output /absolute/new-private-reader-directory \
  --python /absolute/existing/python \
  --library '/absolute/Photos Library.photoslibrary' \
  --p12-file /absolute/private/build-identity.p12 \
  --password-file /absolute/private/build-identity-password \
  --identity EXPECTED_40_CHARACTER_CERTIFICATE_SHA1
```

The owner creates a private per-job directory and compiles a small native signing
session. Credentials and a random temporary keychain password pass through private
stdin pipes, never command arguments. Native Security APIs suppress interactive
prompts, create/import into only the job keychain, and check the imported fingerprint.
The owner configures only that keychain's signing partition list, then checks that
the exact certificate is a valid trusted code-signing identity before building.
Both Xcode's final app signature and nested dependency signatures explicitly select
that keychain. The app's strict resource-seal verification remains mandatory.

No global search-list replacement is performed. Apple's
[StorageManager implementation](https://github.com/apple-oss-distributions/Security/blob/main/OSX/libsecurity_keychain/lib/StorageManager.cpp)
restricts creation-time search-list registration to login/System keychains; the
private `signing.keychain-db` path does not match either. Tests also check the real
user list while two job sessions are alive and after cleanup. Native cleanup ignores
SIGPIPE and deletes the job keychain when the controller closes its input, including
when its output pipe closes during import. The owner has a bounded cleanup fallback
for a failed native child; cleanup failure is reported and its directory retained.
A forcibly killed controller/helper pair or host power loss cannot guarantee
immediate cleanup; the temporary keychain has a 900-second lock interval. These
are not claims of crash-proof credential erasure.

The existing Python runtime/dependencies are reused. No registry, new runtime,
personal key export, account enrollment, trust override or OS Photos permission
change is performed by this command. No credential contents or raw child signing
diagnostics are emitted by the wrapper.

## Verification and remaining gate

Six local workflow tests pass with a disposable self-signed fixture: private input
validation, untrusted-identity refusal, build-failure cleanup, owner-pipe disconnect,
concurrent session isolation, and wrong-password/fingerprint refusal. These tests
perform actual temporary-keychain creation/import/deletion. Callback/concurrency
cases mock only trusted-identity readback because the fixture deliberately remains
untrusted; they do not prove a trusted Apple signature. Tooling typecheck also passes.

The owner has not yet provisioned a dedicated encrypted signing identity/password.
Production Apple signing, Reader installation, one-time dedicated-app Photos access,
and live MCP Photos acceptance remain unverified. The current deployed app is not
replaced by an unsigned or fixture-signed Reader.
