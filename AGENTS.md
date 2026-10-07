# Project instructions

## Git branches

Name future branches descriptively without a `codex/` prefix. Do not rename existing branches solely for this preference.

## Strict design-system adoption

All UI work must follow the existing DecompozR Design System and the project's adopted design language. Read `docs/design-language.md` and `packages/ui/src/design-system/PROVENANCE.md` before changing UI.

- Reuse the pinned catalog components for buttons, icons, checkbox/radio controls, field labels, tags, menus and toast visuals when available. Do not independently redraw or approximate an existing control.
- Use the pinned spacing, typography, semantic color, radius and control metrics. Do not introduce one-off visual values or competing stylesheets to fix a single screen.
- Keep product layout, state, translations and interaction adapters in Studio. Put reusable visual rules in the shared layer, not individual domain screens. Preserve vendor components unchanged; record source/version and license attribution for added components.
- Consumer-specific behavior such as toast ordering, entry motion and swipe dismissal may live in adapters. It must preserve catalog appearance, keyboard/dismiss controls, safe-area placement and reduced-motion behavior.
- Forms must use consistent label/control groups and aligned checkbox labels. Consent remains explicit, readable and unchecked by default.
- Verify mobile wrapping, spacing, dialogs and notification placement. Report unavailable browser/physical-device checks honestly; do not treat an asset response or source build as visual acceptance.
- Record any necessary unsupported design-system extension explicitly rather than silently adding a visual exception. These rules do not add approval gates for authorized fixes or deployment.
