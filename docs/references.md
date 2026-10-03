# Reference implementations

These examples inform the [mailbox specification](mailbox-tools.md); they are
not endorsements or additions to scope. Primary repository pages were checked
on 2026-10-01. Descriptions below distinguish published claims from source
inspection; no package was installed or exercised against a mailbox.

| Reference | Language and published capabilities | Relevance and evidence limits |
| --- | --- | --- |
| [minagishl/icloud-mail-mcp](https://github.com/minagishl/icloud-mail-mcp) | TypeScript; README lists reading, sending, deletion, searching, flags and mailbox operations. The language is corroborated by its `.ts` source. | Original adaptation reference. Useful for tool shape and IMAP/SMTP integration, but the targeted source findings below preclude copying mutation behavior unchanged. |
| [bufordeeds/icloud-mail-mcp](https://github.com/bufordeeds/icloud-mail-mcp) | Python/FastMCP; README and `server.py` layout identify Python. README lists folders, recent messages, search, full reads, sending and draft creation. | A compact alternative for comparing basic MCP tool contracts. Listed behavior is documentation, not verified runtime correctness. |
| [JulienRabault/icloud-mcp](https://github.com/JulienRabault/icloud-mcp) | Python; README names the package `icloud-mail-mcp` and describes folder search, reads, flags, filing, drafts and sending. | README specifically claims read/search use read-only selection and `BODY.PEEK` to avoid marking mail read. This is a useful hypothesis for our read-state acceptance check, not independently verified behavior. Package naming was checked in the README; registry availability was not verified. |

## Recorded source caution for the original reference

At the previously inspected revision
[`afa62af3f24f3168199f885856fcfd459444d0e2`](https://github.com/minagishl/icloud-mail-mcp/tree/afa62af3f24f3168199f885856fcfd459444d0e2),
a narrow source recheck confirms that marking, moving, deleting and flagging
accept `_messageIds` but search `ALL` and act on those results. Deletion then
calls unscoped expunge. See the pinned [mark/move implementation](https://github.com/minagishl/icloud-mail-mcp/blob/afa62af3f24f3168199f885856fcfd459444d0e2/src/lib/icloud-mail-client.ts#L355-L386)
and [delete/flags implementation](https://github.com/minagishl/icloud-mail-mcp/blob/afa62af3f24f3168199f885856fcfd459444d0e2/src/lib/icloud-mail-client.ts#L645-L749).
These observations concern that revision, not a comprehensive audit of current
upstream. They reinforce our exact-target and no-permanent-purge requirements.
Existing attribution remains in [third-party notices](../THIRD_PARTY_NOTICES.md).

## How to use these examples

Compare implementation choices against the agreed contracts and the proposed
[experiments](experiments.md), especially read-state preservation and selection
isolation. General sending, draft composition and built-in automation appearing
in references remain outside our agreed scope. Review relevant licenses before
reusing additional source. Codex and ChatGPT remain the initial consumers, and
Bun remains the selected toolchain; Python examples do not change those decisions.
