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

## Globe language selector

Story: As a multilingual user, I recognize a globe control in the global navigation, open it, and choose English or Traditional Chinese. Full language names and a checkmark identify the current choice inside the menu. The trigger uses a translated Language accessible name/tooltip, quiet appearance and the existing rail touch target; keyboard menu navigation and focus restoration stay catalog-owned.

Implementation contract: reuse the unmodified catalog Menu through a shared GlobeMenu glyph adapter; add unmodified globe geometry from the same pinned Lucide revision with ISC attribution. Replace EN/繁 trigger text in Studio without changing locale persistence. Build and verify desktop/touch, keyboard Escape and live locale selection before refreshing the private 8464 fixture. Native installation N/A.

Action alignment story: As an owner scanning named actions and wrapped descriptions, I want each switch at the top of its row beside the action title, so description length does not shift the control vertically. Shared row layout uses flex-start while catalog switch metrics and touch targets remain unchanged. Verify desktop/mobile wrapped descriptions.

Globe/alignment acceptance: full source build/type checks passed. Desktop and touch checks confirmed a quiet 44px globe trigger, translated Language name, full menu labels with selected-locale checkmark, locale persistence after reload, ArrowDown and Escape focus restoration. All four action rows align switch wrappers to the top of their text columns on desktop/mobile. Recovery flow passed 18 checks. Inspected [globe desktop](assets/module-settings/globe-desktop.png), [globe mobile](assets/module-settings/globe-mobile.png), [aligned desktop](assets/module-settings/alignment-desktop.png), and [aligned mobile](assets/module-settings/alignment-mobile.png). HTTPS 8464 readback confirmed both changes. Fixture-only; no physical-device acceptance.

## Flat navigation selection marker

Story: As a user switching sections, I want a flat line at the right edge of the active navigation tab, closest to its content, to identify my current destination. Selection has no rounded tile or enclosing border. Hover and keyboard focus remain visible; aria-current, marker motion and reduced-motion behavior remain unchanged.

Execution contract: reuse the existing 2px indicator metric and semantic focus color in shared navigation styling; verify all four destinations on desktop/mobile, then refresh the existing private 8464 fixture. Native installation N/A.

Flat marker acceptance: full build/type checks passed. All four destinations at desktop and mobile widths use one 2px right-edge marker matching the selected tab height/top, with zero radius/border and no selected tile fill. Reduced-motion transition is disabled. Inspected [desktop](assets/module-settings/nav-line-desktop.png) and [mobile](assets/module-settings/nav-line-mobile.png); live HTTPS 8464 readback passed. Fixture-only; physical devices not checked.

## Icon density parity

Story: As a user recognizing an icon action, I want the same glyph and target dimensions with or without a border, so quiet appearance does not make Save, Close, settings, refresh, copy or language controls feel smaller.

Observed cause: ActionButton defaulted to compact (16px glyph), including touchAppearance compact. Quiet appearance itself does not reduce the catalog glyph. Use normal catalog density by default: 20px desktop glyph / 36px desktop target and 24px coarse-pointer glyph / 44px touch target. Explicit compact consumers remain supported. The language adapter adopts the same glyph density. Keep quiet appearance, existing hints, focus and state feedback.

Execution contract: update shared adapters only; verify actual SVG/target dimensions in both pointer contexts and compare identical buttons with quiet/default appearance, including Save's project-owned glyph. Build and regress relevant wrapping/interaction flows, then refresh private 8464. Native installation N/A.

## Closing and footer corrections

Story: As an owner leaving module settings, I close via X, Cancel, Escape or background and discard the unsaved draft directly, without a second confirmation. Save remains the only persistence action. Busy saves stay protected. Save/Cancel align to the footer right.

Story: As a phone user, I see the bottom sheet slide down when dismissed, matching its upward entry. Shared native Modal retains its top-layer/dialog count until the 180ms exit completes, then restores focus; reduced motion and desktop close immediately. Reopening cancels a pending exit. CapabilityConfig retains its displayed module identity through exit so the sheet does not become blank.

These stories supersede earlier dirty-draft close-confirmation requirements; other credential/reset confirmations retain their own scope. Verify no confirmation appears, unsaved policy stays unchanged, footer alignment, actual exit motion and reduced-motion behavior along with icon-density parity.

Density/close acceptance: full build/type checks passed. Actual quiet/default-appearance measurements match: 20px SVG / 36px button on desktop and 24px SVG / 44px button on touch, including Close/Save/Cancel and the globe adapter. Studio tests 28 passed after updating the superseded compact-render expectation; capability browser flow 28, account access 23, recovery 18 and requirements 143 checks passed. Verified right-aligned footer, no dirty-discard prompt and no policy mutation on Cancel, retained native modal plus real downward translation during exit, and reduced-motion behavior. Inspected [desktop](assets/module-settings/icon-density-desktop.png) and [mobile](assets/module-settings/icon-density-mobile.png); HTTPS 8464 readback confirmed standard density and direct discard. Fixture-only; physical-device acceptance remains unperformed.
