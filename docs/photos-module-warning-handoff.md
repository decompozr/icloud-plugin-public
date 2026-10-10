# Photos module warning handoff

Requested by the user on 2026-10-09 for the existing module-migration thread. Delivery status: implemented directly in the UI task after the owner requested completion of all remaining design work. The earlier cross-thread handoff was not sent.

## Requested change

Move “Shared Album writes are unsupported.” into the Photos capability card. The Photos module registration or module-owned presentation must provide the warning and its semantic warning role. Studio should render registered module notices generically; it must not select this message using a hard-coded Photos id. Remove the global notice currently rendered beneath every module in `apps/studio/src/components/ServiceCapabilities.svelte`.

Use the existing design system for warning presentation. Keep warning text readable and associated with Photos, including on mobile. Preserve the current unsupported-write behavior; this request changes ownership and placement only.

## User story and acceptance

As an owner scanning service capabilities, I want Photos limitations next to Photos so I understand which module they affect before enabling actions. I read the module-provided warning within the Photos card, with a warning cue and clear text; no toast or interaction is needed.

Acceptance:
- Photos registration/presentation owns the message metadata.
- Photos warning appears inside the Photos card, not below Apple Home or the full service list.
- Studio uses a generic registered-warning renderer; other modules can supply their own warnings.
- Existing permission/unsupported-write semantics remain unchanged.
- Verify English/Traditional Chinese and desktop/mobile placement; record evidence in docs.

## Integration context

The original UI task branch was `improve-studio-uiux-proportions`; completion is merged from `finish-studio-design-system` in PR #157 and deployed in 0.1.112. Capability components were introduced in commit `c856802`; follow-up controls/toasts in `0dc8b4b`; consistent empty summary lines in `d57b422`. Coordinate with these component boundaries rather than restoring the former monolithic Overview.
