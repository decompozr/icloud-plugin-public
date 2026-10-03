# Experiment register

Record questions, observable acceptance and evidence before turning an experiment
into a product decision. Never record an unexecuted check as passing.

| ID | Question | Acceptance / observation | Evidence and status |
| --- | --- | --- | --- |
| E01 | Is Bun available in the current shell? | The installed executable reports its version without installation or configuration changes. | Observed 2026-10-01: `bun --version` returned `1.4.2`. This does not validate the draft application. |
| E02 | Is this directory already a Git repository? | Inspect before initializing; preserve existing files and repositories. | Observed 2026-10-01: initial `git status --short --branch` reported no repository. Local `git init -b main` then succeeded. No commit or remote was created during that experiment. Subsequent repository initialization is recorded in project status. |
| E03 | What does documentation as source mean? | User agrees the source format and relationship to implementation. | Resolved by user: prose specs first; implementation follows the specs. Normal Bun compilation, no custom docs compiler. No experiment required. |
| E04 | Can Bun support the proposed MCP client/server flow? | After scope agreement, define a credential-free protocol handshake and tool-discovery check with explicit expected results. | Local runtime experiment assigned in the systematic round below; no client/provider verification claimed. |
| E05 | Which Tailscale connection route fits the initial Codex and ChatGPT clients? | Compare client reachability and exposure requirements before choosing Serve, Funnel or another route; any live exposure requires separate authorization. | Proposed only; no network or Tailscale check executed. |
| E06 | Which upstream behavior is safe to adapt? | Review selected upstream mail operations against agreed message targeting, read limits and tool correctness and agent/server responsibility boundaries before reuse. | Pinned three-reference source review completed; hazards and limits recorded in [research](research.md). No live mailbox verification. |
| E07 | Does iCloud support usable tags independently of folders and flags? | After authorization, test supported keyword advertisement, add/remove persistence and client visibility on a designated message; document unsupported behavior without relabeling folder moves as tags. | Proposed; not executed. |
| E08 | What do junk and not-junk operations actually do? | Establish supported special-folder operations and distinguish movement from spam classification/training; compare selected and unrelated messages and record destination semantics. | Proposed; not executed. |
| E09 | Which unsubscribe mechanisms can be offered precisely? | First use fixtures to classify mailto, one-click and ordinary links, malformed headers, redirects and absent mechanisms. Specify safe supported requests and observable outcomes before any live request; distinguish submission from confirmed removal. | Offline MIME/header sketch passed under Bun; no link visited or email sent. Supported execution contract remains unresolved; see [research](research.md). |
| E10 | How should trash/restore, archive and flags map to iCloud state? | Establish special-folder discovery, supported flag behavior and post-move identity; define restore behavior when the original folder is unknown without guessing. Verify reversible effects only on selected messages. | Proposed; not executed. |
| E11 | What does full versus summary reading return? | Agree content/summary representation, bounds, truncation and unread preservation; use fixtures to verify truthful output and stable actionable identities. | Proposed; not executed. |

The initial isolated credential-free playground ran six tests successfully (Bun 1.4.2);
see [research](research.md) for fixture limits and observed hazardous fallbacks.
Production feature tests, mailbox access, authentication interoperability and
Tailscale/Codex/ChatGPT connectivity were not exercised. Historical reports are
summarized in [project status](project.md); they were not rerun here.

Dots and other providers are deferred; no initial experiment or acceptance check
is required for them. No generic provider framework is proposed.

P0–P2 protocol experiments additionally observed PEEK/exact UID commands, move
fallbacks, UIDVALIDITY and folder/keyword metadata. These partially inform E07,
E08, E10 and E11, but do not fulfill their live provider acceptance criteria.

## Accepted setup flow: experiments still required

The [setup/authentication flow](setup-and-auth.md) is accepted intended behavior.
These experiments are proposed, not executed; the earlier IMAP/MIME playground
does not verify them.

| ID | Question | Observable acceptance | Status |
| --- | --- | --- | --- |
| E12 | Can private Tailscale enrollment and public OAuth login share the intended Passkey? | Demonstrate WebAuthn RP ID/origin alignment using the chosen addresses, including rejection of an invalid origin. | Unexecuted; origin design unresolved. |
| E13 | Do Codex and ChatGPT complete the chosen OAuth flow? | Verify client redirects, owner Passkey login, usable plugin tokens, revocation and rejected anonymous/invalid-token mailbox calls. | Unexecuted; compatibility not claimed. |
| E14 | Is first-owner bootstrap controlled and one-use? | Prove ownership before enrollment; demonstrate failure recovery and permanent bootstrap disablement after completion/restart. | Unexecuted; ownership mechanism unresolved. |
| E15 | Are stored mail credentials protected, recoverable and revocable? | Demonstrate server-only storage, no secret leakage, restart persistence and explicit rotation/revocation/recovery behavior. | Unexecuted; storage/key design unresolved. |
| E16 | Which Mac/Apple-container/Tailscale topology works? | Verify connectivity, private setup boundaries, persistence, restart and scoped shutdown for the selected topology. | Unexecuted; host/container placement unresolved. |

## Systematic local experiment round

Finite scope: complete or explicitly report limits for L1–L10 below. These local
experiments cannot satisfy live provider, browser, client or deployment acceptance.
An observed unsafe library result is a completed investigation with failed safety
expectations, not a product pass. Owners record actual commands and outcomes.

| ID | Goal | Expected observation / acceptance | Result / current status |
| --- | --- | --- | --- |
| L1 | MCP runtime under Bun | Actual SDK handshake, tool discovery and synthetic call with no production import or mailbox. | Completed actual SDK loopback handshake/discovery/tool checks; runtime worker reports 2 tests/19 assertions across L1 and process L10. |
| L2 | Message identity | Observe missing UID and changed UIDVALIDITY; a separate sketch rejects stale/mixed-mailbox targets before writes. | Completed locally: missing UID/rollover observed; sketch guard rejects stale/mixed-folder inputs. No production guard or live evidence. |
| L3 | Move failures | Capture COPY/STORE failure and lost-response behavior; identify partial or uncertain outcomes and no blind retry. A safe implementation must not delete after failed copy. | Completed with failed safety expectation: COPY rejection still triggers STORE/EXPUNGE; STORE rejection also expunges; dropped reply fails without retry. See research. |
| L4 | Folder/keyword/restore capabilities | Expose special-use and permanent flags; sketch explicit unknown/ambiguous folder and restore outcomes rather than guessed folders or training. | Completed local metadata/sketches: missing and ambiguous folders/unknown restore explicit; iCloud support unverified. |
| L5 | MIME bounds | Decode Unicode and multipart fixtures; distinguish full parse from explicitly bounded excerpt/omissions. | Completed local Unicode/attachment parsing and explicit excerpt sketch. Parser does not establish completeness or streaming bounds. |
| L6 | Unsubscribe discovery | Classify missing/malformed/duplicate headers and mechanisms; offline policy sketch rejects unsupported URLs and private-address redirects without making requests. | Completed header fixtures and fixed fake-resolver/redirect policy sketch. No complete network policy or request execution. |
| L7 | Passkey verification | Actual verifier accepts synthetic valid cryptographic fixtures and rejects wrong origin/RP/challenge; distinguish browser enrollment from verification. | Completed synthetic auth playground; see linked evidence below. |
| L8 | OAuth primitives | PKCE and signed-token verification accept valid synthetic data and reject wrong/expired inputs; no claim of full client interoperability. | Completed synthetic auth playground; see linked evidence below. |
| L9 | Bootstrap/storage | One-use ownership enrollment, restart persistence and protected synthetic secret storage/rotation; explicit recovery limits. | Completed local SQLite/encryption sketch: 4 tests/26 assertions; real identity/storage provisioning/recovery remain unresolved. |
| L10 | Lifecycle/container | Read-only runtime/topology evidence and local restart/shutdown feasibility; record unavailable container/live networking rather than install or activate them. | Process and container restart/persistence passed locally; direct container-IP HTTP worked, published localhost port failed. See outcome below. |

Goals precede dependent tests. The original M1–M4 mail goals predate their first
run; the table above groups those investigations into the shared L-series.

### Recorded outcomes for this round

- **Mail L2–L6:** `cd playground && bun run test`: 15 tests/67 assertions passed after review strengthened two checks
  on Bun 1.4.2. This includes prior baseline coverage. Unsafe fallback assertions
  reproduce failed safety expectations, not safe mailbox behavior. See
  [research](research.md) and [mail goals](../playground/extended-goals.md).
- **Auth L7–L8:** worker reports `bun test playground/auth`: 30 tests/49 assertions passed on
  Bun 1.4.2. Actual SimpleWebAuthn synthetic cryptographic verification and jose
  token checks are combined with clearly identified grant/PKCE models. An actual ephemeral loopback HTTP authorization redirect/token/resource roundtrip
  was also tested with a fake client. No real browser enrollment or Codex/ChatGPT
  OAuth connection was tested. See
  [auth goals and results](../playground/auth/README.md).

Remaining deployment/provider E-series criteria do not become verified merely
because their related local L-series investigation completed.

- **Setup L9:** worker reports `bun test playground/setup`: 4 tests/26 assertions
  passed. Separate processes raced one-use SQLite enrollment; synthetic credentials
  were encrypted, recovered after restart, rotated and locally revoked. Passkeys,
  real provider validation, production key provisioning and recovery are excluded.
  See [setup evidence and limits](../playground/setup/README.md).
- **Runtime L1/process L10:** worker reports 2 tests/19 assertions using actual MCP
  SDK loopback transport and a dummy process restart/persistence fixture. No cloud
  client or provider interoperability is implied. The corrected Apple-container fixture passed direct-IP HTTP and stop/start
  persistence; localhost port publication still reset. Bun-container compatibility
  remains unverified. See [runtime goals](../playground/runtime/README.md).

- **Container portion of L10 — partial success:** worker used only the running
  Apple container service and cached Alpine image. After correcting the temporary
  `nc` responder to consume request headers, HTTP returned counter `1` inside the
  container via loopback/container IP and from the host via the direct container
  IP. Stop/start preserved the bind-mounted counter and inside HTTP returned `2`.
  The host's published `127.0.0.1` port still reset connections (Errno54), despite
  the expected inspected mapping; the underlying cause remains unresolved.
  Alpine had no Bun, so no Bun-image/MCP container test occurred. Owned containers
  and temporary mounts were removed and final inventory was zero. No daemon,
  host-network or Tailscale changes were made. See
  [runtime evidence](../playground/runtime/README.md).

The finite local round L1–L10 has recorded outcomes, including unsafe behavior
and the unresolved localhost publication expectation. Live iCloud capabilities, real Passkey browser
setup, ChatGPT/Codex account linking, Tailscale/public routing and deployment
lifecycle are **not completed** by this round. Their E-series criteria remain open.

Independent review reran `bun test ./playground` after the mail assertion fixes:
**51 tests passed, 161 assertions, nine files** (mail 15, auth 30, setup 4,
runtime 2). This count covers executable local suites, not the failed manual
container experiment or any live acceptance requirement.

## Requirements derived from this evidence

| Evidence | Authoritative requirements | Acceptance still required |
| --- | --- | --- |
| L2–L6 and pinned sources | [M01–M11 mailbox contracts](mailbox-tools.md#required-behavior-derived-from-evidence) | Eventual implementation failure/concurrency checks and authorized live provider behavior. |
| L1/L7–L9 | [A01–A07 setup/auth contracts](setup-and-auth.md#required-authentication-and-storage-outcomes) | Real browser/client enrollment, production sessions/tokens/revocation, key management and recovery. |
| L1/L9/L10 | [D01–D07 lifecycle contracts](deployment-lifecycle.md#required-observable-outcomes) | Actual build, deployment routes, keys/state, host lifecycle and scoped uninstall. |

[Engineering knowledge](knowledge.md) distills observations and implications.
Requirements are intended outcomes; these links do not promote sketches or
candidate libraries to a selected implementation. Local outcomes above remain
unchanged; no tests were rerun for this documentation conversion.

## Follow-up resolution work

Reference architecture and standards research now inform
[concrete contract defaults and routing recommendations](architecture.md).
These close unspecified internal formats without claiming live provider support.
The local setup follow-up reports **5 tests/37 assertions**, adding fail-closed
missing-state/marker behavior, authenticated same-owner recovery and one-use proof
replay checks. See [setup evidence](../playground/setup/README.md). The earlier
51-test aggregate is historical; it does not include this follow-up or subsequent
auth-provider/runtime follow-ups. No aggregate rerun is claimed here.

Auth-provider follow-up: [isolated candidate evidence](../playground/auth-provider/README.md)
reports **1 test/15 assertions** for Better Auth 1.7.7 on Bun 1.4.2: real migrations,
HTTP discovery, native public-client registration, anonymous login redirect and
invalid-grant rejection. Successful owner/code/refresh/client integration remains
unverified. This narrows framework feasibility without selecting it.

Runtime follow-up completed: [final evidence](../playground/runtime/README.md)
records successful host-loopback proxy → direct container IP, restart/IP
rediscovery, and verified official Linux Bun1.4.2 dummy HTTP/persistence/shutdown
inside disposable Alpine. Required runtime packages were installed only inside
the owned disposable container. Native published-port forwarding still failed
with backend no-route evidence; its permission-related cause is unconfirmed.
All owned containers/proxy/binary/state were removed, inventory zero. No MCP/auth
application-in-container or Tailscale route verification is claimed. Runtime Bun
suite remains 2 tests/19 assertions; these manual follow-ups are separate evidence.

Independent review reran the current setup and auth-provider suites together:
**6 tests/52 assertions passed** (setup5/37, provider1/15). No new aggregate run
or manual runtime replay by the reviewer is claimed.
