> Superseded path/runtime guidance: use [workspace layout](workspace.md).
> The initial app is HTTP-only in apps/icloud; old stdio/Node commands below are historical.

> **Preserved proposal — not validated setup instructions.** Feature work is paused.
> Bun is selected; the older Node/npm instructions below are draft material.
> [Project decisions](project.md) take precedence. Do not activate services from these notes.
> [Mailbox scope](mailbox-tools.md) supersedes any general send/draft or approval-policy
> assumptions below. Their preservation is not inclusion in the agreed scope.

# Operations and acceptance

## Development and build

Use `npm install` for initial setup and `npm ci` once the lockfile is present.
Run `npm run build` and `npm test` before deploying. Tests use fixtures/fakes;
they must not require or access a real mailbox. Changes to tool names, scopes,
config or plugin layout require corresponding documentation updates.

## Release and install

Keep `plugin.json` and package versions aligned. Include LICENSE and
THIRD_PARTY_NOTICES.md in distributions. Build the runtime and include required
production dependencies when distributing a local plugin; copying only the
manifest will not make a Node server runnable. Do not package `.env`, tokens,
logs, or personal mail. Publishing to a directory or registry is a separate
action, not a consequence of building.

For local development configure the client to run `node` with the absolute path
to `dist/index.js` and the repository as its working directory. Install the
portable plugin through the client's supported plugin flow after reviewing its
files. Cached installations need rebuilding/reinstalling after source changes.
For remote installation follow [remote setup](remote-setup.md). No global client
configuration is modified by this repository.

## Optional macOS background service

For the current Bun application, use the installed-artifact instructions in
[deployment lifecycle](../deployment/README.md#optional-native-login-service).
The [LaunchAgent example](launch-agent.plist.example) supplies an absolute Bun
executable, an installed `current` release entry point, and the required explicit
`--config` path. It does not source `.env` or rely on a login shell's PATH.
No LaunchAgent is installed or loaded by the repository tooling.

## Update and rollback

Record the deployed revision and preserve your private `.env` outside version
control. Stop the service, update only this checkout, run `npm ci`, build and
test, then restart. Review new scopes and tool behavior before granting them.
Refresh/reinstall cached plugin packages and rediscover tools in clients as
needed. To roll back, restore the previous revision and its lockfile, reinstall
its dependencies, build and restart. Do not overwrite unrelated configuration.

## Uninstall

Disconnect the ChatGPT/dots plugin and revoke its OAuth grant. Stop the process
or unload only this launch agent:

```sh
launchctl bootout gui/$(id -u)/local.icloud-mail-mcp
```

Remove only the plist you installed. Inspect `tailscale funnel status` and turn
off only this service's owned path mounts using `--set-path` (see the current
deployment guide); do not disable a shared port or reset unrelated Funnel routes. Revoke
the dedicated Apple app-specific password if no other service uses it. Remove
this plugin through the client UI and delete only this project's private config
and deployment files when no longer needed. Uninstall never deletes mailbox data.

## Acceptance and feedback

| Layer | Observable acceptance | Evidence to retain |
| --- | --- | --- |
| Offline | Build and tests pass without Apple credentials | Command result and runtime version |
| Auth | Missing, expired, wrong-issuer/audience tokens rejected; insufficient scope denied | Redacted status/error, no token values |
| Read | Folder listing and one selected message match iCloud | Message UID/UID validity, no copied private body |
| Write | Disabled by default; authorized mutation on a test message works only with scope and switch | Before/after state |
| Send | Disabled by default; only explicitly approved test message delivered once | Recipient confirmation, no credentials |
| Client | ChatGPT discovers tools and completes OAuth; dots can use installed connection | Client/environment and outcome |
| Lifecycle | Restart, update/rollback and scoped shutdown behave as documented | Revision and redacted status |

Offline success does not establish live acceptance. Record each live check as
unexecuted until the operator supplies credentials, provider, endpoint and client
access. Sending and mutation tests require explicit user authorization. Capture
errors without bodies, passwords, access tokens or authorization headers.

Included: local server, remote authenticated transport, portable plugin and
operator lifecycle guidance. Deferred: hosted authorization-server provisioning,
actual Funnel activation, account linking, live mailbox tests and public
publication. Multi-account routing, permanent expunge and attachment upload are
outside this initial single-mailbox deployment.

### Read-only diagnosis

Run `bun bin/doctor --config /absolute/path/config.toml --runtime /absolute/path/install/current` from the repository. It reads configuration and file metadata, then performs bounded GET-only discovery, unauthenticated MCP and route-isolation checks. It never reads the credential database/key contents, registers a client, requests tokens, invokes tools or changes services. Output is plain text with pass/fail/skipped results; exit 1 indicates a failed check. Container paths unavailable to the host are skipped. The local-machine vantage does not prove off-tailnet or ChatGPT reachability. Advertised scopes describe server discovery, not a client's consent or grants.

### Offline setup plan

`bun bin/setup-plan --mode native --public-origin https://HOST --private-origin https://HOST:8443 --instance /absolute/dedicated/instance` prints a validated fresh-install TOML template, a native LaunchAgent plist, and scoped route proposals. Use `--mode container` for Linux/container paths and proxy prerequisites instead of a LaunchAgent. The command is always dry-run: it makes no network calls, writes no files, starts no processes and has no apply option. It does not inspect occupancy or readiness. Review the intended owner identity, existing routes, runtime artifact and custody paths before deliberately provisioning anything. Never use its fresh-install defaults to overwrite an existing installation's settings or permissions.

## Relocating a checkout with a running native instance

Installed configuration can contain absolute paths into the checkout. Moving the
checkout requires preserving access through those paths until a separately
coordinated configuration migration. Retain a compatibility symlink at the old
checkout path and do not remove it while installed paths still depend on it.
Preserve the runtime directory, custody, state and file identities; do not copy a
live SQLite database as a migration method. Verify the same owned process and
read-only doctor checks before and after relocation. Folder relocation does not
authorize a service restart, credential change or new deployment.
