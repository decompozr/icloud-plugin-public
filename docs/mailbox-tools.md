# Mailbox tools: vision and scope

This prose specification defines intended behavior, not implemented or verified
capabilities. It takes precedence over preserved code, skills and deployment
notes. Feature implementation remains paused.

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
| List and search mail | Return matching messages with stable actionable identities and explicit result limits. | Search fields, ordering, pagination and identity contract. |
| Read full or summary | Return the selected message's full available content or an explicitly identified summary representation. State omissions or truncation rather than implying completeness. | Full-body bounds, summary fields and whether summaries are structured excerpts or agent-generated prose; no embedded AI service is implied. |
| List unread; mark read or unread | Identify unread messages and change only the selected messages' read state. | Unread filtering and reliable state verification. |
| Trash and restore | Move selected messages into trash and restore selected trashed messages to a known destination without permanent deletion. | iCloud special-folder discovery, original-location tracking and destination selection when unknown. |
| Junk and not junk | Apply the selected junk/not-junk operation and accurately describe the resulting mailbox state. | Whether iCloud supports classification/training or only folder movement; do not equate them without evidence. |
| Tag and untag | Add or remove a supported categorization marker from selected messages, or clearly report unsupported capability. | Actual iCloud keyword/tag support and persistence; folders and flags are not silently substituted for tags. |
| Unsubscribe | Inspect available unsubscribe mechanisms and perform a supported, agent-authorized email or link operation with an explicit outcome. | Header parsing, mailto/link semantics, endpoint restrictions, redirects, confirmation requirements and success evidence. An arbitrary browser or guaranteed unsubscription is not promised. |
| List folders; move or archive | Expose actual folders and move selected messages to a specified or supported archive destination. | Special-folder mapping, destination validation and post-move identities. |
| Flag and unflag | Change only the selected messages' supported flag state. | iCloud flag semantics and how clients display them. |

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
- General sending, replies, forwarding or draft composition. Email transmission
  is limited to an explicitly supported unsubscribe-specific mechanism.
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
