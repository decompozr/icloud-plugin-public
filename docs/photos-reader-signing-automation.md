# Unattended Photos Reader signing research

## Accepted direction and current facts

The owner authorizes CLI builds but rejects GUI signing, repeated personal login
keychain unlock, and Full Disk Access for the generic Bun runtime. The dedicated
Reader remains the selected access boundary. Current macOS signing identity is
visible but the login keychain is locked in the execution context; signing failed.
This research does not modify credentials, keychains, ACLs or remote services.

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

## Recommended delivery model (proposal, not implemented)

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
