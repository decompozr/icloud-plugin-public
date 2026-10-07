# Mailbox implementation research and Bun experiments

> Historical experiment commands and `playground/` paths below are retained as dated evidence. The prototypes were retired on 2026-10-07; use [current replacements and source history](research/retired-prototypes.md).

Research dated 2026-10-01. This compares mechanics and records scratch evidence;
it does not approve production implementation or select an approach. The
[mailbox scope](mailbox-tools.md), prose-first workflow and Codex/ChatGPT focus
remain authoritative. Reference capabilities are not automatically our scope.

## How the reference implementations work

| Reference and pinned source | Read/search mechanics | Mutation mechanics and implications |
| --- | --- | --- |
| [minagishl, `afa62af3`](https://github.com/minagishl/icloud-mail-mcp/blob/afa62af3f24f3168199f885856fcfd459444d0e2/src/lib/icloud-mail-client.ts) | TypeScript using node-imap, mailparser and SMTP. Searches IMAP then fetches full source for parsing. | Mark/move/delete/flag methods ignore supplied `_messageIds` and search `ALL`. Delete marks results deleted and calls global expunge. These cannot be reused as precise mailbox operations. |
| [bufordeeds, `f6064932`](https://github.com/bufordeeds/icloud-mail-mcp/blob/f606493271a51920a12392b9375c4468e10c6a4f/server.py) | Python/FastMCP with IMAPClient, UID mode by default. Selects folders read-only and fetches RFC822 source, including for list/search snippets. | Offers SMTP send and draft append, not the full requested organization surface. No UIDVALIDITY contract observed. No license file or statement was found in the narrow review; treat it as a behavioral reference, not permission to copy code. |
| [JulienRabault, `efee3eef`](https://github.com/JulienRabault/icloud-mcp/tree/efee3eef9a24f699b024475f7db950c17646acd8/src/icloud_mcp) | Python standard-library IMAP/MIME. Read-only selection with UID `BODY.PEEK[]`; header-only summaries and multi-folder search. | Separate flags and move modules. Move uses COPY, deleted flag and global EXPUNGE, preceded by a check for unrelated deleted messages. Writable connection cleanup calls CLOSE. No UIDVALIDITY contract or destination UID mapping observed. |

Julien's [read implementation](https://github.com/JulienRabault/icloud-mcp/blob/efee3eef9a24f699b024475f7db950c17646acd8/src/icloud_mcp/imap_client.py)
provides a useful read-state pattern. Its
[move implementation](https://github.com/JulienRabault/icloud-mcp/blob/efee3eef9a24f699b024475f7db950c17646acd8/src/icloud_mcp/move.py)
and connection cleanup need different treatment: checking for unrelated deleted
messages before global expunge does not make it atomic against another client;
CLOSE on a writable mailbox can also expunge. The repository's assertion that
iCloud lacks MOVE/UIDPLUS is a provider claim, not evidence from our account or
capability negotiation. Do not treat it as a settled platform fact.

Neither Python reference establishes arbitrary iCloud tags, junk training or an
unsubscribe execution contract. Julien's flag support is limited to seen,
flagged and answered. The existing [reference catalog](references.md) and
[attribution](../THIRD_PARTY_NOTICES.md) remain applicable.

## What the requested operations require

| Requested operation | Feasibility and approach evidence | What remains unknown |
| --- | --- | --- |
| List/search, unread list | Standard IMAP search, UID results and envelope/header retrieval are available in these libraries. | Bounded pagination/order and search contract; actual provider behavior. |
| Full/summary read | PEEK plus read-only selection is demonstrated by Julien source and Bun wire fixtures. Header/body previews can be returned; the agent writes semantic summaries. | Body/attachment bounds, MIME edge cases, summary fields and live unread preservation. |
| Mark read/unread; flag/unflag | UID STORE can target exact noncontiguous UIDs; actual Bun client wire commands verified. | Stale UIDVALIDITY rejection and live before/after acceptance. |
| Trash/restore, move/archive | Folder moves are expressible. Native MOVE and UIDPLUS mappings are supported by the tested library. | Actual iCloud extensions, folder mapping, original restore destination and interruption recovery. No automatic global-expunge fallback is acceptable. |
| Junk/not junk | Special-use Junk folders can be discovered; a folder move is technically distinct from spam training. | Whether requested iCloud behavior includes classification/training and how not-junk selects a destination. |
| Tag/untag | PERMANENTFLAGS metadata can indicate arbitrary keyword support; library metadata is accessible. | Actual iCloud keyword acceptance/persistence/client visibility. A folder or flag must not silently stand in for a tag. |
| Unsubscribe | MIME parsing exposes header candidates for mailto, ordinary links and one-click markers. | Supported request contract, sender/header trust, destination restrictions, redirects, user confirmation and success verification. None of the three references supplies this feature. |

Message identity should be specified before implementation. UID is scoped to a
mailbox and its UIDVALIDITY; moving creates a destination identity. A parsed
Message-ID header is not a substitute. The experiment observes UIDVALIDITY and
COPYUID values but does not implement or prove a stale-identity guard.

## Actual scratch results

Run from [the isolated playground](research/prototype-archive/overview.md):

```sh
cd playground
bun install --frozen-lockfile
bun run test
```

Observed Bun 1.4.2, ImapFlow 1.7.8 and mailparser 3.9.33. Six tests passed with
25 assertions. Dependencies are pinned in the playground's own lockfile; no
production module is imported and no production dependency was changed.

The actual client emitted these commands against a loopback scripted IMAP server:

| Fixture | Observed commands/result | Interpretation |
| --- | --- | --- |
| Read-only full-source request, UID 41 | `EXAMINE INBOX`; `UID FETCH 41 (FLAGS BODY.PEEK[]<0.1000> UID)` | Exact UID, read-only selection and bounded non-seen-setting fetch syntax. |
| Seen/unseen, UIDs 41 and 43 | `UID STORE 41,43 +FLAGS (\\Seen)` and `UID STORE 41,43 -FLAGS (\\Seen)` | No search-all or unrelated UID in the request. |
| MOVE + UIDPLUS advertised | `UID MOVE 41,43 Archive`; fixture COPYUID maps 41→81, 43→83 | Library exposes the destination mapping supplied by the server. |
| No MOVE; UIDPLUS advertised | UID COPY, exact UID STORE `\\Deleted`, `UID EXPUNGE 41,43` | Targeted copy/delete fallback exists, but partial failure and product semantics still require decisions. |
| Neither MOVE nor UIDPLUS | UID COPY, exact UID STORE `\\Deleted`, plain `EXPUNGE` | Dangerous global-expunge fallback observed. Passing this assertion is evidence of the hazard, not acceptance of the operation. |
| Special-use and permanent flags | Parsed `\\Junk`; distinguished PERMANENTFLAGS with and without `\\*` | Client exposes capability metadata; fixture values are not iCloud observations. |

MIME fixtures verified folded mailto/HTTPS candidates and one-click markers,
absent/duplicate headers, ordinary links, unsupported schemes and malformed URLs.
No link was opened and no email sent. The classification sketch is not a complete
parser or security policy; it does not validate signatures, redirects or remote
outcomes. It establishes access to useful header data only.

The first protocol run found a malformed fixture LIST-root response; correcting
the fixture resolved namespace/special-use mismatches. No result was counted as
passing before the corrected run. The tiny server does not model mailbox state,
concurrent sessions or iCloud. No live provider/client/Tailscale verification or
production build was performed.

## Approach options for discussion

1. **Bun/TypeScript with ImapFlow and mailparser:** strongest direct experiment
   evidence for the selected toolchain. Build narrow mailbox contracts around
   explicit identities and capability checks. Default library move fallback must
   not be called without deciding safe capability-dependent behavior.
2. **Adapt the original TypeScript/node-imap approach:** matches the original
   reference, but needs replacement of unsafe selection/mutation logic and
   further Bun/library verification. Existing source is not a safe shortcut.
3. **Use the Python examples as behavioral references:** useful read and MIME
   patterns, but embedding a Python runtime would add a second toolchain and is
   not the current Bun-first direction. Source reuse also requires license review.

The next decision is how to handle providers lacking safe move capabilities:
return unsupported, offer a separately specified non-destructive alternative,
or accept a carefully defined targeted fallback where extensions permit it.
Do not silently implement global expunge. Agree the read/identity contracts and
provider evidence needed before choosing an implementation approach. Scheduling,
rules, approval decisions and reports stay with the calling agent.

## Systematic extension: identity and failure observations

The extended mail experiments are specified in
[playground goals](research/prototype-archive/mail-goals.md) and L2–L6 of the register.
Actual ImapFlow observations:

- Missing UID fetch returns `false`; a new connection exposes changed
  UIDVALIDITY. UID mutations accept only UID input, so stale-reference protection
  must be implemented above the library. A separate sketch rejects mismatched
  mailbox/validity before its dummy writer; that is not a production guard.
- **COPY rejection does not stop the tested move fallback.** ImapFlow 1.7.8
  emitted `UID COPY 41,43 Archive`, received tagged NO, then still emitted
  `UID STORE 41,43 +FLAGS.SILENT (\Deleted)` and `UID EXPUNGE 41,43`, finally
  returning `false`. The safety expectation failed. The retained test asserts
  this hazardous trace so the finding remains reproducible; no library fix was
  attempted during research.
- Rejecting STORE after successful COPY also led to UID EXPUNGE and a returned
  copy-result object. That result alone cannot prove successful movement.
- Dropping the native MOVE response produced failure with one MOVE attempt and
  no retry. The fixture cannot establish whether a real server completed it;
  an application must report uncertainty instead of blindly resubmitting.
- Cooperative mailbox locks serialized overlapping INBOX/Archive operations.
  Logout emitted no CLOSE/EXPUNGE. This does not protect against external clients
  or code bypassing the lock.

MIME fixtures decoded Unicode and an 8 KiB attachment. Full parsing includes
attachment bytes; parsing a short source is not a completeness signal. A separate
excerpt sketch explicitly reports truncation and attachment omission. These are
not memory-limit, streaming or arbitrary-MIME guarantees.

Separate policy sketches make missing/ambiguous special folders, unknown restore
origins, and stale references explicit. An offline URL sketch uses a **fixed fake
resolver allowlist**, rejects the supplied unsupported/userinfo/private/mixed
fixtures and rechecks synthetic redirect hops. It is not a production network
policy, general address classifier or proof against DNS rebinding. No request
was submitted or confirmed. Live iCloud and browser/client acceptance remain open.

## Container follow-up boundary

The systematic L10 follow-up corrected the temporary HTTP responder. HTTP worked
inside the cached Alpine container and from the host directly to its container
IP. Stop/start retained the bind-mounted counter (observed values 1 then 2).
Only host access through the published localhost port continued to reset; its
cause is unresolved. Alpine lacked Bun, so this does not validate a Bun/MCP
container image. All owned temporary containers and mounts were removed, with
zero remaining container inventory. See [runtime evidence](research/prototype-archive/runtime.md)
and [the experiment register](experiments.md). No daemon/network/Tailscale change
or additional full-suite run was needed for this documentation correction.
