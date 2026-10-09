# Shared interface copy

`index.ts` owns typed English and Traditional Chinese resources for the setup/admin
interface using i18next. `CopyKey`, `t`, `isCopyKey` and `richText` give renderers and
browser code a bounded set of keys; rich text supports the deliberately small bold
segment convention rather than arbitrary translator-provided HTML.

The use case is one coherent owner-facing setup/management experience. Callers
render returned text safely and control language selection. Authentication also
has its own page-copy adapter under `auth`; provider errors must map to safe copy
rather than expose raw credentials or server exceptions. This folder stores no
account state and grants no permissions.

English keys define the required translation shape; TypeScript catches missing
Traditional Chinese entries. Admin/auth page and browser integration tests exercise
copy use. This is not a translation-management service or evidence that every future
feature is localized. New Mail/Calendar wording should preserve feature ownership
while reusing genuinely shared interface language. See [design language](../../../../docs/design-language.md).

Studio owns the source catalogs at `apps/studio/messages/en.json` and
`zh-TW.json`, compiled by Paraglide for request-scoped SSR and reactive browser UI.
These core compatibility resources are derived from the same JSON, rather than
maintaining another translation dictionary.
