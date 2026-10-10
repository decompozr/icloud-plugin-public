# Remaining Studio design adoption

## User stories and acceptance

| Design | User intent and interaction | Feedback and recovery | Acceptance |
| --- | --- | --- | --- |
| Registered module notice | An owner scans Photos before enabling operations and reads its supported-action limits next to the Photos name. | Static warning stays in that module; it does not interrupt or pretend the module is broken. | Module registration provides message/tone; generic renderer; no global Photos notice; English/Traditional Chinese and desktop/mobile wrapping. |
| Account/context selects | An owner selects an existing account or client while maintaining credentials, iCloud Session or inspecting readiness. | Selected value and translated label remain visible; changing an account clears transient secrets and refreshes the existing account-scoped state. Failed requests preserve the form and retry path. | All domain selects consume the pinned Select; existing IDs, value bindings, disabled/required behavior and events survive. |
| Field labels | An owner identifies email, label, password, verification code and destructive-confirmation inputs. | Catalog label activates its linked field; existing recovery descriptions and validation remain. | All domain field labels use pinned FieldLabel or the owning catalog Select/Checkbox; no independently styled labels remain. |
| Permission checkboxes | A client user chooses exact OAuth permissions, or an owner explicitly confirms local session removal. | Choices begin unchecked, toggle independently and submit only selected scopes; denial/cancel retains existing grants. | Pinned Checkbox owns visual, keyboard, focus and touch metrics; no raw domain checkbox; backend checks unchanged. |

The catalog vendor sources remain unchanged. Module notice layout is a shared
project adapter using pinned spacing, semantic color and Icon. Input text fields
retain the existing shared project styling because this pinned catalog has no
adopted text-input component. No new one-off control metrics are introduced.

## Verification and delivery

Source checks, built browser regression, native packaged lifecycle and deployment
results are recorded after execution. Browser mobile emulation is distinct from a
physical iPhone or screen-reader check. No physical-device pass is inferred from
source, assets, desktop Chrome or an unreachable automation surface.

Final source checks pass: 710 unit/archive tests, 13 built HTTP E2E tests, and
zero Svelte errors/warnings. Browser checks pass: settings31, requirements143,
account access23, recovery18, and final bilingual/catalog/layout40. The final
control search finds no native selects, labels or checkbox definitions in domain
Svelte components; rendering comes from the unchanged pinned catalog.

Inspected fixture evidence: [desktop capabilities](assets/design-completion/capabilities-en-1280.png),
[Chinese mobile capabilities](assets/design-completion/capabilities-zh-TW-390.png),
[desktop credentials](assets/design-completion/credential-en-1280.png), and
[Chinese mobile credentials](assets/design-completion/credential-zh-TW-390.png).

## Native deployment and live acceptance

[PR #157](https://github.com/decompozr/icloud-plugin/pull/157) is merged. Version
0.1.112 was built from clean remote-main source
`9cd698ec7e379ac505ebe738bde2f1706ce3060e`. Native archive SHA-256:
`550961c7b524c1d64cfe1a5c799e72629e88da86bb4d26714a7562d0dcc4179c`.
Actual packaged install/restart/OAuth persistence passed 5 tests / 358 assertions.
The existing signed HomeKit component was reused from installed 0.1.111, reverified
before and after staging, and retained unchanged. No synthetic build receipt was
created when the previous task's temporary receipt was unavailable.

The supported service stop/update/start commands deployed 0.1.112 after a stopped
protected backup. Installed payload matches the artifact; protected database rows,
config/custody and service preferences are preserved. All 13 read-only doctor
checks pass and the managed native service is running. Native 0.1.111 and the
protected pre-update backup remain available for rollback.

Authenticated production Chrome was inspected directly at
`https://mac-mini.duckbill-ionian.ts.net:8443/icloud/admin`: runtime displays 0.1.112,
Running and Tailscale Ready; Mail Settings preserves aligned requirements, described
switches and right-aligned icon actions; account entry uses labeled catalog fields
and a catalog select; the Photos warning is visibly inside Photos with its controls
retaining their right-hand position. Dialogs were closed without saving, entering
credentials or modifying policy. Production screenshots contain private account
information and are not published in this repository.

All identified implementation gaps from this design pass are resolved. The 8464
preview remains stopped. Physical iPhone/Safari and native assistive-technology
acceptance remain unavailable in the current Chrome-only automation environment;
mobile fixture results are explicitly emulation evidence, not physical-device proof.
