# Shared page primitives

`page.ts` supplies the visual tokens/styles, brand, card and icon primitives used
by owner setup and authentication pages. It provides consistent focus treatment,
spacing and responsive layout without owning either workflow's state or permissions.

Callers supply trusted rendered markup. These helpers are not an HTML sanitizer:
untrusted text must be escaped or inserted through safe DOM text APIs by the caller.
The dependency flows from admin/auth page renderers into UI primitives, never from
this folder into Mail services or storage. There is no persistent state here.

The [design language](../../../../docs/design-language.md) is the visual reference.
Admin/auth page tests exercise rendered integration and accessibility attributes;
full visual, keyboard and physical Passkey acceptance requires browser checks.
Calendar-specific UI would compose these primitives rather than add domain rules.
