# Module settings and shared modal

Owner: Studio. Date: 2026-10-09. Endpoint: verified local source and existing private 8464 fixture preview. Native deployment and publication are N/A.

## User stories and execution contract

1. As an owner, I want `{module} Settings` and a Requirements heading so I can identify the task and its prerequisites. Show App Password: Stored with the existing completed marker only from stored-state evidence; unknown is not passed validation.
2. As an owner choosing actions, I want named switches and descriptions supplied by module UI registrations. A right-aligned All switch with its text on the left edits available actions only, respecting dependencies and installation ceilings. Drafts remain uncommitted until Save.
3. As an owner, I want requirements status next to Requirements. Save is the explicit confirmation; remove the redundant enablement checkbox and vague connection prose. Backend owner, origin, requirement, ceiling and confirmation checks remain.
4. As a user leaving a dialog, I want background click to close through its existing close/discard handler. Busy operations stay protected, inside clicks/drag-out do not dismiss, and focus returns normally.
5. As a phone user, I want shared modals to rise from the bottom with slight backdrop blur, safe-area spacing and reduced-motion support. Desktop dialogs retain their normal placement.

Implementation: pinned Switch/FieldLabel/quiet Button, module-owned description/dependency metadata, shared Modal adapters. Blur and sheet entry are explicitly recorded consumer extensions: blur uses pinned spacing[1], corners use radius.surface, and motion reuses the existing 180ms adapter duration. No vendor source changes.

Acceptance: English/Traditional Chinese titles and descriptions; draft/all/dependency/unavailable behavior; Save readiness and no extra enablement checkbox; missing native requirements still block elevation; background/inside/busy/discard behavior; desktop/mobile geometry, safe-area layout and reduced motion; source build/type and appropriate regressions. Capture and inspect results before claiming visual acceptance. Preview is fictional; provider/device/client acceptance remains separate.

Status: implemented and locally verified; private fixture preview updated.

## Follow-up stories

- As an owner scanning services, I see a status dot beside each module name: green for saved enabled policy, gray for saved disabled policy, gray for unknown/stale policy. Accessible names and hover hints preserve meaning without repeated visible status tags. These are policy states, not provider health.
- As an owner editing actions, any draft differing from saved state has a warning-yellow switch, including a pending disable. Green is reserved for saved enabled actions. Save failure preserves the draft; successful readback restores persisted appearance.
- As an owner scanning requirements, the heading marker and individual requirement markers share a left column and state colors. A completed heading uses a checkmark, without a Ready tag.
- As an owner finishing configuration, quiet icon-only Save/Cancel and Close use catalog icons, named accessible controls, hints and existing touch targets.

Component ownership: ServiceCapabilities → CapabilityCard; CapabilityConfig → CapabilityRequirements and AllowedActions → AllowedAction. ModuleDialog retains only the existing integration adapter. Shared visual extensions StatusMarker and DraftSwitch preserve pinned controls, semantic warning/positive/critical colors and metrics. No vendor source changes.

Removed the connection-approval footer: it asserts a separate grant behavior that module policy settings alone cannot establish. No automatic-grant behavior is changed in this UI slice.

## Acceptance evidence

Self-checking: full source build and UI type checks passed; Studio tests 28 passed; requirement browser flow 143 checks passed; capability settings 21 checks passed; recovery flow 17 checks passed; static requirement-marker and late-readiness/module bundle checks passed. HTTPS 8464 browser readback confirmed the new Mail Settings and four action rows after the detached preview launcher exited.

Inspected screenshots: [desktop](assets/module-settings/mail-desktop.png), [pending draft](assets/module-settings/mail-pending.png), [mobile sheet](assets/module-settings/mail-mobile.png), [private preview](assets/module-settings/live-8464.png). Mobile content scrolls beneath the fixed header; notification spacing preserves reachable actions. No physical-device, screen-reader, real-provider, automatic-grant or installed-release acceptance is claimed.

## Toast and follow-up execution contract

Owner: Studio/shared UI. Authorized endpoint: source changes plus existing private 8464 fixture preview. Steps: correct All label order, disabled-dot semantics and extracted header layout; remove modal notification layout coupling; mount one top-layer toast host with five-second dismissal; self-check desktop/mobile and refresh preview. Native deployment N/A.

Stories:
- As an owner selecting actions, I read “All” before its switch at the right edge, aligned with individual switches.
- As an owner scanning modules, gray means disabled/unknown, green means enabled. Red is reserved for observed failure and is never inferred from a disabled policy.
- As a user receiving feedback, notifications appear above dialogs without changing any card/modal geometry or scroll position, then slide away after five seconds. Hover or keyboard focus pauses dismissal; close/swipe remain available. Errors retain their separate persistent form feedback.
- As an owner saving changes, I recognize the standard disk Save icon; checkmarks remain completion indicators. The added glyph uses the same pinned Lucide revision and ISC attribution, as a project-owned asset without vendor edits.

Follow-up acceptance: source build/type checks passed; Studio tests 28 passed; requirements flow 143, capability settings 22, recovery 17 and toast-layer 14 browser checks passed. Toast checks cover single host, interaction above a native modal, unchanged geometry/padding, hover pause, five-second dismissal, mobile bottom alignment, gray disabled dots, disk Save icon and header-right refresh placement. [Toast layer](assets/module-settings/toast-layer.png), [mobile without reserved gap](assets/module-settings/toast-mobile.png), [capability header and dots](assets/module-settings/capabilities.png), and refreshed [8464 readback](assets/module-settings/live-8464.png) were inspected. Browser top-layer bridging temporarily reparents the single host under an open native dialog to avoid inertness; it never enters modal content or participates in layout. Physical-device and real-provider checks remain unperformed.

## Consistent capability row spacing

Story: As an owner comparing enabled and disabled modules, I want one reserved action-summary line below every module name so rows do not shrink when disabled. Keep the gray disabled dot and an empty summary line, without restoring a visible Disabled tag. Reuse the catalog Tag minimum height (coarseTarget minus two spacing[2] insets) in shared layout rules. Long/wrapped action labels can naturally grow beyond that minimum on mobile.

Execution: update the shared row minimum, build/type-check, compare enabled/disabled geometry on desktop/mobile, and refresh the existing private fixture preview. Native installation N/A.

Spacing acceptance: build/type checks passed. At 1280px and 390px, saved Mail read-only and three disabled modules each measured 85px row height with a 28px summary line. Inspected [desktop](assets/module-settings/spacing-1280.png) and [mobile](assets/module-settings/spacing-390.png); HTTPS 8464 browser readback confirmed the reserved line. These checks use fictional data.

## Borderless icon actions

Story: As an owner scanning controls, I want icon-only settings, refresh, copy, add, close and save/cancel actions to use a consistent quiet appearance so repeated button borders do not compete with the content. Hover/pressed feedback, accessible names and hints, keyboard focus, disabled/loading state and existing 44px touch targets remain. Named text actions retain their existing catalog appearance.

Implementation contract: apply catalog Button quiet appearance in the shared ActionButton adapter for every icon-only consumer; preserve critical icon color without restoring its border. Build/type-check, inspect desktop/touch and confirm representative actions remain operable; update the established private 8464 fixture. Native installation N/A.

Borderless acceptance: full build/type checks passed. Ten visible icon buttons were checked in each desktop and touch context: quiet appearance, transparent idle surface/border, accessible names and 44px minimum touch targets. Configure/Close remained operable; the recovery flow passed 17 checks including keyboard focus. Inspected [desktop](assets/module-settings/icons-desktop.png) and [mobile](assets/module-settings/icons-mobile.png). HTTPS 8464 readback confirmed quiet Configure Mail and Refresh capabilities. Fixture-only; no physical-device acceptance claimed.
