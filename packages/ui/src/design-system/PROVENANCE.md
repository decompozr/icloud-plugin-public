# Pinned DecompozR controls

Menu, Icon and their token/internal dependencies are unmodified source from
DecompozR Design System revision c0863d99015cfd6b039755f2f2fb94ce5ee47aa7.
Consumer state belongs to feature modules or shared adapters; translations remain in Studio. Lucide ISC notice is bundled
in application assets. Do not independently redraw catalog glyphs.

Button, Spinner, Tag, Checkbox, FieldLabel, Select (including select.ts), Toast and ToastRegion are also unmodified
source from that same pinned revision. Toast gesture/motion and translated message
state live in project-owned adapters; catalog visual controls are not redrawn.

Switch is copied unchanged from `src/lib/Switch.svelte` at the same pinned
revision. Its control metrics, palette, focus and reduced-motion behavior remain
upstream-owned. The shared ModuleSwitch only proposes the existing configuration
dialog and restores the persisted state until confirmation succeeds.

SettingsSection is a project-owned layout adapter using the pinned spacing, border
and typography roles. It adds no control or independent visual metrics; the catalog
Switch/Button/Icon/Modal remain unchanged.
