# Mail domain contracts

This folder defines the data vocabulary and ports used by Mail services and
provider adapters. It has no transport, credential persistence or network ownership.
Use it when adding a mailbox operation or implementing a provider fixture.

`mail.ts` defines mailbox/message identities, bounded reads/search, operation
errors and session/gateway ports. Message identity combines exact mailbox path,
UIDVALIDITY and UID; sequence numbers and RFC Message-ID are not mutation keys.
`MailMoveRecovery.copiedTarget` preserves a confirmed destination-copy identity
on an unknown move outcome. Services and MCP results carry this evidence without
implying source removal or successful movement; it does not authorize a retry.
`outbound.ts` defines composition, send/draft results and ledger/provider contracts.
`extensions.ts` and `unsubscribe.ts` define extended-mail and unsubscribe contracts.

Services consume these interfaces; adapters implement them. Operation results
preserve rejected, partial and unknown outcomes rather than presenting uncertainty
as success. Domain changes must be reflected in [tool contracts](../../../../../docs/mailbox-tools.md),
service tests and provider fixtures. Pure type contracts are checked by TypeScript;
behavior is exercised by the neighboring services, adapter and MCP test suites.
There is no Calendar domain in this folder and no shared all-feature domain model.
