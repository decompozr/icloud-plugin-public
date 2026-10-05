# Photos capability: active remote delivery plan and evidence

## Experiment completion reset and existing-session research — 2026-10-05

The owner resumed the full internal-API Shared Album task after rejecting an
incorrect experiment-completion claim. Completion means demonstrated true Shared
Album creation, rename, deletion, content add/remove, participants and permissions
through the existing main MCP, with exact identity and readback. Ordinary album
CRUD, successful authentication, compilation, fixtures and deployment do not satisfy
that acceptance. Retain the overall Photos goal and owner review/cleanup phases.

The existing owner-authenticated session remains the intended credential source.
Do not ask for another password merely because a provider request timed out.
Research of installed pyicloud 2.7.0 confirms that its Photos accessor calls
_request_pcs_for_service("photos") before constructing the Photos service. That
flow checks requestWebAccessState and may require service-specific PCS consent.
Our current transport has not verified that service-access layer. This is a
concrete missing diagnostic, not proof that this account requires new consent or
that it caused the legacy Shared Streams timeout. Apple describes separate web
access for protected data in https://support.apple.com/en-us/102651 . PyiCloud's
current documentation distinguishes modern Photos/Shared Library support from its
legacy Shared Album adapter: https://pypi.org/project/pyicloud/ . Do not equate
Shared Library or ordinary album mutations with true Shared Album lifecycle.

Next experimental sequence:
1. Through the existing main MCP, inspect web-access/PCS status with the saved
   session without automatically requesting device consent. Verify a minimal
   normal Photos API read against the account's advertised CloudKit service.
2. Compare the pinned provider's actual Shared Album request and account routing
   with the prepared request, including retained client parameters. Establish
   whether the target is legacy Shared Streams or modern shared collections.
3. Once reads work, verify the owner-authorized empty true Shared Album create,
   exact-ID readback, rename and deletion. Retain uncertain operation identities;
   no automatic write retry or speculative alternate mutation payloads.
4. Establish source-backed content and participant/access contracts. Obtain exact
   owner approval for a concrete harmless test asset and recipients before upload
   or invitations; the existing empty-album test is not blanket publication consent.
5. Complete the real main-MCP lifecycle acceptance matrix before labeling the
   experiment complete. Then continue full Photos production/review acceptance.

The 0.1.44 retained-parameter candidate is committed/pushed but not yet deployed.
Installed 0.1.43 remains a failed remote-inventory experiment. Avoid treating more
transport releases as evidence that the requested lifecycle is working.

## External implementation comparison and service-access contract — 2026-10-05

Inspected https://github.com/sweetrb/apple-photos-mcp source, not only its README.
Its src/utils/photos_reader.py reads album_info_shared and shared comments/likes
through osxphotos. cmd_create_album calls photoscript.PhotosLibrary.create_album;
its live-writes tests exercise ordinary albums and metadata. No true Shared Album
creation, invitations or access-management implementation was found. Its
remove-from-album rebuilds an ordinary album with a new identity, so that algorithm
must not be adopted for shared collections. This repository is a useful local-read
reference, not a solution or acceptance proof for the requested shared lifecycle.

Pinned local pyicloud 2.7.0 source confirms the exact read route is
/{dsid}/sharedstreams/webgetalbumslist; modern PhotosService still constructs that
legacy adapter. The current route therefore matches the provider source; no
alternate mutation route is justified by the timeout.

Before entering the Photos accessor, pyicloud calls requestWebAccessState on its
fixed setup service. Its subsequent flow can call enableDeviceConsentForPCS and
requestPCS and poll. A diagnostic must not call that accessor wholesale: it can
notify the owner and mutate consent/session state. Implement only the initial
status read through the existing account-bound main-MCP path, with the retained
session, bounded one-attempt transport, strict boolean projection and no raw
response/token exposure. Missing or malformed flags must remain unknown, not be
interpreted as permission granted. Preserve session-generation checks before and
after dispatch. Never automatically call either consent-enabling endpoint from
health. This contract is source-derived; actual account status is still unverified.

## Apple web-client request builders located — 2026-10-05

Further inspection of the retained public Apple Photos UI bundle found actual
request builders, beyond the previously inspected endpoint catalog. Private source
artifact: /tmp/photos-flow-handoff/apple-ui.main.js; SHA-256 389b79c2ba8630a86743e9057b7c8cf2dbcbfc3a83c0fc0cc20e044c33380796.
Revalidate its download provenance before treating it as current production Apple
behavior. These are source observations, not successful authenticated experiments.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Upload-to-existing-album fallback research — 2026-10-05

The owner accepts considering manual Shared Album creation followed by MCP upload
as a fallback. This does not replace full lifecycle scope or authorize a personal
upload. Verify upload separately before promising that manual creation unblocks it.

Inspected the installed pyicloud 2.7.0 class and resolved inherited methods:
SharedPhotoStreamAlbum has no upload, add_photo, remove_photo or create_album.
Its own delete returns False and rename returns None without sending a request.
is_web_upload_supported is a server metadata property, not an implemented uploader.
PhotosService.upload delegates to the root library or an album object's upload;
passing a SharedPhotoStreamAlbum does not supply the missing method. Therefore
this package can supply a Shared Album read baseline but not the requested upload
or lifecycle implementation. Upstream metadata identifies
https://github.com/timlaing/pyicloud as the installed package's source.
Do not port ordinary CloudKit upload or treat no-op rename as success. Research
actual Shared Streams or modern shared-collection upload contracts independently;
require exact destination, reviewed harmless asset, membership readback and separate
cloud evidence before claiming acceptance.

## Offline pinned-provider request execution — 2026-10-05

Executed pyicloud 2.7.0 PhotoStreamLibrary._get_albums against a fake session
(no network, account data or library mutation). It emits POST to the expected
DSID-scoped webgetalbumslist route with JSON {} and Content-Type plain/text.
The adapter previously used text/plain;charset=UTF-8. The candidate now matches
the provider's exact content type for inventory only, with regression assertions
for both transports. This is a verified request difference, not a verified cause
of the live timeout.

The candidate also adds a fixed, read-only requestWebAccessState diagnostic to
main-MCP Photos health. It uses the same sealed account custody and revocation
checks; only two boolean-or-null flags leave the backend. Missing/malformed flags
remain unknown. Consent-enabling endpoints are rejected. It runs concurrently
with inventory so diagnostics do not add another sequential 60-second wait.
Targeted checks passed: 15 TypeScript tests / 101 assertions, 10 Python transport
tests, and TypeScript typecheck. Live account status and deployment remain pending.

## Retained provider read parameters — 2026-10-05

Deployed 0.1.43 main-MCP inventory also timed out; changing the transport has not
established a fix. A credential-free root HTTP probe receives 400 promptly, so
basic HTTP reachability exists independently of the account API. No album write
was attempted and the authenticated session and existing Helper remain preserved.

Inspection of installed pyicloud 2.7.0 PhotoStreamLibrary._get_albums identified
its query parameters: retained authenticated clientId, dsid, clientBuildNumber
2534Project66 and clientMasteringNumber 2534B22. Our earlier read omitted them.
Candidate 0.1.44 now adds exactly those fixed provider params on read routes, using
the sealed session's client ID and validated DSID. No fresh ID, arbitrary query,
credential lookup or different account is introduced. Missing/malformed retained
client identity rejects before transport. Writes remain unchanged experimental
candidates. This source-backed difference requires actual main-MCP acceptance;
it is not yet proof of the timeout's cause or of supported Shared Album lifecycle.

## Read-only HTTP transport comparison — 2026-10-05

The deployed 0.1.42 main-MCP read also times out with the larger bounded deadline;
short latency is not established as the cause. The same call now confirms native
PhotoKit authorization 3/authorized=true, separately from sharing access. Retained
ordinary-album live evidence still records three applied/local-readback-verified
operations; its script and operation Helper remain present. No experiment was rerun.

Candidate 0.1.43 selects the Mac's existing HTTP/2-capable system curl for read-only
Shared Streams routes. It uses the same account, advertised host, cookies and
payload; secrets enter stdin, never process arguments. It disables curl startup
configuration, netrc use, environment proxies, redirects and automatic retries;
TLS verification, HTTPS-only routing, response-size limits and actor deadlines are
retained. Private temporary response files are removed after each call. Writes
cannot use this experimental transport and retain their existing one-attempt path.
Observed HTTP protocol is reported without provider content. This comparison tests
a transport hypothesis, not a supported Apple sharing claim. Main-MCP live read,
exact empty-album lifecycle, content/participants/access and complete Photos
acceptance remain open. Existing account custody and rollback are preserved.

## Bounded read latency experiment and recovery correction — 2026-10-05

Deployed 0.1.41 main-MCP health established shared_album_read_timeout before an
HTTP response. The request route matches the retained public client's DSID routing;
network-disabled preparation confirms cookies. Authentication and complete Shared
Album management remain distinct and unproven by a saved session.

Candidate 0.1.42 allows one read to wait up to 50 seconds inside a 60-second actor
and protocol deadline. Writes retain their 20-second HTTP/30-second actor budgets;
no implicit authentication or automatic retry is added. This is a bounded latency
experiment, not a claim that latency is the root cause. Exact readback/count calls
use the same bound. Crash reconciliation now waits through the complete write plus
three sequential readbacks and a recovery margin (240 seconds); the prior 90-second
grace could expire while a readback was still active. Regression coverage preserves
the interlock during that window. Continue actual reads through the existing main
MCP and preserve operation identity. No photo or album write is authorized by these
checks; the previously approved empty test still requires a successful remote read.

## Transport timeout investigation after port correction — 2026-10-05

Release 0.1.40 is deployed from main 18d23e6. The advertised default-port preflight
now passes, and account-bound request preparation contains the expected web-auth
cookie without Authorization headers. A connection-only diagnostic verified TLS
reachability to the account's advertised service without any photo API request or
credential transmission. Main-MCP inventory still fails before an HTTP response.
Candidate 0.1.41 distinguishes fixed connection/read-timeout/TLS/connection-failure
categories without recording exception text, URLs, cookies or raw provider bodies.
No Shared Album write has been attempted. The same authenticated session, installed
Helper, Photos scopes and rollback remain preserved. Remote acceptance is open.

## Advertised HTTPS port mismatch resolved in source — 2026-10-05

The deployed 0.1.39 main-MCP diagnostic localized failure to transport, before an
HTTP response. A network-disabled preflight of the existing sealed session found
that Apple's advertised service uses explicit standard TLS port 443. TypeScript
URL canonicalization accepted it; Python incorrectly rejected any explicit port.
The account and advertised route otherwise matched. No new login is required.

Candidate 0.1.40 accepts only absent/default HTTPS port 443, canonicalizes the
request route to the same origin as TypeScript, and continues rejecting all
nonstandard ports, account substitution and unadvertised hosts. Four actual
requests-transport fixture tests pass, including default-port canonicalization,
nonstandard-port rejection and no authentication/write retries. Deployment and
main-MCP inventory acceptance remain the next gates. No album mutation occurred.

## Deployed lifecycle experiment and live read failure — 2026-10-05

Release 0.1.38 was merged through PR36 and deployed from clean main f2790e7.
Installed payload readback and all 13 deployment diagnostics passed. Configuration,
existing signed operation Helper and the owner-authenticated custody were retained;
rollback is preserved. An actual invocation of the existing main MCP Photos health
reached the new remote inventory path but returned shared_album_readback_failed.
This is not remote inventory acceptance. No Shared Album mutation was attempted.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Account-bound MCP lifecycle experiment and authentication correction — 2026-10-05

This supersedes provider-selection notes below. The native daemon diagnostic
received a callback, but its transport response was failure code 1 with no body.
The actual mstreamd log rejects this diagnostic's exact PID for lacking the correct
entitlement. A callback did not establish access. The installed operation Helper
has no such entitlement and is preserved unchanged. No Apple entitlement is copied
and no rejection is bypassed. The owner-authorized web-session fallback is active.

The owner completed SMS verification on the existing account. Custody readback
confirms an authenticated session and advertised Shared Streams service; no
password or verification code was inspected or logged. Earlier UI instructions
incorrectly failed to distinguish SMS from a trusted-device pop-up. The saved
challenge used SMS. Actual pinned-provider tests now verify the phone endpoint,
nested code/phone payload and restored challenge headers, plus explicit SMS
redelivery. Private Admin reports the source, instructs SMS users correctly and
hides redundant sign-in while a challenge or authenticated session exists. A
nonlegacy trusted-device bridge needs a live socket; metadata restoration alone
cannot support it. That route remains unimplemented, not an Apple-wide limitation.

The experimental remote lifecycle is now integrated into the same Photos module,
Photos read/write scopes and verified invocation account context. Transport uses
only this account's sealed cookies, verified TLS, fixed advertised Apple service
routes, no credential lookup/implicit authentication/redirects/write retries, and
bounded responses/actor lifetime. Session revocation is rechecked before and after
dispatch. Operation IDs and creation GUIDs precede writes. Unknown results interlock
local and shared writes; reconciliation only reads. Owner rights, legacy/modern
collection separation, exact identifiers and an independent zero-count check gate
empty-album deletion. Acknowledgement requires separate server readback; observed
server metadata does not prove cross-device photo upload.

Important correction to earlier source claims: the retained public client files
establish lifecycle endpoint names and album/read models, but do not contain the
asserted create/rename/delete request builders. Write payloads are inferred
experimental candidates and require real acceptance. They must not be described
as source-verified or production-ready. Main MCP exposes explicit experimental
prepare/apply/status and remote inventory tools for the already-authorized bounded
empty true Shared Album test. Content, invitations and access-setting writes remain
future independently verified contracts; do not invent them or publish personal
test content. Overall Photos production acceptance remains open.

Release candidate 0.1.38 includes this experiment and the verification-source fix.
It is not installed until clean-main deployment and live readback are recorded.
The next gate is main-MCP remote inventory followed by the authorized empty Shared
Album create/rename/delete experiment, if the service accepts the contract. Preserve
the exact operation/album identity for reconciliation and cleanup on any failure.

## Native Shared Album backend investigation — 2026-10-05, latest direction

The owner requests implementation of full Shared Album management through the
operation Helper, not another assessment of its existing features. Keep remote
main-MCP operation, no computer control and no additional login as the intended
path. The web-session implementation below is retained historical work; do not
continue or require its login while this native route is being evaluated.
The owner has accepted private native APIs as a candidate, provided ordinary
permissions suffice and no system restriction is bypassed. The owner subsequently
authorized Apple Account primary-password/2FA web-session authentication only as
the last fallback if the existing native authorization route proves unusable.
This is the same account and MCP; passwords remain private Admin request-only.
Neither decision proves that either provider can perform the required lifecycle.

Public PhotoKit does not expose the complete requested headless lifecycle.
However, absence from public PhotoKit is not evidence that no native backend
exists. A new research-only runtime-declaration probe loaded MediaStream and
PhotoLibraryServices on the actual Mac. MSASConnection declares addAlbum,
modifyAlbumMetadata, deleteAlbumWithGUID, addAssetCollections, access-control
operations, public-access and multiple-contributor settings. The collection-share
backend also declares publication and server-side asset deletion methods. These
are undocumented private interfaces, not supported PhotoKit operations.

The probe only enumerates class methods and Objective-C type encodings. It never
constructs a service, invokes a selector, reads account/library state, opens UI or
performs a photo operation. Swift 6 compilation and actual enumeration succeeded.
The system Photos application's signed entitlements include mediastream daemon
access and private collection-share/write privileges. Their presence is a possible
access constraint, not proof the Helper must have all of them. Do not copy Apple
restricted entitlements, impersonate a system client or bypass a service rejection.
Neither authenticated service access nor any mutation has been verified.

Implementation sequence and gates:

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

If the native route requires unavailable Apple-only privileges or lacks a usable
contract, retain and report that concrete blocker, then use the owner-authorized
web-session fallback. Do not require another account or MCP, or switch to UI,
direct library-database writes or an unsupported production claim. The prototype
is source-only under playground/photos and is excluded from the installed Helper;
retain the existing signed Helper and consent identity. No production deployment
is warranted by interface enumeration alone.

## Active plan — revised 2026-10-05

This section is authoritative for remaining work. Earlier plans and checkpoints
below are historical evidence and are superseded wherever they require a native
catalog reviewer or equate source/build/deployment with remote product acceptance.
The full goal remains open. The installed service is 0.1.37, built from main merge 22acfe4; its preserved operation
Helper excludes both the catalog reviewer and posting UI research. Generic
authorization fixtures, reviewer removal/deployment and actual remote read acceptance
are verified; native write permission and full sharing/cleanup acceptance remain pending.

### API-only provider investigation and first contract slice — 2026-10-05

Read-only HTTPS retrieval of Apple's public Photos web application found the
Shared Streams create/update/delete request builders and service routing, including
client-generated album GUIDs and DSID-bound paths. Public sources are the
[Photos application bundle](https://www.icloud.com/applications/photos3/2636Build18/en-us/ui.main.js)
and [transport bundle](https://www.icloud.com/applications/photos3/2636Build18/en-us/main.js).
This is an undocumented protocol lead, not authenticated runtime acceptance.
No browser execution, cookies, credentials or private account data were read.

The current [pyicloud source](https://github.com/timlaing/pyicloud) routes album
creation to the primary private library; its legacy Shared Album delete returns
false and rename is a no-op. It cannot be adopted as proof of full management.
Modern Shared Collections also use a different CloudKit sharing path; compatibility
with the owner's existing destination must be verified, not inferred.

First implementation slice: encode source-supported create/update/delete request
contracts with a retained exact creation GUID, strict Apple service routing,
explicit authentication injection, no redirect or automatic write retry, bounded
responses and unknown-write semantics. Keep this internal until account-bound
session setup, operation ledger integration, remote readback and modern/legacy
capability evidence are complete. Do not expose a tool that merely fails in place
of the required Shared Album capability. Follow with source-backed participant,
permissions and content contracts, then real MCP test-album lifecycle and cleanup.

### Remote authentication implementation slice — 2026-10-05

Implement owner-only private Admin setup/login/2FA/recheck/revoke endpoints and
forms. Use an isolated optional Python environment pinned to pyicloud 2.7.0; setup
is an explicit owner action, never an MCP-request install. Existing osxphotos and
native Helper environments/identity remain unchanged. Login targets the selected
stable account's stored Apple ID, takes the password only in the private request,
uses verified TLS, never reads Keychain/browser cookies, and does not accept terms
or enable permissions implicitly. Password/verification codes are not persisted.

The Python actor restores only its own encrypted session and challenge state in a
private short-lived directory; serialize cookies/session tokens and supported 2FA
bridge state without a password. Store results using custody revision/generation
CAS after rechecking owner and account identity. Public responses contain phase
and capability advertisement only, not private material. Recheck uses the saved
session without a password; expiration requires explicit new login. Programmatic
2FA and real authenticated Shared Album support remain acceptance gates, not
inferred from fixtures. Add origin/owner/input tests and secret-redaction/revocation
checks, then integrate the operation ledger and complete content/participants/
permissions. No browser/native computer control and no photo mutation in setup.

### Remote authentication source acceptance — 2026-10-05

Private owner Admin now provides explicit dependency setup, account-bound login,
verification-code submission/request, session recheck and disconnect. Input is
bounded and owner/origin checked. Passwords and codes stay request-only; returned
session/challenge material is encrypted under the separate custody realm with
revision/generation checks. Saved client identity is restored before verification.
Expired tokens requiring a password invalidate custody; transport failures retain
recovery state. Setup commands have deadlines and preserve incomplete environments.
No setup operation invokes Photos, a native window, browser cookies or Keychain.

The isolated pinned provider's actual import initially failed because pyicloud
2.7.0 imports the Notes renderer and requires rich despite declaring it only as
a CLI extra. Declare rich 15.0.0 explicitly and check the actual provider import,
not distribution metadata alone. A task-owned Python 3.12 environment now loads
the provider and passes six authentication tests, including actual pinned-provider
construction/state restoration with network and Keychain access prohibited.
Existing reader/metadata tests pass in their unchanged osxphotos environment
(13 executed, two pinned-provider tests skipped there). An initial whole-suite run
in the authentication-only environment lacked osxphotos; it is not a reader failure.

Self-checks pass: 376 application tests / 2,439 assertions, 11 built HTTP/MCP tests /
259 assertions, 11 tooling tests / 141 assertions, both TypeScript checks and the
production build. An initial application test raced the build's replacement of
its plugin template; sequencing after build passed the complete suite. These are
source/fixture checks, not real Apple login, 2FA acceptance, Shared Album creation
or installed availability. Shared management readiness remains false until the
durable operation integration and authenticated readback are verified. The
installed runtime remains 0.1.36 until a separately verified main-source deployment.

### Authentication checkpoint deployment slice — 2026-10-05

Release 0.1.37 exposes the verified private owner authentication setup on the
existing service without replacing its operation Helper or changing Photos grants.
Build only from clean remote main after merge, retain stopped configuration/state/
custody backups, and verify installed payload, discovery, private route protection
and database integrity. The provider-session table may be added; existing Mail
custody and account/client grant rows must remain intact. Do not install an optional
provider environment or initiate Apple login implicitly. Owner setup/login remains
an explicit private Admin action. Preserve 0.1.36 rollback and keep full Shared
Album operation acceptance open after this deployment.

### Shared provider readback contract slice — 2026-10-05

Before connecting mutations, implement account-bound remote inventory and exact
album detail contracts from Apple's public Shared Streams client. Inventory uses
webgetalbumslist; detail uses webgetalbumview with exact albumguids. Retain server
album GUID, owner DSID and change tag, distinguish ownership from participation,
and preserve modern/encrypted collection indicators. An absent modern indicator
is a legacy candidate, not proof that mutation is supported. Bound responses and
reject missing/mismatched/duplicate identities, malformed models and wrong account
before accepting readback. Keep internal until encrypted-session transport and
durable main-MCP recovery are integrated; no credentials or server proof inferred.

### Authentication checkpoint installed acceptance — 2026-10-05

PR #34 merged release 0.1.37 at 22acfe4. Clean verified remote-main source built
the installed artifact; payload readback matches. Thirteen read-only doctor checks
pass. Both databases pass integrity; all existing owner rows, account credentials,
client grants, configuration and master custody remain unchanged. The empty
provider_sessions table is new; only the authorization resource's updatedAt changed.
Stopped 0.1.36 state/custody and its release remain available for rollback. The
operation Helper was not rebuilt and its executable hash remains unchanged.

Actual main-MCP health succeeds after restart: osxphotos 0.77.2 reads the selected
system library, native authorization remains 0/not-requested, and shared write/
server-sync verification remain false. Public cloud-setup routes return 404;
private routes without owner authentication return 403. The owner's private System
page is the login destination. No optional environment was installed there and no
Apple login, invitation, photo write or Shared Album creation occurred. Actual
authenticated UI/session acceptance remains pending owner action.

### Authentication integration boundary — 2026-10-05

There is one existing account and one MCP connection. Mail/Calendar app-specific
credentials, Mac-local Photos library authorization and a Photos web session are
different authorization mechanisms for that account. The provider-session table
is empty; the runtime has no established web session to reuse. The current web
provider needs an explicit Apple Account sign-in/2FA, not another account, another
MCP or a new app-specific password. This additional sign-in is a provider choice,
not a requirement for existing local Photos reads or a proven Apple-wide boundary.
Do not treat deploying a password form as owner acceptance of that architecture.
Explain the credential distinction and evaluate supported existing-authorization
paths before requiring the owner to enter a primary password. Do not extract Mac
or browser credentials to simulate single sign-on. Keep full Shared Album scope
open; preserve local reads and integrate authorization into the same account's
capability setup rather than presenting a second account connection.

### Existing native authorization path recheck — 2026-10-05

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The SDK also exposes PhotosUI Shared Album creation and customization controllers,
in addition to posting. Their public methods configure/present user-operated
sheets and receive completion; no headless create/customize/post method is exposed.
These can reuse native account authorization with human interaction, but do not
meet the required remote MCP/no-computer-control workflow. Do not launch a hidden
sheet or simulate clicks. The Photos scripting dictionary defines ordinary album/
folder creation and has no Shared Album, invitation or access-policy types.
Pinned osxphotos 0.77.2 inventories shared albums; its Photos scripting dependency
creates ordinary albums. None establishes complete headless Shared Album management.

The dictionary exporter could not run under the current command-line-tools
selection; selecting the installed Xcode for that process then reported an
unaccepted license. No license/global setting was changed. The application's
bundled Photos.sdef and existing SDK headers were read directly as source evidence.
This is source inspection, not a live successful operation or proof no future
provider can support the requirement. Continue the internal API-only provider and
durable operation integration; defer requesting real owner login until the bounded
MCP test lifecycle is concrete and reviewable. Existing local Photos use needs no
primary-password entry. The private /icloud/sign-in page was also read: it asks
for the existing owner's passkey and contains no password field. Do not confuse
Admin passkey authentication with Apple web-session authentication.

### Shared provider readback source acceptance — 2026-10-05

Internal remote inventory/detail now preserve exact server GUID, owner DSID and
change tag, classify owner/participant and modern/encrypted indicators, and reject
wrong/missing/duplicate/deleted exact identities. Responses are bounded; provider
diagnostics and unrecognized secret fields are excluded. A legacy candidate does
not establish edit support, a server response does not prove an operation caused
the change, and cross-device presence remains separately unverified.

Self-checks: ten protocol tests / 62 assertions, 381 application tests / 2,469
assertions, eleven built HTTP/MCP tests / 259 assertions, TypeScript and production
build pass. These contracts remain internal and use synthetic responses. They are
not connected to the installed encrypted-session transport or public MCP tools,
and no Apple authentication or Shared Album read/write was performed in this slice.

### Account-session custody integration slice — 2026-10-05

The existing owner store encrypts Mail app-specific credentials and supplies stable
account identity. Those credentials are not a Photos web session. Add a distinct
provider-session realm in the same authenticated owner custody store, with no
secret returned through MCP/Admin status, logs or capability discovery. Sessions
must bind owner, account, credential revision and monotonically increasing session
generation in authenticated encryption. Reconnect/login completion uses exact
revision/generation compare-and-swap; revoke and account credential changes must
prevent stale login completion or old session resurrection. Keep legacy Mail bytes
and encryption unchanged. No automatic credential reuse or browser-cookie import.

Acceptance for this slice: encrypted persistence across reopen; cross-owner/account
and realm rejection; tampered/transplanted ciphertext rejection; transactional
revocation and stale-completion rejection; unchanged Mail credential behavior.
This is storage infrastructure, not login or Shared Album server acceptance. Follow
with owner-only remote session setup/2FA, actual service advertisement/identity
checks, operation recovery, full management tools and the real disposable test.
No installation or live custody migration is implied by this source slice.

### Provider session custody implementation checkpoint — 2026-10-05

The owner store now implements the distinct encrypted Photos web-session realm,
binding owner/account/revision/generation and enforcing compare-and-swap on login
completion and revocation. Account credential changes atomically discard provider
session ciphertext and advance its generation. Existing Mail encryption remains
unchanged. Public session metadata contains no token/cookie material. Pending or
stored sessions do not establish provider readiness or authorized tool use.

Self-checks pass: 16 custody/storage tests / 107 assertions, 371 application tests /
2,410 assertions, 11 built HTTP/MCP tests / 259 assertions, both TypeScript checks
and production build. Fixtures cover encrypted reopen,
cross-owner/account/domain failures, transplanted/tampered ciphertext, stale login,
independently opened stores and transaction rollback preserving both credentials.
No installed database was migrated and no authentication/album mutation occurred.

Read-only source inspection confirms pyicloud has explicit non-authenticating
construction, cached session validation and programmatic 2FA entry points. Its
session material normally persists to files; the integration must keep those files
in private short-lived directories and seal sanitized session bytes in custody.
Do not import arbitrary browser cookies, read the user's Keychain implicitly or
reuse Mail credentials. The cached osxphotos Python has no pyicloud dependency;
provision a separately declared optional environment rather than altering/rebuilding
the existing Photos Helper. Owner-only remote login/2FA and full management remain
next, with actual server/account identity and modern/legacy evidence still required.

### Shared Streams internal contract implementation — 2026-10-05

The first internal protocol slice now builds source-supported create/update/delete
requests from exact saved GUIDs and routes them to a validated DSID-bound Apple
service origin. It rejects account substitution, arbitrary endpoints, hostile
origins and modern-protocol substitution before transport. Each mutation sends
once with redirects disabled, an abort deadline and bounded responses. Lost,
invalid, mismatched or failed responses preserve an unknown write outcome without
provider-secret output. Even a successful response is only acknowledgement,
requiring separate readback and cloud evidence.

This code is not connected to owner-facing MCP tools or deployed. It does not
supply authentication, durable operation identity, modern encrypted collection
management or participant/content coverage; those remain required. Initial
self-checks passed: five protocol tests, 366 application tests / 2,379 assertions,
TypeScript and production build. A subsequent modern-protocol rejection assertion
also passed with the five targeted tests (32 assertions); final checks are recorded
with the implementation milestone: 366 application tests / 2,380 assertions and
production build pass. All transport tests use synthetic responses;
no account session, album creation or personal photo write occurred.

### Full Shared Album management requirement — 2026-10-05

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Implementation order: establish a verified non-UI provider protocol and account
binding; define typed shared-album operations and exact prepare/confirm/apply with
persistent recovery; integrate scopes, tools and owner diagnostics through the
shared capability flow; validate complete CRUD/content/participant/permission
behavior with fixtures; then run the owner-authorized disposable Shared Album
lifecycle through real MCP and verify remote readback/cloud evidence. Record exact
created identity and cleanup only that test artifact after reconciliation. Do not
silently retry an unknown creation/post/invite/delete outcome. Existing local
reads remain usable while the shared provider is developed.

Acceptance must prove each management operation against a real true Shared Album
through this MCP, preserve account/grant boundaries, separately report local and
server/cross-device evidence, and preserve existing family assets/albums. A mock,
UI-only controller, ordinary album lifecycle or fail-closed placeholder does not
complete this requirement. Provider protocol/authentication remains unresolved;
research available SDK and provider implementations before writing a production
adapter. No browser/native computer control or Photos database edits are allowed.

### MCP-only operation boundary and test-album disposition — 2026-10-05

The owner explicitly requires Photos operations through this project's main MCP
only. No computer control, native UI automation, browser automation or manual
clicking by the agent may create, post to or clean up albums. The Swift Helper
remains an operation backend invoked by MCP, not a reviewer or a substitute UI
workflow. Direct native app launch/observation is not remote MCP acceptance.
Programmatic provider calls must preserve the same exact prepare/confirm/apply,
owner, scope, permission and unknown-outcome boundaries.

The owner requests a disposable test Shared Album. “Temporary” means our own test
artifact, explicitly cleaned up afterward; it does not request Apple's automatic
expiry setting. Create a true Shared Album with a distinct test name only through
a verified API reachable from MCP. Retain its exact scoped identity, verify its
shared type and empty membership, and keep invitations/link distribution out of
this test. Do not substitute an ordinary album. No personal photo upload is
implied; test content and any asset import/upload must be concretely reviewed
before execution. Cleanup must target only the recorded test artifact, after
outcome reconciliation and evidence preservation, leaving existing albums intact.

Current create_album is an ordinary PhotoKit collection operation. Installed SDK
headers expose Shared Album creation within a user-presented posting controller;
that does not establish a headless creation API. osxphotos album automation resolves
ordinary albums. No supported API-only Shared Album create/post path has yet been
verified. The earlier attempted native observation created no album and is now
excluded by the owner boundary. Resolving that observation is not a product step.
Continue provider/API investigation and independent read/review/lifecycle work;
retain actual Shared Album creation/sharing as unmet until verified.

### Same-connection scope upgrade correction — 2026-10-05

The owner explicitly rejects creating a second custom MCP connection merely to
add Photos. The accepted flow is the existing connection -> refreshed capability
metadata -> explicit consent for newly requested Photos scopes -> refreshed tools
and actual remote read. Connect another account is account selection, not a client
scope upgrade; that must be explained without prescribing duplicate connections.

The deployed failure was reproduced: the existing client requests enabled Photos
scopes but the authorization provider rejects them against its stored registration
ceiling. The underlying provider's owner-bound client-update API does not support
anonymous legacy clients. This is an implementation gap to resolve, not a reason
to require a new product connection or to silently grant new token permissions.

Implement an explicit, owner-controlled registration upgrade in the project's
shared capability administration flow. Validate the exact existing client and
currently enabled requested capabilities; reject foreign/shared registrations,
stale impact and disabled scopes. Record the approved registration change through
a supported project API with audit/recovery evidence. Do not manually patch live
OAuth tables, assign fictitious ownership, rewrite signed OAuth requests, mutate
existing consent/token scopes or bypass provider ownership checks. Establish the
registration-management contract before implementing its adapter. The owner then
refreshes/reconsents on the SAME connection. Verify original client identity,
unchanged old tokens, selected new consent and successful actual Photos invocation.

This correction supersedes earlier new-registration recovery instructions in this
plan for the owner's existing connection. Fresh DCR remains a supported test/setup
path, not a mandatory capability-upgrade workflow. The full goal stays open.

### Same-connection upgrade implementation checkpoint — 2026-10-05

The generic registration-management contract is now documented in the module
runtime contract. Connections presents a review/confirmation action for newly enabled
permissions on an eligible existing client. The shared private owner API applies an
atomic, audited ceiling update with a short-lived exact-impact confirmation. It
preserves anonymous client identity, existing consent, tokens and account credentials;
foreign/shared, disabled, unrelated and stale registrations are rejected. Existing
OAuth validation and explicit consent remain responsible for token issuance.

Self-checking fixtures cover the same legacy anonymous client obtaining Photos read
only after new consent, with Photos write deselected and old access/refresh grants
still lacking Photos. Transaction failure rolls back the ceiling and audit together.
Self-checks passed: 359 application tests, 11 tooling tests, 11 built HTTP/MCP
end-to-end tests, both TypeScript checks, production build, and 85 isolated browser
assertions (including exact upgrade/cancel/confirmation and preserved connection).
These checks do not establish acceptance by the owner's ChatGPT connection. The next
installed milestone must preserve the operation Helper identity, expose this action,
and verify owner confirmation -> SAME connection Refresh/new consent -> tools/read.
The full product goal and remaining roadmap phases stay open.

### Same-connection upgrade installed evidence — 2026-10-05

Runtime 0.1.35 is deployed from verified clean main c0699ac (PR 25). All 13
read-only deployment checks pass. The private served Admin bundle matches installed
bytes; public client administration returns 404, anonymous private API returns 403,
and private Connections redirects unauthenticated viewers to owner sign-in.
Both databases pass integrity; existing clients, consent and token rows, owner state,
configuration and custody bytes are preserved. Only a new empty registration-scope
audit table is added. Provider resource update time and rate-limit state are the
observed transient differences. Installation did not approve a registration update.

The operation Helper remains the existing 0.1.34 identity and binary. Native
readback reports authorization 0/not-requested; osxphotos reports a readable system
library. The legacy posting command rejects through Launch Services before UI or
mutation. Three task-owned operation Helper compile candidates were removed after
installed readback and source preservation; installed/rollback versions, private
journals and active worktree remain retained recovery dependencies.

Next owner action: open private Admin Connections, review and confirm the new
available permissions on the existing ChatGPT client, then Refresh and explicitly
consent on the SAME MCP connection. Verify actual tools and a Photos read afterward.
Do not delete/recreate the connection or add a temporary MCP for this production
upgrade. Native write permission, supported remote sharing, exact cleanup decisions
and all remaining end-to-end phases remain open.

### Actual remote read acceptance and cleanup coverage plan — 2026-10-05

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Cleanup review completeness implementation — 2026-10-05

Fingerprint groups now have bounded review parts (at most 1,000 IDs), with an
explicit original group size, part index and part count. Continuations keep the
first source as context; an exact remote subset can exclude that already-reviewed
reference. All source IDs remain retrievable by following the candidate-page
continuation. UUID order is stable when the local library is unchanged. Group
size/part metadata survives into durable remote review evidence; it is not exact
byte/motion equivalence or write approval.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Cleanup coverage installed and durable decisions — 2026-10-05

PR 27 is merged; runtime 0.1.36 is installed from verified clean remote-main
70f6726. Installed payload matches the artifact, all 13 read-only doctor checks
pass, and OAuth discovery advertises Photos read/write. Configuration, custody,
existing owner/OAuth rows and the operation Helper binary are preserved. Both
state databases pass integrity; only resource update time and rate-limit state
changed during installation/read checks. No native rebuild or permission grant
was performed.

The installed reader passes synthetic complete-coverage checks for groups of
1,000, 1,001, 1,999 and 2,000 sources. A real authenticated cleanup read returns
bounded candidates with original-group metadata and continuation. It reports 589
candidate review parts/signals in this snapshot, not 589 disposable photos.

After restart, the same authenticated MCP reads back the exact three keep
records with zero sharing selections and writeApproved=false. The comparison
summary accounts for all 263 sources: three kept and 260 without saved decisions.
There is no upload, photo edit, deletion, identity-confirmed shared membership or
server-sync claim. Remaining scenario and native permission gates keep the full
goal open.

### Goal and accepted product boundary

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Bun/TypeScript owns API/workflow, policy, review decisions and operation ledgers.
osxphotos is the primary provider for supported reads/operations. A small native
Helper supplies operations it cannot perform or fallback. It is not a second
photo-management product and must not require a local review window for daily use.
Native OS consent is an explicit setup exception. Python remains accepted and
pinned; existing person tags are used without face recognition or identity guessing.

Capability onboarding is generic across Mail, Calendar, Photos and future modules:
composition -> module policy/scopes -> OAuth discovery and client registration ->
explicit owner consent -> scoped token -> MCP discovery/invocation -> provider
result. See the [shared module contract](../apps/icloud/src/modules/README.md).
Neither enabling the host nor refreshing metadata expands an existing client
ceiling or grant. Provider permissions, registered/requested/consented/token scopes,
tool discovery and successful remote use are separate observations.

### Current evidence and gaps

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Ordered delivery and observable acceptance

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Generic diagnostics correction — 2026-10-05

The Connections diagnostics still enumerated only Mail/Calendar, despite Photos
being composed in the main runtime. This omitted Photos readiness and left recovery
copy naming only Mail/Calendar. Diagnostics now enumerate installed modules,
including read-disabled ones, and report Photos registration, consent and actual
provider-read evidence separately. Health, tool discovery and saved review decisions
cannot count as a Photos read. The local-library context stays visible.

Official OpenAI documentation confirms DCR occurs once per MCP connection and the
client is reused. Its supported developer-mode setup lets the owner add a separate
MCP connection; using that path for a new DCR registration is the next owner-visible
acceptance attempt, preserving the working connection. Metadata Refresh updates
the catalog; it is not proof of expanded registration or grants. The actual owner
UI and new client scopes still need readback before this gate can close.

Sources checked on 2026-10-05:
[Authentication](https://developers.openai.com/plugins/build/auth) and
[Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt).
Self-checks passed: 48 Admin/client-recovery tests, 451 assertions, including
8 readiness/provider-evidence tests with 58 assertions; production TypeScript and
browser build passed. Native UI inspection of the owner's ChatGPT app was denied
by the computer-use surface policy, so actual host setup must be owner-observed. The diagnostics correction is merged and deployed as 0.1.33 from main 9dff2d0.
All 13 read-only deployment checks pass. Both state databases pass integrity;
22 existing tables, owner/accounts/passkeys/credentials/grants/policies, custody
and configuration are preserved. Expected resource timestamps and transient rate
limit counters changed. The operation Helper was preserved, and its health still
reports authorization 0; library reads are ready. No personal photos changed.
The initial deployment script invocation used an older Python and failed at import
before any mutation; the existing pinned Python completed deployment. Actual
owner-visible diagnostics and new host registration/tool use remain pending.

### Sharing provider/build boundary audit — 2026-10-05

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The active Helper build still includes the isolated posting UI candidate even
though remote MCP preparation/application reject it. This contradicts the
nonshipping-research disposition above. The source correction excludes that UI and its launch path from the operation
Helper. Research source is retained in playground/photos outside the production
native build; historical TypeScript journal/status readback is preserved.
Compile the operation Helper and isolated research independently; remote posting
must remain explicitly unsupported. Preserve installed Helper identity on a
TypeScript-only update; change native identity only with actual consent recheck.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Latest live acceptance observations: no registered client, consent, access grant
or refresh grant includes Photos; Helper authorization is still 0. The library is
readable. Owner connection and native permission gates remain open.

### Immediate slice and boundaries

Owner: the receiver in this existing worktree; preserve the primary checkout and
all unrelated work. Standing Git/merge/deploy authorization applies within this
scope. Do not spawn another receiver or silently change conversation ownership.

Same-client Photos consent, loaded tools and actual remote reads are verified.
Continue exact remote review: first three sources are kept without sharing,
next three explicitly undecided, and six of the twelve not-found sources still
await displayed review, including four Live Photos requiring motion evidence.
Do not substitute probable matches or cached stills for sharing/motion proof.
Investigate an API-only true Shared Album create/post path before the requested
disposable-album test. Current ordinary album creation is not that path. Native
operations still require explicit OS permission; keep configuration, grants,
custody and installed rollback state preserved.

No upload, metadata change, deletion or test asset creation is implied by a build,
registration test, saved review decision or this plan revision. No computer control
or browser/native UI automation for Photos operations. No global reinstall or
dependency migration is needed. English repository/helper content; Traditional
Chinese conversation. The full goal remains active and incomplete.

### Prototype and lifecycle disposition

Remove the custom native catalog reviewer and current build/dispatch paths. Retain
historical journals, manifests and exact decisions for recovery. Retain necessary
Apple posting research as explicitly nonshipping evidence. Existing installed
releases and the previously authorized development helper are rollback/recovery
state until replacement validation resolves their dependency, not raw disposable
outputs. Remove superseded task-owned candidates after verified remote preservation,
inactivity and reference reconciliation; do not sweep shared temporary directories.

Dev/Build checks establish source/protocol contracts. Release/Install must verify
source commit, artifact bytes and actual running version. Update includes permission,
owner/account/grant preservation and compatible rollback. Uninstall removes only
owned capability resources and preserves Photos data. Mac sleep/offline availability
and server/cross-device synchronization must be reported honestly.

## Historical evidence and earlier plans

The following dated records preserve experiments and provenance. Their former
active next steps and source/deployment status do not override the active plan above.

## Decision

Keep the API and workflow in Bun/TypeScript. Use a version-pinned osxphotos
sidecar for local, synced Photos metadata. Introduce a small Swift/PhotoKit
helper only where official asset retrieval or supported mutations are needed.
Do not require web-search pairing for the initial release. Retain the direct
HTTP experiment as research; it is not the primary person-search provider.

The local provider requires a Mac with the selected Photos library and adequate
host privacy permissions. This is access to a synced local snapshot, not proof
of current iCloud server state. No claim of cross-platform or headless cloud
person search is made.

## Verified evidence

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

## Comparing originals with shared copies

Use staged evidence, preserving all candidate reasons and uncertainty:

1. Same scoped asset identity or an established original-to-shared relationship
   is strongest metadata evidence. Never equate IDs from different scopes.
2. Exact original byte hashes can prove equal files when both are available.
   Different hashes do not disprove the same capture after resizing or editing.
3. Generate candidates using normalized original filename, capture time,
   media type, duration where available, and dimensions/aspect ratio. Never
   accept filename alone; preserve duplicate candidates rather than picking one.
4. Compare preview image content after orientation normalization using perceptual
   fingerprints and a second similarity measure. This compares images, not
   identities or faces. Calibrate thresholds on known same-image pairs and hard
   negatives such as burst neighbors; no arbitrary threshold is a proof.
5. Route ambiguous pairs, crops, edits, and Live Photo/video variants for review.
   Stills alone cannot establish that motion or the full video was shared.

Return confirmed, probable, ambiguous, and not-found states, plus snapshot age
and coverage. Preview similarity improves confidence but is not a blocker for
shipping read-only search or the metadata comparison report. Do not use probable
matches to authorize deletion of originals.

## Delivery phases and acceptance

### Phase 1: read foundation for the read/write product

Use a bounded osxphotos JSON sidecar behind a typed Bun adapter. The initial
implementation uses a fresh process per request to avoid stale library caches;
a long-lived worker remains a performance optimization.
Pin dependency versions; validate every response and use fixed diagnostic errors.
Expose provider health, library discovery/explicit selection, person list/search,
asset query/detail, album list/membership and bounded previews. Return opaque,
provider-scoped asset IDs and pagination, not internal paths or raw database rows.

Person matching: Unicode normalization, collapsed whitespace and case-insensitive
lookup; exact normalized match first, unique partial match second, explicit
selection when multiple people match. Use existing annotations only. Date filters
use an inclusive start and exclusive end in a named timezone, separating capture
and import dates. Album type must distinguish ordinary, Shared Album and Shared
Library; duplicate album names require ID selection.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Phase 2: comparison and review

Expose a compare-to-album operation with candidate evidence and confidence.
Produce a private review artifact for the twelve not-found candidates and the
251 probable matches. Add optional preview comparisons; preserve multiple
candidates and account for Live Photos/videos. Invalidate cached results when
library state changes and recheck membership before subsequent actions.

Acceptance: every source asset appears exactly once in a result category;
ambiguous burst neighbors and transformed copies have meaningful regression
coverage; missing local previews cause an explicit unverified result. Reports
state local snapshot coverage, not guaranteed server completeness.

### Phase 3: separately verified sharing

Investigate supported ways to add selected assets to a true Shared Album.
Do not assume normal PhotoKit album writes or osxphotos reads imply this ability.
If only a user-assisted Photos flow is supported, expose it honestly.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The official posting interface takes `PHPickerResult` values, which have no public
constructor. A supported candidate is a photo picker preselected with the exact
asset identifiers, followed by the posting interface with a default destination.
`playground/photos/SharedAlbumReviewProbe.swift` typechecks this API path, rejects
changed picker selections and reports destination changes. It is a compile-only
probe, not a deployed tool or a successful upload. Preselected picker results have
empty item providers per the SDK; live posting must verify they are accepted.
The posting callback also does not establish cross-device cloud synchronization.

References: [Apple posting controller](https://developer.apple.com/documentation/photosui/phsharedalbumpostingviewcontroller),
[Apple preselected identifiers](https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/preselectedassetidentifiers).

Acceptance gate: with an explicitly selected test asset and destination, show the
proposed write, perform the authorized operation, then read back membership and
verify upload outcome. Persist operation identity; reconcile an unknown outcome
before retrying to avoid duplicates. No bulk upload before this gate passes.

### Phase 4: cleanup assistance

Generate review candidates for exact duplicates, near duplicates, blurred
captures, screenshots and potentially expired temporary material. Age, WhatsApp
origin or unfamiliar content alone must not determine deletion. Preserve
meaningful family/document photos and request clarification when intent is unclear.

Acceptance: user sees identifiable previews and reasons, selects exact asset IDs,
and approves a concrete batch. Revalidate those assets before a supported Photos
mutation. Report partial/unknown outcomes and recovery behavior. Never mutate
Photos.sqlite directly or automatically empty Recently Deleted.

## Product integration and lifecycle

- Dev: keep experiments isolated; implement a provider interface before coupling
  Photos to existing mail/calendar tools. Unit tests use synthetic metadata;
  opt-in real-library acceptance remains distinct.
- Build: Bun owns API/MCP contracts. Bundle sidecar code and a pinned dependency
  manifest; build/sign a Swift helper only if the selected feature requires it.
- Install: detect macOS and permissions, explicitly select a library, provision
  isolated dependencies through existing uv. Do not change users' global tool
  defaults as a routine plugin install; the current global uv change was explicit.
- Runtime: bind local transport narrowly, retain credentials/private previews
  outside Git with restrictive permissions, bound resource use and cache size.
  Avoid logging person names, asset paths or raw library responses by default.
- Update: test supported macOS/library schemas, retain an executable rollback and
  invalidate version-dependent caches. Report dependency and provider versions.
- Uninstall: remove only capability-owned runtime files with authorization;
  preserve Photos libraries, user exports and unrelated/global uv installations.
- Release: production integration, publication and rollout are a separate phase;
  this closeout does not deploy the experiment.

## Deferred research and retained state

Direct-cloud encrypted search requires bridge key provisioning, APNs/IDS
transport and device consent. It is deferred, not proven impossible. Swift-only
public PhotoKit person-name lookup has not been established. Shared Album writes,
content comparison, cleanup decisions and end-to-end upload completion remain open.

Keep the task worktree, installed dependencies, session cache and private reports
for implementation/recovery. Retain earlier private review images pending a
separate cleanup decision; they are not suitable for publishing. No temporary
files or unrelated worktrees were removed as part of closeout.

## Sources

- https://github.com/RhetTbull/osxphotos/releases/tag/v0.77.2
- https://github.com/sweetrb/apple-photos-mcp
- https://developer.apple.com/documentation/photos/phfetchoptions
- https://developer.apple.com/documentation/photos/phobject/localidentifier
- https://support.apple.com/guide/security/search-on-icloudcom-security-sec0057159bf/web

## Implementation checkpoint (2026-10-04)

Source now includes the optional shared-runtime Photos module and explicit config,
scoped person/date/album queries, cached previews, metadata comparison and cleanup
review candidates. Ordinary album creation/rename/add/remove, empty-album removal,
metadata replacement and asset deletion have prepared-plan/apply paths. Delete
uses a distinct OAuth scope. Durable plans enforce owner binding, expiry, state
revalidation, single execution and unknown-outcome retention. CLI/setup and build
asset copying are included; the installed server has not been changed.

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Shared Album additions are capability-gated by native collection resolution and
canPerform checks, not declared supported from read evidence. Full cloud upload
confirmation, perceptual comparison, automated blur scoring and reliable expiry
classification are still open. This checkpoint implements write workflows but
is not acceptance of the entire sharing/cleanup scenario.

## Live authorization and write follow-up (2026-10-04)

The owner granted Full Access to iCloud Photos Helper. Launching the bundled
binary directly incorrectly observed not-determined; launching the app through
Launch Services observed authorized (3). The runtime and setup status now use
that app launch path, with private temporary request/response files and no retry.
Application checks passed 167 tests / 677 assertions and the production build.

The real PhotosService prepare/apply pipeline created a uniquely named empty
test album, renamed it and deleted only that empty album. All three returned
`applied`, `localReadbackVerified: true`, `serverSyncVerified: false`. The scoped
album ID was derived from the creation result; no name-based deletion was used.
No existing photos, metadata or shared-album membership were changed. Private
operation evidence remains in `/tmp/icloud-photos-live-check/evidence.json` and
its SQLite ledger; neither is shipped in the repository.

Asset add/remove, metadata changes and asset deletion still lack live mutation
evidence. Shared posting remains a user-assisted API candidate requiring a live
picker/posting experiment, membership readback and synchronization verification.
The installed service has not been changed.

## Receiver pickup and next slice (2026-10-04)

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The shared-album probe now requires exactly one owner-reviewed asset, full native
authorization and an actual Shared Album identifier. Its host must retain the
delegate, supply presentation/dismissal callbacks, launch under the authorized
app identity, and call `abandon()` on window close. `start()` creates an exclusive
0600 append-only operation journal in an existing owner-owned 0700 directory.
Reusing an operation UUID fails; interrupted posting requires reconciliation.
Changed picker selection stops the flow. A second native confirmation precedes
posting, and a flushed unknown-outcome record precedes presentation. Completion
records the actual destination and never asserts membership or cloud sync.

Self-checking: Swift 6 typechecking and `git diff --check` passed. The controller
is still source-only: no host window was opened, no picker result was exercised,
and no upload occurred. The installed SDK confirms empty providers for preselected
items and that posting completion does not automatically dismiss the controller.
Live acceptance of those items remains unresolved.

Next: wire a bounded review window into the authorized app without breaking its
consent identity, then have the owner review the exact preview and destination
before any posting. Preserve the probe and journal for recovery until sharing
acceptance; integrate verified behavior later. Existing prototype/private evidence
cleanup remains deferred while product work and handoff gates are pending.

## Reconciled full-outcome delivery plan (2026-10-04)

### Outcome and acceptance

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

The entire outcome is accepted only when the installed capability passes the
owner scenario: existing person tags resolve correctly; all queried source
assets are accounted for in the comparison; the owner can inspect identifiable
previews and uncertainty; selected sharing reaches the intended real Shared
Album with separately recorded cross-device/cloud evidence; cleanup preserves
unreviewed assets and applies only exact approved selections; and setup, recovery
and installed-version checks are observed. Source tests, compiler success,
local write acknowledgement and handoff pickup are separate evidence categories.

### Evidence basis and accepted approach

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

### Scope, ownership and authorization

The current receiver owns product changes exclusively in the same task worktree
and branch. Preserve the separate primary checkout and existing private records.
No new runtime or global dependency installation is needed. Repository artifacts
remain English; communication remains Traditional Chinese; helper-owned native UI is English-only
per the owner's later explicit preference.

Implementation, local builds, read-only checks and owner-facing review preparation
are in scope. Personal uploads require concrete asset/destination review; deletion
requires exact selected assets and explicit batch confirmation. Unknown value is
a question for the owner, not a deletion heuristic. Deployment/publication,
conversation archive and worktree removal retain their separate authorization
and verification gates. Do not silently publish a test photo to family members,
bulk upload before sharing acceptance, empty Recently Deleted, remove private
evidence, reinstall existing dependencies or infer authorization from a probable
comparison match. No additional agent is a prerequisite for this plan.

### Ordered phases, dependencies and observable acceptance

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.

Phases 1 and 2 share the same native host and may be developed as one coherent
slice. Phase 5 can supply build/setup feedback throughout source implementation.
Later live-write and delivery details remain provisional until their preceding
evidence is available; this does not drop those phases from the outcome.

### Next executable slice

Objective: a bounded native review host plus asynchronous single-asset shared
posting sessions. Editable scope: `apps/icloud/src/photos/`, its optional runtime
wiring, and this plan/Photos README. The receiver is the sole writer. Existing
provider contracts, scoped IDs, operation ledger, Launch Services transport and
installed SDK are the prerequisites. Preserve prototype artifacts separately
from the product host; no additional dependency install is required.

Complete source wiring and crash/cancellation tests, compile/link the entire
native host, build a separate preview app, and run read-only health/setup checks.
Present exact previews and the actual destination to the owner before any upload.
Bound live posting acceptance to one reviewed asset, one operation identity and
one explicit owner action; a timeout/error stops that attempt for reconciliation.
If preselected providers are rejected, inspect the official picker behavior and
revise this slice using supported native APIs; do not fall back to private cloud
protocols, automated Photos UI posting or fabricated picker results.

Observable slice acceptance is a native review window that can be cancelled
without mutation, accurate permission status, stable operation recovery after
restart, and explicit unverified membership/cloud state. Complete upload/cloud
acceptance additionally needs the owner-reviewed live operation and separate
destination/cloud readback. Missing owner input defers only the dependent action;
remaining source, tests, packaging and review continue.

### Prototype disposition and lifecycle coverage

The receiver retains `playground/photos/SharedAlbumReviewProbe.swift` as a
compile-only API evidence artifact and integrates verified behavior into native
product sources. Existing historical experiment reports remain historical;
private manifests, previews and ledgers stay outside Git. Keep the authorized original helper as the rollback baseline. The owner explicitly
requested experimental-helper cleanup; the preview process was stopped and its
app/compiler-check outputs removed. Any future runtime build must be deliberate,
separately identified and checked for permissions; no preview remains active.

Dev/Build: isolated task worktree, synthetic regression fixtures and separately
identified native build evidence. Install: explicit selected library, existing
pinned uv/Python tooling, owner permission/recheck and optional configuration.
Update: immutable source/artifact identity, preserved prior runtime and permission
recheck after signing changes. Release: publication/merge/deployment gates above.
Uninstall: only capability-owned files within explicit authorization; keep user
libraries, exports and global tooling. Cleanup: reconcile useful evidence into
this plan and the README, verify any required remote preservation and inactivity,
then remove only authorized disposable artifacts. Handoff archive/sidebar/App
verification remains separate from product completion; old-root archive remains
unauthorized and pending.

### Receiver source milestone and verification limits

Source now wires native comparison/cleanup review, asynchronous single-asset
posting, durable selection/operation records, process-liveness checks and explicit
owner observations. Unknown sharing cannot be bypassed with another destination
or a previously prepared plan for the same source. A lost catalog launch response
can recover its exact selection from the private manifest and retain it in SQLite.
Cleanup pagination, messaging filename clues and Live Photo motion flags are
included. Native permission messages describe states without exposing raw codes.

Current self-checking: application tests passed 176 tests / 714 assertions;
six Python tests passed; TypeScript checking, application build, entire native
typechecking/compile/link and `git diff --check` passed. The latest native compile
check is an ignored executable, not an installed helper or GUI acceptance result.
Private validation logs and the prepared twelve-candidate review request are under
`/tmp/photos-flow-handoff/`; no personal asset IDs or previews were added to Git.

A staged preview helper returned `setup_opened`, but native UI observation failed
with `cgWindowNotFound`; a bundle-ID lookup is ambiguous because the preserved
original and preview share an identifier. A read-only diagnostic agent checked
source and official SDK/docs, confirming background `open -g` for interactive
requests and unchecked activation were material uncertainties. Interactive
commands now omit `-g`, native policy transitions are checked, and modern
activation is used. This is a source correction, not a verified live UI fix.
The currently running preview setup predates the final source milestone; retain
it and the original while owner visibility/permission input is pending. Do not
replace/re-sign a permission-pending app behind the owner's interaction.

The diagnostic was independent read-only investigation, not a complete product
review. Live native review, picker/posting acceptance, ordinary asset mutations,
asset deletion and cross-device/cloud evidence remain pending. No receiver photo
upload, personal metadata edit, asset add/remove, deletion, installed-service
change, push, merge or deployment occurred. Source checks do not settle those
gates. Continue with the owner-visible native acceptance slice before publishing
or treating the product scenario as complete.


### Active production goal and installation hardening (2026-10-04)

The owner explicitly requested a persistent goal to finish this roadmap and make
Photos production-ready. The goal covers phases 1–7 and remains active until the
installed end-to-end acceptance is observed. Source/build completion alone does
not close the goal. The receiver remains the sole product writer.

Setup now rejects nonempty runtimes before executing installation/build tools,
reserves the destination against concurrent setup, and preserves existing helpers
even when no venv exists. An explicit `--python` reuses an environment only after
checking Python 3.12, osxphotos 0.77.2 and photoscript 0.6.1. `--sign` selects an
operator-provided identity; the ad-hoc default remains clearly identified. Setup
verifies signing and writes a private source/executable hash and designated-
requirement manifest. Failed partial runtimes remain available for diagnosis.
No setup command or helper build was executed for this hardening slice.

Current self-checking: 178 application tests / 722 assertions passed, including
existing-helper preservation and concurrent-setup rejection; TypeScript checking
and application build passed; the existing cached Python dependency versions were
read back and match requirements. Native live acceptance, reviewed mutations,
cloud evidence, installed service configuration and deployment remain pending.

Production acceptance gates:

> Private user-validation details omitted. This sanitized record does not establish live-user acceptance.


### Decision coverage and installed-baseline inspection (2026-10-04)

Native review now records each source as undecided, keep or a purpose-specific
sharing/deletion review candidate. The service validates complete, unique source
coverage and selection consistency, and stores final decisions through restart.
These decisions do not authorize a write. Confirmed pre-post cancellation is also
retained when a later journal read is unavailable.

Current self-checks passed 181 application tests / 732 assertions, TypeScript
checking, application build and complete native source typechecking. No new
helper app/executable was created or launched.

A read-only inspection of the actual owned installation found `current` points
to `releases/0.1.28-darwin-arm64`; Photos is not configured. This supersedes older
0.1.19 installation notes for the delivery decision. The Photos worktree used an older application baseline at inspection. The
receiver has now integrated `origin/main` at `712ca37` (0.1.28) in this same
task worktree, preserving Calendar registration, reconnect/readiness diagnostics,
private administration and Photos assets/permissions. No main checkout or running
service was changed. A Photos release needs its own immutable version/artifact;
do not overwrite or reuse the installed 0.1.28 release directory.
The installed artifact metadata has no source commit field, so version alone
does not establish source provenance. No installed files were changed.


Integration validation: after synchronizing only the declared worktree-local
locked dependencies, 320 application tests / 1,978 assertions passed and
10 tooling tests / 134 assertions passed. TypeScript and application build passed.
The first application run raced an unfinished build and copied a template without
its Calendar skill; the sequential post-build rerun passed. The initial tooling
run lacked its declared local zod dependency; the frozen-lockfile install and
rerun passed. These are self-checks, not an independent release review or installed
acceptance. The installed target confirmation, native visible UI/permission gate
and exact owner-reviewed live changes remain pending.


### Cross-batch accountability and client delivery (2026-10-04)

`photos_review_summary` now accounts for an explicit source set across finalized
reviews, separating unreviewed, undecided, keep and purpose-specific further-review
candidates. It binds comparison decisions to the owner and exact album, survives
restart, and excludes pending/cancelled/legacy selected-only results. The latest
finalized review creation controls each source decision. Saved decisions never
claim current library state, sharing success or write authorization.

The `icloud-photos` skill is included in immutable application templates, configured
server downloads and exported client ZIPs alongside Mail and Calendar. It explains
service-Mac permission setup, tagged person queries, complete source accounting,
exact native posting review, unknown-outcome recovery and explicit deletion scope.
No user asset IDs or previews enter these artifacts.

Validation: application build/typechecking passed, 322 application tests / 1,991
assertions passed, and 10 tooling tests / 135 assertions passed. The archive tests
verify the Photos skill is present while unrelated files are excluded. These remain
source/packaging self-checks; installed and live native acceptance are pending.


### Production runtime candidate acceptance checkpoint (2026-10-04)

The current setup command built `apps/icloud/build/photos/production-runtime`
from the committed native sources while reusing the validated existing Python.
Compile/link, ad-hoc signing and strict signature verification passed. The private
runtime manifest's source and executable hashes were independently recomputed
and match; the candidate is not installed. No dependencies were reinstalled and
the original authorized helper remains unchanged with native health 3/true.

Candidate health returned authorization 0/false. Its interactive setup command
returned `setup_opened` without Photos changes, but native UI observation again
returned `cgWindowNotFound`; the native inventory reports the helper running.
This does not prove owner-visible UI, permission or onboarding acceptance. An
owner visibility/explicit Full Access action is pending. The task-owned candidate
and setup process are retained for that concrete gate, separately from the
previous preview/compiler outputs already removed at the owner's request.

No source/selected photo was uploaded, deleted or edited. Installed 0.1.28 remains
unchanged; service target confirmation and final immutable release identity remain
pending before deployment.


### Metadata failure containment (2026-10-04)

Source inspection found that a metadata readback mismatch was reported unknown
but did not stop later assets. Metadata batches now stop on either an exception
or failed readback, preserve each reviewed UUID, and explicitly mark remaining
assets `not_attempted`. Provider parsing retains those outcomes. A confirmed
wrong-open-library response is rejected before writes rather than ambiguously
locking the intent; correction requires a fresh reviewed plan.

Regression evidence covers failed readback and an exception after a partial edit,
verifying the next asset is untouched. Eight Python tests, 323 application tests /
1,995 assertions, TypeScript checking and application build passed. No live photo
metadata was edited. A candidate health read still reports authorization 0/false,
and its exact setup process remains running; owner visibility/permission action
is still pending. No setup relaunch or permission grant was inferred.


### Held Photos delivery candidate

Application/client version 0.1.29 is reserved locally for the Photos delivery
candidate, based on production 0.1.28. This is not a tag, publication, installation
or release acceptance. The candidate stays held until owner-visible setup,
permissions, reviewed live writes/sharing and installed scenario gates pass.
Do not overwrite the existing 0.1.28 release or infer deployment permission from
the candidate version. Check remote version availability again before publication.


### Held artifact and owner-action blocker audit (2026-10-04)

The immutable local server candidate is
`apps/icloud/build/photos/server-candidate-0.1.29`, built from source `f9da54f`.
Artifact inspection verified version/platform/Bun; a smoke check imported its
compiled Photos service/registration, exercised the saved decision summary with
synthetic IDs and verified writes remain disabled by read-only policy. Required
Python/native sources, runtime version and client skill are present; sidecars
match source byte-for-byte and test/fixture files are excluded. Private source/hash
evidence is `/tmp/photos-flow-handoff/candidate-0.1.29.json`. This smoke check
changes no Photos library and is not the installed owner scenario.

The existing installed 0.1.28 passed all thirteen GET/file-metadata doctor checks
without registration, tokens, credential reads, tool invocation or service changes.
Its current symlink remains on 0.1.28; no Photos release was published or installed.

The same native owner-action gate has persisted through candidate startup,
metadata hardening and artifact preparation. Current candidate health is still
0/false and the exact setup process is live. Automated native observation cannot
see the window; owner visibility/Full Access and service-target questions have no
recorded answer. Safe independent source/build/packaging work for this slice is
complete; the next mandatory native review/posting and reviewed disposable-data
write acceptance cannot proceed without owner input. Goal status is blocked by
that gate, not complete. Retain the original helper, candidate runtime/process,
held artifact and private recovery/evidence files for this explicit dependency.

Resume with the owner's visibility/authorization and service-target response.
Read back actual permissions, then open exact previews and obtain specific
asset/destination or disposable-test-data decisions. Only then complete live
posting/writes, cloud evidence, clean delivery/review gates and the installed
end-to-end owner scenario. Do not auto-upload, auto-delete or retry unknown writes.


### Helper language correction

The owner clarified that only the Helper UI must use English; conversation
replies remain Traditional Chinese. Removed bilingual Chinese strings from
helper-owned setup, comparison/cleanup, sharing and alert views. Apple-owned
system sheets retain their system language. Candidate authorization was still
0/false before the UI update; the original authorized helper remains preserved.


### Admin-owned permission flow (owner correction)

The owner-provided screenshot established the former setup window was visible;
`cgWindowNotFound` was an automation-observation limitation, not proof that the
app could not show a window. The owner then requested setup in the admin page as
steps 1–2–3, and English-only helper UI with Traditional Chinese conversation.

Removed the duplicate native setup window, its `review_setup` command and the
unreleased `photos_open_setup` tool. Admin now presents 1. library access,
2. Photos Full Access, 3. actual permission recheck. These are executable actions,
not instructions-only buttons. Authorization launches a fresh app instance so
arguments cannot be swallowed by an already-running helper. Supported native
comparison/cleanup and Apple posting flows remain; helper-owned strings are
English-only and system-owned sheets follow macOS language settings.

The obsolete setup process was stopped after matching its exact executable. A
replacement `production-runtime-admin` was compiled/signed/verified without
requesting access or modifying photos. Full source checks passed 323 application
tests / 1,998 assertions, TypeScript and application build; native typecheck and
compile/link passed. The earlier English-only build had a syntax error and was
not launched; the corrected admin-flow build passed. Existing held server/native
candidates with the old setup flow are superseded and must not be deployed.
Actual admin deployment and owner-triggered permission/readback remain pending.


### Remote conversation workflow correction (2026-10-05)

The owner clarified that daily Photos management must work remotely through the
agent. The Mac hosts the service; osxphotos is the primary supported provider,
and the native Helper supplies operations osxphotos cannot perform or fallback.
A host-side review window is not the owner product workflow. Initial OS consent
remains an explicit setup step. Earlier native catalog acceptance does not satisfy
remote review acceptance.

Remote review preparation now reads exact comparison sources or a bounded cleanup
page, with source details and evidence. Previews are returned through the existing
image tool in the conversation. Explicit owner decisions are saved durably, bound
to the review owner, purpose, exact source set and comparison destination. Keep and
undecided remain preserved; candidates still need separate write plans and explicit
confirmation. The public native catalog launch tool is removed while historical
review and uncertain-operation recovery remain available.

Remote Shared Album posting is unsupported and rejected before launching host UI,
including previously prepared posting plans. The Apple user-presented candidate
remains native operator evidence, not a remotely usable shipping promise. No
personal uploads/deletions are authorized merely by this workflow correction.
Installed version, actual client discovery/images, remote decision persistence and
reviewed provider mutations must be reported as separate acceptance gates.

Validation for this correction: 355 application tests / 2,263 assertions, eleven
built E2E tests / 259 assertions, eleven tooling tests / 141 assertions and the
production build pass. The MCP SDK client lists the corrected object-root schemas,
receives image content, saves exact read-scope review decisions and reads them back
without native launch or Photos mutations. Large cleanup groups can be reviewed
in exact subsets without silently claiming omitted sources. These fixture checks
do not prove the installed client's current OAuth consent, tool refresh or images.


### Remove the native catalog reviewer (2026-10-05)

Remote review replaces the custom Swift catalog window. Remove its source, helper
command dispatch, build input and provider/service launch paths; retain historical
journal/selection readback for recovery. The Helper retains native authorization
and supported photo operations; the Apple posting candidate remains isolated from
remote tools. Replacing the signed Helper requires actual authorization readback,
not an assumption that a rebuilt ad-hoc binary keeps consent.

Live client inspection found existing ChatGPT registrations predate Photos scopes.
Their registered ceilings and granted scopes contain Mail/Calendar, without Photos.
Fresh consent on those registrations does not add capabilities. A new client
registration with current Photos scopes and explicit consent is required; preserve
existing working grants and do not mutate signed authorization queries.


### Revised-plan phase 1–2 source acceptance (2026-10-05)

The real shared owner-auth fixture now upgrades declared module scopes, creates
a fresh anonymous client using dynamic registration defaults, traverses signed
account selection and Photos consent, accepts a read-only subset and verifies
the issued bearer principal. Requested Photos write is absent from the token
when unchecked; preexisting tokens remain without Photos. The old registration
ceiling tests remain intact. This establishes the generic server contract, not
owner-visible ChatGPT registration/tool refresh acceptance.

The custom Swift catalog reviewer, native command branch, build input and both
provider/service launch methods are deleted. Historical catalog journals and
selection readback remain supported using persisted fixtures; no obsolete launch
path is kept merely to test recovery. The operation Helper compiles, links and
passes signature verification with three native sources. The new build is a
candidate until main deployment and actual native authorization readback.

Production build, 355 application tests / 2,280 assertions and eleven built E2E
tests / 259 assertions pass. Generic auth coverage passes three tests / 174
assertions. An initial candidate setup rejected a relative destination before
creating output; the explicit absolute destination build subsequently passed.
Existing native permissions do not establish rebuilt-binary consent.


### Revised-plan deployment acceptance (2026-10-05)

PR #20 merged at 59154f8. The clean verified main source built application 0.1.32
and the reduced operation Helper. The installed native manifest contains only
PhotosHelper, SharedAlbumReview, ReviewJournal and Info.plist; no catalog reviewer.
Owned update selects 0.1.32. Config changed only the native-helper path, preserving
Mail/Calendar and Photos ceilings. Thirteen doctor checks pass, both databases pass
integrity checks, and 22 existing tables plus custody bytes remain unchanged.
Expected resource timestamps and expired diagnostic counters changed separately.
Stopped state/config/custody and old release/helper remain compatible rollback data.
The inactive superseded helper candidate was removed after reconciliation.

Actual rebuilt Helper health reports authorization 0/not-requested; library reads
remain ready. Explicit owner consent through admin is required before native writes.
No permission dialog or grant was inferred. Actual ChatGPT registration/Photos
consent/tool refresh remains pending, and remote Shared Album posting is unavailable.
No personal Photos mutation occurred. These gates keep the full goal open.
