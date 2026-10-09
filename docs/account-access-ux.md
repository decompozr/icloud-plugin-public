# Account access UI

Owner: Account module with shared catalog visuals. Date: 2026-10-09. Authorized endpoint: source plus existing private 8464 fixture preview. Native installation/publication N/A.

## Stories and flow

1. As an owner identifying an account's access methods, I see separate App Password and iCloud Session rows. A key and globe distinguish credential types, full titles label them, and purpose text identifies Mail/Calendar versus experimental Shared Album web access. Independent status tags reflect observed state; an unknown session is never shown as signed in.
2. As an owner updating credentials, I use the right-side quiet pencil/add button in App Password. The existing scoped update form retains secret clearing, validation and persistent error feedback. Its warning explains that rotating an app password invalidates the stored iCloud Session through the current account-revision contract.
3. As an owner removing stored access, I use the App Password trash button and review the existing confirmation dialog. The dialog explicitly states that the stored iCloud Session is also cleared. This removes local credentials, not the account identity, mailbox contents, Apple's password or OAuth grants.
4. As an owner connecting iCloud, I use its row's sign-in/manage icon, complete the existing account-specific password/2FA flow and observe session status after readback. Authentication is not proof of successful Shared Album operations.
5. As an owner disconnecting only iCloud Session, I use its unplug icon, review the exact account, explicitly confirm and submit the existing scoped session-revoke endpoint. App Password remains stored. Cancel sends no mutation; failures leave a persistent explanation and the dialog open.

## Design and boundaries

Replace the Manage account menu with direct icon-only, borderless catalog ActionButtons. Shared layout places actions at the top right of each access row; mobile descriptions use the full row width beneath the title/actions, without shrinking touch targets. Status controls and warning/critical colors remain pinned. Key geometry is an unmodified Lucide asset from the same pinned revision with ISC attribution.

UI and credential/session orchestration stay under modules/account/ui. No production backend authorization or custody contract changes. Source evidence: owner-store mutate clears provider sessions when account secrets rotate/revoke; provider-session-custody tests cover this. Session disconnect uses /icloud/admin/photos/cloud/revoke with accountId and confirm:true after explicit consent.

## Acceptance

Build/type-check; meaningful fixture checks for distinct rows, direct actions and account selection, status phases, credential update/removal confirmation, session sign-in/2FA, session-disconnect cancel/confirmation/failure/success and app-password preservation; desktop/mobile/Traditional Chinese wrapping and icon targets. Update relevant existing browser flows. Capture and inspect source-preview evidence; real provider and physical-device acceptance remain separate.

Status: implemented, self-checked and verified in the existing private fixture preview.

## Evidence

Full source build/type checks passed with zero UI errors/warnings. Studio tests: 28 passed. Provider-session custody tests: 5 passed. Account access browser flow: 23 checks passed; requirements: 143; recovery: 18; task-entry/multi-account: 34. Account checks cover pending verification versus authenticated status, exact account selection, explicit disconnect consent, cancel/no request, failure recovery, successful session readback and App Password preservation, critical quiet icons, 44px touch targets and Traditional Chinese wrapping. Fixture session phases now follow account revision invalidation rather than pretending a rotated credential retains its old session.

Inspected [desktop](assets/account-access/account-desktop.png), [mobile](assets/account-access/account-mobile.png), and [Traditional Chinese](assets/account-access/account-chinese.png). Browser readback over existing private HTTPS 8464 confirmed two access rows and removal of the Manage account menu; [live preview capture](assets/account-access/live-8464.png). Preview data/providers are fictional. No installed-release, physical-device, real authentication or Shared Album operation acceptance is claimed.
