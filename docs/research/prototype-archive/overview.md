# Bun research playground

> Historical research archived on 2026-10-07. Commands and prototype paths below describe the original experiment, not supported commands in the current checkout. See [retirement and current replacements](../retired-prototypes.md).

Independent packages include [Calendar](calendar.md) and the closed
[Photos experiments](photos.md). Photos source remains research-only;
use the [capability plan](../../photos-capability-plan.md) for the accepted
local-provider architecture, current verification and implementation phases.

This directory is an isolated experiment, not production implementation. It uses
its own pinned dependencies and lockfile; it never imports the unfinished `src/`.

```sh
cd playground
bun install --frozen-lockfile
bun run test
```

Dependency installation accesses the package registry. The tests themselves use
only local fixtures and temporary `127.0.0.1` sockets, dummy credentials, and
reserved `.invalid` mail/link examples. They do not contact iCloud, open links,
send mail, read private configuration or start a persistent service. Plaintext
IMAP is intentionally limited to the loopback fixture; it is not a production
TLS recommendation.

`protocol.test.ts` runs the actual ImapFlow client against a tiny scripted IMAP
server and checks outgoing commands and parsed metadata. `headers.test.ts` uses
the actual mailparser library on MIME fixtures, followed by a deliberately small
classification sketch. That sketch is not a complete unsubscribe parser, URL
safety policy, signature validator or executable unsubscribe contract.

The original Bun 1.4.2 baseline passed six tests. The extended mail-only command
now selects files explicitly so independent auth/setup/runtime subtrees are not
accidentally collected. See [extended goals](mail-goals.md) and the
[experiment register](../../experiments.md) for the systematic round. The protocol fixtures expose read
commands, exact UID flag commands, MOVE fallback differences and folder/keyword
metadata. Passing an assertion about global EXPUNGE means the dangerous fallback
was observed as expected; it does not mean that fallback satisfies our product
requirements. The fixture does not model concurrent sessions or mailbox mutation
state, prove production UIDVALIDITY guards, or prove iCloud capabilities. Separate
policy sketches exercise candidate guard/folder/excerpt/URL decisions only; the
URL sketch uses a fixed fake resolver and is not a general SSRF filter.

See [research findings](../../research.md) for evidence, feasibility limits and
approach options. No production approach is selected by these experiments.
