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
