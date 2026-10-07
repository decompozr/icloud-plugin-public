# Studio server and backend module migration

## Accepted outcome

Studio becomes the single server application: SvelteKit UI/Web routes, HTTP/MCP
ingress, composition and process lifecycle. No separate server app is introduced.
Pure backend functionality lives in `modules/account`, `mail`, `calendar`, `photos`
and `homekit`. Svelte components and presentation remain in Studio. Independently
executed native helpers remain apps. There is one installed service and one MCP
endpoint. Retire `apps/icloud` only when all consumers and packaging move.

The earlier [Svelte migration](svelte-migration.md) delivered the Web layer and
Fetch transport; it did not move the complete server into Studio. The remaining
gap is composition/lifecycle and backend source ownership, not missing UI.

## Constraints and acceptance

Preserve existing route URLs, public/private/local ingress isolation, owner/Passkey
identity, OAuth clients/grants, configured scopes, account IDs, SQLite schemas,
credential/session encryption and master-key custody. Accepted work must drain
before resource disposal; a disconnected caller must not cancel or retry an
accepted write. New source placement never grants a capability or Apple permission.
No real reset, provider write, native permission request or new connection is
needed for this migration. Retain compatible installed rollback and stopped-state
backup before each deployment. Remote-client/physical-device acceptance remains
separate from fixture, build, health and local asset readback.

Each phase must pass relevant source tests, built listener/integration checks,
artifact lifecycle and native upgrade/state readback; merge and deploy from clean
verified main. The owner tests the delivered phase. Advance only after `pass`.
The root task owner implements and self-checks; independent review is required
when security/lifecycle contracts change. Source-only extraction does not invent
new lifecycle behavior or a second module registry.

## Phases

| Phase | Gap and delivered slice | Exit gate |
| --- | --- | --- |
| 1 | Extract the account backend and its public service interfaces; reuse existing runtime contracts | Synthetic owner/Passkey/OAuth/revocation and custody/reopen tests, full build/tests/E2E, deployed preserved state; owner pass |
| 2 | Extract Mail, Calendar, Photos and HomeKit sequentially using existing module contracts | Tools, account isolation, scopes and disposal tests for each module; deployed read acceptance; owner pass |
| 3 | Studio assumes server/API/MCP composition, listeners and process lifecycle | Ingress/security, streaming, accepted-operation drain, startup/shutdown/restart; deployed owner/client acceptance; owner pass |
| 4 | Update release/install/doctor paths and remove the old app and transition adapters | Complete build/distribution/upgrade/rollback with no old app consumers; deployed final acceptance |

Later implementation details remain provisional; the agreed ownership and
observable acceptance do not. Existing `RuntimeModule`, scope/resource/tool and
invocation contracts are the source baseline for phase 2; move their ownership
with their consumers rather than creating a competing registry in phase 1.

## Phase 1 executable slice

Observed baseline: authentication factories and connection/grant logic are in the
old application's auth subtree; encrypted owner/account/session storage is in its
storage subtree. Authentication already returns handlers and receives caller-owned
SQLite, scope policy, owner lookup and credential-validation callbacks. UI rendering
adapters are separate but some backend types/helpers import admin/observability.

Move backend auth, local-owner custody and encrypted store into a server-only
account module; replace reverse imports with owned account contracts and pure
error helpers. Keep auth presentation/browser adapters in the existing application
until Studio composition moves. Existing application integration tests stay with
the application; standalone module tests follow their implementation. Expose a
public account facade. The host retains database/key provisioning and shutdown
ownership. Preserve all factory behavior and database identifiers.

Build the backend independently, consume its built facade from the transition
application and package its output into the same installed app. Reuse the existing
pinned Bun/dependencies; no global install, runtime or new persistent process.
Source dependencies, build output and artifacts remain distinguishable. Source
and fixture changes are verified before release; native trust checks are read-only.

No new prototype is required. Keep task evidence in ignored runtime storage until
verification/deployment outcomes are preserved here, then remove owned raw logs
and disposable build checkouts. Preserve the active checkout, standard releases,
protected stopped-state backups and concurrent work.

## Status

Phase 1 implementation and candidate verification complete; merge/deployment pending.
Phase 2 has not started. No owner pass for phase 1 yet.

### Phase 1 verification

- Full module/Studio/application/tooling runner: 561 tests, 5,041 assertions, zero
  failures. The extracted account suite contributes 39 tests / 358 assertions.
- Built HTTP/listener integration: 11 tests / 245 assertions passed.
- Packaged native lifecycle plus persisted synthetic OAuth scope upgrade:
  2 tests / 151 assertions passed. No new client registration or real provider
  write was used; these are fixture identities, not live owner acceptance.
- Account/application/Studio builds and typechecks pass; Svelte has zero errors
  or warnings. Account source has no app/UI reverse imports; changed docs resolve.
- Independent review identified a split-chunk facade path defect. Source-relative
  external imports were replaced with linking relative to each emitted file.
  Independent recheck verified all ten emitted references, built HTTP/application
  loading and shared OAuth mutation-queue identity; no remaining scoped blocker.
- The native helper code/build-input manifest matches the retained signed 0.1.90
  payload. Artifact staging performs signature/fingerprint preflight and reuses
  that exact bundle; this migration does not request native permissions or rebuild
  the helper. Deployment readback is recorded after the clean-main upgrade.

The review finding confirms why source build success is not installed-runtime
acceptance. The original failed built import/E2E attempt is superseded by the
corrected built integration and packaged lifecycle checks, not silently counted
as a passing run.
