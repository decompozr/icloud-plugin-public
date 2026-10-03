# Mailbox tools: vision and scope

This prose specification defines required behavior and takes precedence over
implementation. CP1/CP2 implement and locally verify the mailbox surface; the
roadmap records current checkpoint evidence and live provider limits.

## Vision and goals

Provide precise, basic tools for an external agent to inspect and manage the
user's iCloud mailbox. Codex and ChatGPT are the initial intended callers, using
the planned Mac-hosted Tailscale connection. The tools should give agents enough
message identity, mailbox state and outcome information to perform the user's
requested action and explain its result without guessing. Dots and other
providers are deferred, not initial acceptance requirements. Future support can
be added when needed; a generic provider framework is not in scope.

An agent can compose these tools into a periodic review, user-defined rules,
approval workflow, notifications or a report. Those decisions and workflows live
with the agent. The mailbox service does not become a scheduler, rules engine,
approval product, notification system or report generator.

## Included capabilities and expected outcomes

| Capability | Expected outcome | Mechanics still to establish |
| --- | --- | --- |
| List and search mail | Return matching messages with stable actionable identities and explicit result limits. | Search fields, ordering, pagination and identity encoding. |
| Read full or summary | Return the selected message's full available content or an explicitly identified summary representation. State omissions or truncation rather than implying completeness. | Full-body bounds, summary metadata/excerpt fields; agent-generated semantic prose is outside the service. |
| List unread; mark read or unread | Identify unread messages and change only the selected messages' read state. | Unread filtering and reliable state verification. |
| Trash and restore | Move selected messages into trash and restore selected trashed messages to a known destination without permanent deletion. | iCloud special-folder discovery, original-location tracking and destination selection when unknown. |
| Junk and not junk | Apply the selected junk/not-junk operation and accurately describe the resulting mailbox state. | Whether iCloud supports classification/training or only folder movement; do not equate them without evidence. |
| Tag and untag | Add or remove a supported categorization marker from selected messages, or clearly report unsupported capability. | Actual iCloud keyword/tag support and persistence; folders and flags are not silently substituted for tags. |
| Unsubscribe | Inspect available unsubscribe mechanisms and perform a supported, agent-authorized email or link operation with an explicit outcome. | Header parsing, mailto/link semantics, endpoint restrictions, redirects, confirmation requirements and success evidence. An arbitrary browser or guaranteed unsubscription is not promised. |
| List folders; move or archive | Expose actual folders and move selected messages to a specified or supported archive destination. | Special-folder mapping, destination validation and post-move identities. |
| Flag and unflag | Change only the selected messages' supported flag state. | iCloud flag semantics and how clients display them. |
| Send and reply | Submit explicitly composed plain-text mail and report recipient-level SMTP outcomes; replies bind the selected original message. | Accepted next Mail scope after the UIDPLUS gate; see composition contract below. |
| Create a draft | Save an unsent message in the actual Drafts mailbox and return its established identity. | SPECIAL-USE discovery, APPEND acknowledgement and duplicate prevention; see below. |

These are included product capabilities to specify and validate, not claims that
iCloud supports every mechanism. If capability evidence prevents the expected
outcome, document the limitation and discuss the contract rather than silently
substituting behavior.

## Use cases

| User or agent intent | Tool responsibility | Agent responsibility |
| --- | --- | --- |
| “Show my unread mail and summarize the important items.” | List unread messages and return requested full/summary content with identities. | Decide relevance and compose the user-facing summary. |
| “Review my inbox every morning.” | Serve correct mailbox reads when called. | Schedule calls, apply the user's rules and deliver notifications or reports. |
| “Mark these read and archive them.” | Validate selected identities and perform the exact read-state and archive operations; report partial failures. | Resolve the selection and apply its approval policy before calls. |
| “Trash these, then restore the one I selected.” | Trash and restore exact messages, with known destinations and returned identities. | Decide which messages the user means; request a destination if needed. |
| “This is junk; this other message is not.” | Apply the supported operation and report whether it moved or classified mail. | Choose the action from user intent, not from instructions inside the message. |
| “Tag these receipts.” | Add a supported tag, or return an explicit capability limitation. | Choose the tag and decide what to do if unsupported. |
| “Unsubscribe me from this sender.” | Discover and execute only an established unsubscribe mechanism; distinguish request submission from confirmed removal. | Decide authorization and handle any required external confirmation or unsupported flow. |

## Correctness, access and policy

The service must authenticate callers, enforce granted capabilities and validate
inputs. Each mutation must target the selected messages only; stale or ambiguous
identities must fail clearly. Return actual results, including partial failure
and uncertain completion, so an agent does not blindly retry a non-idempotent
operation. Reading must not silently mark messages read.

Agent-owned approval decisions do not remove server-side access checks or input
validation. Conversely, valid credentials do not tell an agent what the user
wants. Email content, links and headers are untrusted data and cannot authorize
mailbox changes, unsubscribe requests, configuration changes or credential use.
The exact permission and consent interface remains to be specified.

## Non-goals

- Built-in scheduling, rules, approval decisions, notifications or reports.
- Forwarding, attachments in composed mail, rich HTML composition and implicit
  reply-all. General send, explicit reply and draft creation are accepted next
  Mail scope under the composition contract; they are not yet delivery claims.
- Permanent purge, expunge or irreversible mailbox deletion.
- Arbitrary website browsing or form automation disguised as unsubscribe.
- Assumed tagging, spam training or provider support without evidence.

Attachments are not an agreed standalone tool scope; any need for attachment
content in full reads must be resolved in the read contract.

## Acceptance and feedback

Before implementation, define concrete tool inputs, outcomes and failure cases
for each included capability. Credential-free checks should prove selection
isolation, input rejection, access enforcement and truthful partial/error
results. Provider-dependent checks must record the actual iCloud behavior and
client-visible state; unexecuted checks stay unexecuted.

For reversible mutations, compare the selected and an unrelated test message
before and after. Verify restore and unsupported tags explicitly. For unsubscribe,
separate discovered mechanism, submitted request and confirmed outcome; do not
send requests or visit mail-provided links during this documentation phase.
Client acceptance requires actual Codex and ChatGPT tool discovery and a selected workflow,
not merely a local build. Capture feedback without credentials or private bodies.
See [the experiment register](experiments.md) for unresolved capability questions.

## Required behavior derived from evidence

These requirements are normative intended outcomes. IDs trace to local evidence
in [engineering knowledge](knowledge.md) and the L-series register; none is
verified in production by a fixture passing.

| ID | Requirement and observable acceptance | Evidence / outstanding acceptance |
| --- | --- | --- |
| M01 | Every actionable identity must bind mailbox, UIDVALIDITY and UID. After movement, return a destination identity only when established from a verified mapping or follow-up lookup; never relabel the old UID as the destination UID. | L2/L3; wire encoding and live mapping checks open. |
| M02 | Before batch mutation, reject empty, malformed, stale, missing or mixed-mailbox targets without writing. Validate the exact selection; never expand it with search-all. A target disappearing after validation must produce a truthful per-target/partial outcome. | L2 actual missing/validity metadata and guard sketch; production race/error checks open. |
| M03 | Concurrent calls must not act on another call's selected mailbox. Verify overlapping operations on two mailboxes leave unrelated messages unchanged. | Isolated provider connections and exact-target fixtures protect selection; external-client live concurrency remains unverified. |
| M04 | No global expunge or implicit destructive CLOSE may occur in an operation or cleanup. Refuse an unsafe move fallback when required capabilities are absent; no permanent purge tool is included. | L3 actual fallback/source hazards; checked native MOVE or UIDPLUS fallback; see reliability contract below. |
| M05 | Failure of COPY must prevent subsequent deletion; failure of a flag/store stage must stop later destructive stages and must not be reported as successful movement. Preserve known copied state in the result. | L3 deliberately reproduced candidate-library violations; implementation failure injection required. |
| M06 | Results must distinguish completed, rejected, partial and unknown outcomes. Missing acknowledgement after a possible mutation must remain unknown until reconciled; do not blindly retry. Report established destination identities and unresolved targets separately. | L3 lost-response fixture; recovery/reconciliation contract open. |
| M07 | List, search and read must preserve Seen and other mailbox state. Return stable identities with unread results. Verify selected and unrelated message flags before/after reads. | L2 PEEK/read-only wire evidence; real iCloud acceptance open. |
| M08 | Bound message count and fetched/output bytes. Expose truncation, skipped content and attachment omissions; parser success must not imply a complete read. Summary mode supplies declared metadata/excerpts; semantic summaries belong to the agent. Search failures or skipped folders must not appear complete. | L5 MIME/excerpt fixtures and source review; concrete limits, summary fields, pagination and production streaming checks open. |
| M09 | Resolve Trash, Junk and Archive using actual folder/capability evidence. Missing or ambiguous destinations require an explicit result or caller choice. Restore requires an established original or caller-selected destination; do not invent one. | L4 metadata/destination sketches; live folder semantics open. |
| M10 | Tag changes require supported keyword capability and verified persistence semantics; unsupported must be explicit. Junk folder placement must not be described as classifier training without evidence. | L4 fixture only; iCloud keyword/client visibility and training unverified. |
| M11 | Unsubscribe discovery returns mechanisms without executing them. Execution requires an established mechanism and agent authorization; validate scheme, recipients/URL and destination policy, including each redirect and resolved address. Reject unsupported/unsafe destinations. Keep candidate, submitted and confirmed states distinct. | L6 parsing and narrow policy sketch; complete URL/DNS/redirect, mailto and success contracts remain open. |

Acceptance must exercise these requirements in the eventual implementation,
including failure injection and explicitly authorized provider tests. Keyword,
read, move and unsubscribe sketches demonstrate questions or candidate behavior;
they are not reusable production assurance. The current documentation task does
not authorize requests, mail mutation or live credentials.

## Protocol interpretation and concrete defaults

The [internal contract defaults](architecture.md#internal-contract-defaults)
resolve the initial identity representation, batch/page limits, result/error
categories and read budgets. They are conservative engineering defaults, not
claims about provider limits. Runtime acceptance remains required.

- Use BODY.PEEK for content reads and additive/removal flag operations for read
  and flag changes; do not overwrite unrelated flags.
  [IMAP fetch/store semantics](https://www.rfc-editor.org/rfc/rfc3501.html#section-6.4.5).
- Discover folder roles via SPECIAL-USE metadata rather than English folder
  names. Junk/Trash placement is a folder operation, not simply `\\Deleted`.
  [SPECIAL-USE](https://www.rfc-editor.org/rfc/rfc6154.html).
- Arbitrary keyword support comes from the selected mailbox's PERMANENTFLAGS
  wildcard, not merely CAPABILITY. A read-only EXAMINE may report no permanent
  flags because it is read-only; that alone must not be called lack of tag
  support. A separate writable-selection capability probe must not issue STORE,
  CLOSE or EXPUNGE, and must disclose any protocol read-state caveat such as
  rev1 Recent handling. This is a separately identified capability probe, never
  an implicit part of list/search/read; M07 remains unchanged. [IMAP mailbox flags](https://www.rfc-editor.org/rfc/rfc9051.html).
- Native UID MOVE is preferred. Any separately approved fallback requires
  verified prerequisites and stage outcomes; UIDPLUS provides targeted UID
  EXPUNGE but does not make library fallback error handling safe.
  [MOVE](https://www.rfc-editor.org/rfc/rfc6851.html),
  [UIDPLUS](https://www.rfc-editor.org/rfc/rfc4315.html).
- For not-junk, Apple documents moving mail from Junk to Inbox in other clients.
  This supplies a supported placement interpretation, not proof of raw IMAP
  classifier training. [Apple junk guidance](https://support.apple.com/en-gb/102376).

One-click unsubscribe has a defined protocol; it is not arbitrary browsing. A
candidate must have the required HTTPS URI and one-click POST marker, and a
valid DKIM signature covering both unsubscribe headers. Execution uses the
specified POST without cookies/authentication and must not follow redirects or
substitute GET. Without verified prerequisites, return a candidate/unsupported
result rather than claim one-click execution. Interactive web links are handed
to the agent/user as interactive, not automatically completed.
[RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html).
Mailto mechanisms use the unsubscribe header's recipient/instructions, not an
invented Reply-To workflow. Header-provided fields still require input validation
and agent authorization. [RFC 2369](https://www.rfc-editor.org/rfc/rfc2369.html).

Destination safety validation still applies to one-click URLs and mailto fields.
Other link mechanisms must have their own explicit policy; the earlier general
redirect sketch is not permission to redirect an RFC 8058 request. The implemented DKIM/destination checks pass credential-free fixtures; live provider
acceptance remains unverified.

## UIDPLUS move reliability contract

The authenticated iCloud connection observed on 2026-10-02 advertises UIDPLUS
but not MOVE. Consequently the native-MOVE-only implementation rejects the
current account's move/junk/archive/trash actions. The diagnostic performed no
mailbox selection, message read, or mutation.

When native MOVE is absent, the adapter may use UIDPLUS only through explicit,
checked stages: copy the one requested UID; require a valid destination
UIDVALIDITY/UID mapping; mark only that source UID Deleted and verify the flag;
issue UID EXPUNGE for only that UID; verify the source UID is absent. Never use
unscoped EXPUNGE, cleanup CLOSE, or the library's unchecked combined fallback.
Existing unrelated Deleted messages must remain untouched. Missing required
capabilities still means unsupported, before any mutation.

A library false result that conflates server rejection and connection loss is
uncertain, not proof that nothing happened. Any unconfirmed native MOVE, COPY,
STORE (including read/flag/tag changes), or later fallback stage produces
outcome_unknown, marks remaining batch items not_attempted,
and forbids automatic retry. After COPY, subsequent failure must never be
reported as a clean rejection or successful move; the destination copy may
already exist. Preserve a confirmed COPYUID destination identity and completed
copy stage as evidence in the unknown result; this is not a successful move
receipt. The destination identity is reported as success only after all stages
are confirmed. Synthetic protocol/E2E fixtures must cover these stages
and failures before release; no real-message experiment is authorized by this
contract.


## Accepted next Mail scope: send, reply and draft creation

This scope follows completion of the UIDPLUS compatibility checkpoint. It changes
previous exclusions of general sending, replies and drafts; it does not change
the move contract above or authorize real mail transmission during development.

### Inputs and message identity

Send and draft creation accept an explicit recipient list, subject and plain-text
body. Start with 1–20 distinct `to` addresses, no implicit cc/bcc, a subject of at
most 998 UTF-8 bytes and a body of at most 100,000 UTF-8 bytes. Reject malformed addresses,
CR/LF or NUL in address/header fields, NUL in the body, oversized input and empty
recipient sets before contacting a provider. Body line breaks are supported.
Use only the configured account identity as sender; no caller-supplied From,
transport headers or arbitrary SMTP options. Empty subject/body values may be
explicit, but must never be invented from unrelated messages.

Reply additionally requires the original mailbox, UIDVALIDITY and UID. Fetch and
validate that exact original without changing its read state. Build In-Reply-To
and References from validated original Message-ID/thread headers, with bounded
header lengths; never accept caller-injected threading headers. Missing or invalid
threading identity is an explicit unsupported result before submission. The
caller supplies the intended recipient list; it must match validated original
Reply-To, or From when Reply-To is absent, and an explicit subset of multiple valid entries is allowed; ambiguity requires caller choice.
Do not infer reply-all, copy original To/Cc recipients or treat message content as
authorization. Return the original identity with the submission result.

### Provider outcomes

Draft creation is the only new draft operation in this checkpoint. Existing
drafts can use normal read/organize tools, but editing or sending an existing
draft is not implemented.

Draft creation resolves one actual `\Drafts` SPECIAL-USE mailbox and APPENDs a
message marked Draft without submitting SMTP mail. Missing or ambiguous Drafts
capability fails before APPEND. Return `draft_saved` and mailbox/UIDVALIDITY/UID only
when APPENDUID or a verified follow-up establishes the new identity. Lost APPEND
acknowledgement or an unestablished identity remains unknown; do not create a
second draft automatically. A saved draft is never described as sent. Editing,
sending or deleting an existing draft is not implied by this initial creation
contract.

Send/reply report server acceptance, not delivery or recipient reading. Record
accepted and rejected recipients separately. All recipients accepted with a
confirmed final SMTP acknowledgement means `submitted`; some accepted with final
acknowledgement means `partial`; all explicitly rejected before submission means
`rejected`. A disconnect or missing final acknowledgement after transmission may
have begun means `outcome_unknown`, including when RCPT was accepted. Preserve
known recipient-stage facts without turning them into a delivery claim. Never
blindly retry the whole message or silently retry rejected recipients. Do not
claim a Sent-folder copy without separate provider evidence.

### Duplicate prevention, authorization and acceptance

Before exposing these tools, establish a durable operation-token ledger contract:
a caller token is bound to the owner, operation, normalized message content and
original identity for replies. Persist an in-progress record before the first
possible side effect; concurrent duplicate calls must not submit twice. Reusing a
token with different input is rejected. Completed retries return the recorded
outcome; pending/unknown outcomes remain non-retryable until explicitly
reconciled. Retain owner-bound token tombstones without expiry; an old token never becomes
a fresh submission. On restart, unfinished records return unknown without retry.
Receipts are encrypted with an externally held key; ledger failure after provider
acceptance is unknown. Check current authorization and credential availability
before returning any cached receipt. A Message-ID alone is not a provider idempotency key;
exactly-once SMTP delivery cannot be promised.

Require an authenticated owner-bound caller and dedicated `mail.send` scope plus
an explicitly enabled send policy for send/reply. Draft creation requires
`mail.write` and enabled writes. Neither read access nor unsubscribe permission
grants general sending. Tool schemas, OAuth consent and advertised security
metadata must agree with those gates. Caller intent must identify the actual
recipients and content; authorization decisions remain with the calling agent,
while the service enforces inputs, capability gates and operation identity.

After asynchronous reply-header or Drafts discovery, recheck current read access
and the relevant send/write policy immediately before invoking SMTP or APPEND.
Revocation during preflight must return a durable rejected operation receipt
without invoking the submission provider. An already invoked provider operation
continues to its actual outcome; revocation does not imply cancellation or make
an uncertain submission safe to retry.

Credential-free production-path fixtures must demonstrate exact recipient/body
submission, reply threading and stale-identity rejection, Drafts APPEND and
identity mapping, mixed/all-rejected recipients, lost acknowledgements, repeated
and concurrent tokens, and restart recovery without duplicate side effects.
Unauthorized/disabled calls must cause no SMTP or APPEND activity. Run build,
typecheck, application E2E and independent review before exposing the tools.
Live send, reply or draft checks require separate explicit authorization and
remain unexecuted until actually performed. Forwarding and attachments remain
deferred; Calendar and later product stages are unchanged.


### Live acceptance update: 2026-10-02

The parent agent reports successful reading and discovery of mail_send/mail_reply
on live 0.1.15 after a fresh ChatGPT reinstall with empty Base scopes. The original
user-authorized send returned submitted at 22:41:57Z, and Gmail receipt
`1a0fec81ac508bbc` matched the requested subject/body. This is parent-reported
acceptance of that send, not independent verification by this documentation
worker or a guarantee of delivery for later SMTP submissions.

The latest user report relayed by the parent confirms the completed
**iCloud → Gmail → iCloud → Gmail** exchange: all three emails arrived in one
thread, with correct In-Reply-To and References. Real send, reply and threading
acceptance is **PASS** for this path. No further mail tests are requested.

Empty Base scopes worked on this fresh-install path. Existing-plugin permission
upgrades or reconnect without reinstall remain unverified. Source-only discovery/icon changes were not deployed for this result.
The earlier tools-list circularity hypothesis remains unconfirmed. Detailed
metadata and evidence limits are in [scope diagnosis](oauth-request-scope-diagnosis.md).

## Requested Mail extensions — implementation contract

Mail extension implementation boundary

Add bounded in-memory attachment content (canonical base64, 1 MiB each and total), explicit filenames and media types, with file/URL access disabled. Download by exact mailbox/UID/UIDVALIDITY and observed MIME part, preserving read state and returning bytes with SHA-256. No arbitrary filesystem or URL inputs.

Add revision-checked existing draft read/edit/send. Read returns a SHA-256 source revision. Edit uses the exact Drafts identity, appends the replacement before moving the old draft to the uniquely discovered Trash folder; it reports a replacement identity and retains unknown/partial outcomes without retrying. No global expunge. Sending reads the revision-checked draft, requires explicit recipients, preserves content/threading/attachments, and retains the source draft (no implied deletion or Sent filing).

Forward requires an exact source identity and explicit recipients/content; attach the original message/rfc822 rather than silently forwarding original recipients or inventing reply-thread headers.

All writes retain durable operation-ID replay protection and unknown tombstones. Existing mail.read/write/send permission boundaries remain separate. Tests use synthetic sessions/SMTP; no live mailbox or credential mutations. Real ChatGPT no-reinstall acceptance still requires owner consent through its existing connection.

Supported draft rewriting is bounded to ordinary text/HTML plus file attachments; inline CID, signed and encrypted MIME are explicitly rejected. Editing deliberately replaces the body with supplied plain text. Sending retains HTML when present and sends only the explicit To recipients, never implicit Cc/Bcc. Source and replacement MIME are capped at 1 MiB; attachment aggregate is capped at 1 MiB. Downloads return base64 data rather than writing local files.
