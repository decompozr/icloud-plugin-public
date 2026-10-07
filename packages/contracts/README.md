# Universal contracts

Platform-neutral account authorization schemas and capability/read evidence
contracts, shared by backend and browser consumers. This entry imports only Zod;
it never imports a server facade, SQLite, credentials, native clients or Svelte.

`bun run build` emits the independent contract bundle and declarations. Account
builds it before consuming its interface; Studio also consumes that built entry.
Installed backend declaration contracts are embedded to preserve portability.
