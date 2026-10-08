# Retired prototypes

On 2026-10-07 the tracked `playground/` tree was retired. Production Mail,
Calendar, authentication, setup, lifecycle and Photos implementations have their
own tests. Retaining independent prototype implementations and dependency locks
would create competing paths for the same behavior. This is repository cleanup;
production configuration, credentials, installed payloads and Apple permissions
are unchanged. No service release or restart is required.

## Current replacements

| Retired source | Current owner |
| --- | --- |
| Mail policy and unsubscribe sketches | `modules/mail/src/` production domain/service/adapter tests |
| Auth and provider candidates | `apps/icloud/src/auth/` production handler and synthetic Passkey/OAuth tests |
| Setup and encrypted-store candidate | `apps/icloud/src/storage/`, `auth/` and `server/` tests |
| Runtime and container candidates | `apps/icloud/src/server/`, `packages/tooling/` and `apps/e2e/lifecycle/` |
| Calendar client, scenarios, demos and live experiment helpers | `apps/icloud/src/calendar/` production codec, gateway and service tests |
| Parked Photos picker executable | [Parked Photos findings](../photos-parked.md) and [picker evidence](prototype-archive/photos-picker.md); source in Git history |

The real ImapFlow command/recovery and MIME-parser checks are preserved as
`modules/mail/src/icloud/library-protocol.test.ts` and
`library-recovery.test.ts`, with the loopback fixture under `test-fixtures/`.
They use the application's existing pinned dependencies and run with
`bun run --cwd apps/icloud test`. They test library behavior, including unsafe
fallback behavior, not product safety or live iCloud acceptance. The fixture is
excluded from production build entries and type declarations.

Foundation-only native presentation and control-journal checks now live in
`apps/homekit-helper/tests/`. Explicit native read acceptance scripts now live in
`apps/e2e/native/homekit/`. They are not automated provider acceptance and are not
run by this cleanup. No dependency installation, provider access or mutation is
hidden behind a catchall test command.

## Source history

The complete source immediately before this retirement is available at
[commit 356bea128e826377e1d7671ecb9ffd3271cf09bc](https://github.com/decompozr/icloud-plugin/tree/356bea128e826377e1d7671ecb9ffd3271cf09bc/playground).
Older Photos sources had already been retired before that commit; recover those
from the earlier path history (`git log --all -- playground/photos`). Recovery
must preserve the original lockfiles and evidence boundaries. Restoring an
experiment does not authorize running its provider or native operations.

Original goals, observations and limits are retained in
[the archive overview](prototype-archive/overview.md). Archived commands are
historical, not supported commands in the current checkout. Dated research reports
retain their observations; links point to current documents or immutable source
history. Git preserves retired source without keeping a runnable alternate
implementation in the current checkout. Ignored local data in other worktrees is
outside this cleanup.

## Verification

- Full application, Studio and tooling runner: 561 tests passed, zero failures,
  5,041 assertions. This includes the eight retained library checks (39 assertions).
- Application/Studio build and typecheck: passed; zero Svelte errors or warnings.
- Foundation-only native checks: 44 passed across presentation, control journal
  and launch/framing; no HomeKit/device I/O.
- No tracked files remain under the former playground. Changed Markdown links
  resolve locally or reference immutable source history. Native read scripts retain
  their behavior; relocated relative imports resolve to their original modules.
- No production entry, dependency/version declaration, native build input or
  production policy changed. Release, installation and restart are N/A.

The first direct typecheck used stale Studio output; a test attempt overlapped
with its rebuild and could not load generated modules. The canonical sequential
build/test commands above completed successfully. These setup failures were not
reported as passing checks. Live provider, device and native permission acceptance
was not performed.
