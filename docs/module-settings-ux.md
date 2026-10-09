# Module settings and shared modal

Owner: Studio. Date: 2026-10-09. Endpoint: verified local source and existing private 8464 fixture preview. Native deployment and publication are N/A.

## User stories and execution contract

1. As an owner, I want `{module} Settings` and a Requirements heading so I can identify the task and its prerequisites. Show App Password: Stored with the existing completed marker only from stored-state evidence; unknown is not passed validation.
2. As an owner choosing actions, I want named switches and descriptions supplied by module UI registrations. A left-aligned All switch edits available actions only, respecting dependencies and installation ceilings. Drafts remain uncommitted until Save.
3. As an owner, I want requirements status next to Requirements. Save is the explicit confirmation; remove the redundant enablement checkbox and vague connection prose. Backend owner, origin, requirement, ceiling and confirmation checks remain.
4. As a user leaving a dialog, I want background click to close through its existing close/discard handler. Busy operations stay protected, inside clicks/drag-out do not dismiss, and focus returns normally.
5. As a phone user, I want shared modals to rise from the bottom with slight backdrop blur, safe-area spacing and reduced-motion support. Desktop dialogs retain their normal placement.

Implementation: pinned Switch/FieldLabel/quiet Button, module-owned description/dependency metadata, shared Modal adapters. Blur and sheet entry are explicitly recorded consumer extensions: blur uses pinned spacing[1], corners use radius.surface, and motion reuses the existing 180ms adapter duration. No vendor source changes.

Acceptance: English/Traditional Chinese titles and descriptions; draft/all/dependency/unavailable behavior; Save readiness and no extra enablement checkbox; missing native requirements still block elevation; background/inside/busy/discard behavior; desktop/mobile geometry, safe-area layout and reduced motion; source build/type and appropriate regressions. Capture and inspect results before claiming visual acceptance. Preview is fictional; provider/device/client acceptance remains separate.

Status: implemented and locally verified; private fixture preview updated.

## Follow-up stories

- As an owner scanning services, I see a status dot beside each module name: green for saved enabled policy, red for saved disabled policy, gray for unknown/stale policy. Accessible names and hover hints preserve meaning without repeated visible status tags. These are policy states, not provider health.
- As an owner editing actions, any draft differing from saved state has a warning-yellow switch, including a pending disable. Green is reserved for saved enabled actions. Save failure preserves the draft; successful readback restores persisted appearance.
- As an owner scanning requirements, the heading marker and individual requirement markers share a left column and state colors. A completed heading uses a checkmark, without a Ready tag.
- As an owner finishing configuration, quiet icon-only Save/Cancel and Close use catalog icons, named accessible controls, hints and existing touch targets.

Component ownership: ServiceCapabilities → CapabilityCard; CapabilityConfig → CapabilityRequirements and AllowedActions → AllowedAction. ModuleDialog retains only the existing integration adapter. Shared visual extensions StatusMarker and DraftSwitch preserve pinned controls, semantic warning/positive/critical colors and metrics. No vendor source changes.

Removed the connection-approval footer: it asserts a separate grant behavior that module policy settings alone cannot establish. No automatic-grant behavior is changed in this UI slice.

## Acceptance evidence

Self-checking: full source build and UI type checks passed; Studio tests 28 passed; requirement browser flow 143 checks passed; capability settings 21 checks passed; recovery flow 17 checks passed; static requirement-marker and late-readiness/module bundle checks passed. HTTPS 8464 browser readback confirmed the new Mail Settings and four action rows after the detached preview launcher exited.

Inspected screenshots: [desktop](assets/module-settings/mail-desktop.png), [pending draft](assets/module-settings/mail-pending.png), [mobile sheet](assets/module-settings/mail-mobile.png), [private preview](assets/module-settings/live-8464.png). Mobile content scrolls beneath the fixed header; notification spacing preserves reachable actions. No physical-device, screen-reader, real-provider, automatic-grant or installed-release acceptance is claimed.
