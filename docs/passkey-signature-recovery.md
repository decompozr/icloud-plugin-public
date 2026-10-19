# Passkey signature verification repair

## Intent and scope

On 2026-10-19 the owner authorized repairing and deploying Passkey verification,
preserving existing Passkeys, Apple credentials, accounts and OAuth connections.
No reset, credential replacement, authentication bypass or weaker verification is
authorized or necessary. Use synthetic credentials in a disposable database.

## Observed gap and plan

Installed 0.1.113 responds at the private admin URL but rejects owner login with
`Cannot get schema for 'ECDSASigValue' target`. Sanitized server timestamps include
12:41:51, 12:42:08 and 12:46:46 UTC. The stack reaches SimpleWebAuthn's EC signature
unwrap and authentication response verification. This does not establish an Apple
authentication failure or the cause of the separate client OAuth refresh error.

The installed standalone dependency graph includes ASN.1 schema 2.8.0 at its root
and 2.10.0 for ECC decorators. Confirm the resulting registry mismatch using the
existing real Passkey enrollment/authentication fixture against installed output,
then constrain the standalone graph and verify valid signatures, invalid user
verification and replay rejection. Verify the packaged output rather than relying
only on workspace dependencies. Deploy a committed, reviewed source revision via
the supported updater, preserve rollback, and verify version and service health.
Actual owner browser login remains a separate acceptance step.

## Delivered repair and verification

Pin the parser, ECC and X.509 packages together at 2.11.0 in the application and
account package. Pinning the parser alone is insufficient: fresh standalone
resolution can select newer ECC decorators and recreate the separate registry.
Mail's separately exact-pinned 2.8.0 dependencies remain isolated; no global
override forces them onto another version. Application 0.1.115/account 0.2.1 add no
state migration, reset or change to authentication requirements.

Artifact assembly now verifies a generated ES256 signature through the actual
standalone SimpleWebAuthn dependency graph and rejects altered signed data.
Assembly fails before packaging if that check fails. The existing complete owner
authentication fixture can target a standalone release rather than workspace
modules.

- Installed 0.1.113: synthetic local owner authentication reproduces the exact
  missing ECDSASigValue schema error. The isolated signature gate also fails.
- Corrected standalone candidate: all 3 owner authentication fixtures pass,
  207 assertions, including enrollment, sign-in, user verification/origin checks,
  replay rejection, OAuth refresh/revocation and existing-owner isolation.
- Authentication and Mail regression: 141 tests, 617 assertions pass.
- Release/update and independent package consumer checks: 7 tests, 55 assertions
  pass. Full application build and tooling typecheck pass.

Candidate testing used generated keys and disposable databases. No production
credential, Passkey or OAuth state was inspected or changed. Deployment and actual
owner browser verification are pending at this source checkpoint.
