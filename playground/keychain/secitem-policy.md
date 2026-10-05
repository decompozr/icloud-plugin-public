# Modern SecItem query policy experiment

Status: compile/query construction passed; native access and K0 unpassed.

Question: can the existing SDK construct the recommended non-synchronizing
data-protection SecItem queries without deprecated UI controls, with selectors
byte-identical to the official Bun custody contract?

`bun playground/keychain/run-secitem-policy.ts` uses existing `xcrun swiftc` with
warnings-as-errors, a macOS 13 compilation target and an owned temporary module
cache/binary. It executes query construction only. Swift is limited to Apple
Security/LocalAuthentication framework objects; Bun remains orchestration. No
SecItemAdd, SecItemCopyMatching, SecItemDelete or SecKeychain call exists in this
fixture. No credentials, signing/profile installation or new toolchain is used.
The target proves compilation availability, not minimum supported product OS.

Eight cases exercised five owner string encodings (ordinary, slash, quote/backslash,
Unicode/emoji and U+2028) and master read/add/delete. Foundation JSON serialization
with `withoutEscapingSlashes` produced the exact Bun selectors. The first run
compiled but failed comparison because wire kind `password` was incorrectly used
as the stored selector tag; correcting it to the existing `account` tag passed.
Read/delete query contexts have `interactionNotAllowed=true`; administrative setup
allows interaction. Queries use generic-password class, explicit data protection,
non-synchronizing items and an unprovisioned placeholder group. Add constructs
AfterFirstUnlockThisDeviceOnly accessibility, without user-presence flags. Neither
successful storage nor actual absence of UI is proven by dictionary properties.

API rationale: [Apple TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)
recommends SecItem/data-protection in user login contexts. It requires authorized
access-group entitlements and an app-like bundle with a provisioning profile;
this experiment does not meet or test that packaging/signing requirement. Pre-login
daemon operation is outside this candidate. Current SDK SecItem.h marks the old
Allow/Fail UI constants deprecated and states that legacy keychain items can still
activate UI for the old no-authentication attribute. Use
[LAContext.interactionNotAllowed](https://developer.apple.com/documentation/localauthentication/lacontext/interactionnotallowed)
with kSecUseAuthenticationContext for this candidate, not an assumed file-Keychain
equivalence or the deprecated probe APIs.

Candidate remains provisional until native/profile qualification. A file-based
alternative requires its own explicit UI/access/update rationale; do not silently
fallback to it. Required actual checks remain setup cancellation, item access,
noninteractive missing/locked/denied behavior, helper signing/renewal/ordinary
updates and supported lock/login/reboot contexts. No custom Bun fork is required.

Temporary binary/cache is removed after observed compiler/helper termination;
the source, redacted result and failed-then-corrected finding are retained here.
