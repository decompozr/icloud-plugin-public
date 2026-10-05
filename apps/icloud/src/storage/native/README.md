# Native custody helper release contract

`CustodyHelper.swift` is a thin Security/LocalAuthentication bridge. Official Bun
owns application orchestration and calls the helper through the bounded transport.
The accepted local boundary trusts the macOS user; no custom Bun or app-only caller
authentication is required. Remote owner/account authorization remains mandatory.

The proposed production identifier is `org.decompozr.icloud-plugin.custody`.
Confirm it with the actual release profile before adopting it. A bundle contains:

```text
ICloudCustodyHelper.app/
  Contents/Info.plist
  Contents/MacOS/ICloudCustodyHelper
  Contents/embedded.provisionprofile
  Contents/_CodeSignature/CodeResources
```

Info.plist declares the exact executable/identifier, APPL package type, source
release version and qualified minimum OS. An LSUIElement setting avoids a normal
application UI; it is not evidence that Keychain never prompts. Bun directly
executes the inner helper with fixed installation/group configuration. No Launch
Services registration, daemon installation or arbitrary request paths are needed.

Required real release inputs are the approved signing identity/designated
requirement, profile and exact permitted application identifier/access group.
Do not infer ApplicationIdentifierPrefix from TeamIdentifier: use the validated
profile values. macOS entitlements include `com.apple.application-identifier` and
the approved `keychain-access-groups`. Verify CMS/profile authenticity, validity,
platform and entitlement authorization, then sign the complete bundle and verify
the installed artifact. No profile content supplied by an HTTP request is trusted.
Signer private keys remain release-side; no new identities are installed here.

Fixture packages use a distinct `.fixture` identifier, ICLOUDCustodyFixture marker,
compile-time memory dispatch and ad-hoc signature. They contain no restricted
entitlements/profile and cannot qualify as production release artifacts. A release
build must compile without CUSTODY_FIXTURE and reject fixture markers/identity.
The application currently has no native-helper package/installer selection route.

Ordinary update/renewal/rollback acceptance must observe continued access with the
same approved group and compatible helper, rather than infer it from ad-hoc
validation. Group/identity changes require a custody/recovery decision before
publication. Native access, setup/denial/lock/login behavior and retained reinstall
remain untested. Keep file custody and dependent legacy key until migration and
protected recovery acceptance permit retirement; never add automatic fallback.

For packaging-only evidence run
`bun playground/keychain/run-native-helper.ts --bundle-fixture`. This runs memory
dispatch only; temporary bundle/cache is removed after child completion.
