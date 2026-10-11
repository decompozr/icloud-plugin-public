# Mobile capability and connection account alignment

The owner supplied physical-phone screenshots showing enabled capability tags
pushing controls underneath module names, and an account identity squeezed into
one-character lines beside a button repeating the same email. Both are layout
failures in native 0.1.112; earlier disabled-only fixtures did not cover the first.

## User stories

| User and intent | Interaction | Feedback and recovery | Acceptance |
| --- | --- | --- | --- |
| An owner scans enabled modules and opens a specific module's settings. | Read the module name on the left and use its switch/settings controls on the right. Read wrapping permission tags and module notices below that header. | The persisted switch and status remain visible; opening/cancelling settings preserves saved policy. | Controls remain beside the name at 320/390/590/1280 widths with every capability enabled, in English and Traditional Chinese. Tags and notices use their own full-width rows. Loading uses the same row structure. |
| A connecting client user chooses the correct iCloud account. | Read the account identity in a flexible text column and activate its fixed-width arrow action by touch or keyboard. | The action's accessible name identifies the exact account. Selection retains that account and the signed OAuth query; subsequent consent remains unchecked. Unavailable accounts remain disabled; cancellation and adding another account keep their existing behavior. | No repeated email on the visible action, no one-character identity column, no horizontal overflow, and keyboard selection preserves the exact account/query. |

The shared layout uses pinned control metrics and spacing. Catalog Button, Switch,
Icon and Tag source is unchanged. No policy, credential or grant behavior is added.

## Self-checking evidence

Build/typechecks pass with zero Svelte errors/warnings. Studio passes 244 tests.
Browser checks pass: new populated/long-account regression104, requirements143,
module settings31 and Overview26 (304 total). Fixtures cover both languages and
320/390/590/1280 widths; they do not establish physical-phone acceptance.

Inspected captures: [enabled modules](assets/mobile-alignment/modules-en-390.png),
[Chinese narrow modules](assets/mobile-alignment/modules-zh-TW-320.png),
[account chooser](assets/mobile-alignment/connection-en-390.png), and
[Chinese narrow chooser](assets/mobile-alignment/connection-zh-TW-320.png).

Native 0.1.113 deployment and live verification are recorded after immutable-main
build and the existing supported installation lifecycle. The 8464 preview remains off.
