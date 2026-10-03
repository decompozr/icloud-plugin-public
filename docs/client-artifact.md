# Configured client artifact

The server release and client plugin are separate artifacts. Native/Linux server
packages contain executable service dependencies; `export:plugin` creates a
configured local Codex marketplace containing the remote MCP descriptor and
workflow skill. Neither export installs a client connection or publishes an app.

After selecting the service's public MCP URL, run from the repository root:

```sh
bun run export:plugin --url https://YOUR-HOST.ts.net/icloud/mcp --out /NEW/client-directory
```

The output includes `.agents/plugins/marketplace.json` and
`plugins/icloud-plugin/{plugin.json,mcp.json,skills/icloud-mail/SKILL.md}` with
license notices. Marketplace references resolve from the output root. The
exporter validates the concrete HTTPS `/icloud/mcp` URL, rejects embedded credentials,
and refuses to overwrite an existing artifact. It includes no tokens, Apple
credentials, configuration state or invented app registration ID.

The installed Codex CLI help confirms these commands for a local marketplace (not executed by this work):

```sh
codex plugin marketplace add /NEW/client-directory
codex plugin add icloud-plugin@icloud-plugin-local
```

Run them only when you intend to add the local marketplace/plugin, then complete
OAuth when the public service is reachable.
The root repository `mcp.json` intentionally has no configured server: it is a
portable source template. The exported descriptor has the actual URL.
[Official plugin format and marketplace documentation](https://developers.openai.com/plugins/build/plugins).

For ChatGPT, use the account/workspace custom remote MCP app connection flow and
enter that same public MCP URL. Exporting a local marketplace does not create a
ChatGPT registration, enable developer access, upload an app or assign an app ID.
The public endpoint and owner OAuth must be available before client verification.
[Official OAuth requirements](https://developers.openai.com/plugins/build/auth).

A configured local artifact has been generated for the selected host under the
ignored `.flow-runtime/` directory. Public routing/client installation remains
pending; its configured URL is not evidence of reachability. The running native
server remains on its previously reviewed immutable release until an explicit
update is prepared and verified.

Validation currently checks the artifact structure, path resolution, URL, preserved skill and absence of app mapping. It is not an official remote schema validator run or an actual Codex installation test.

## Standalone private plugin ZIP

`bin/export-plugin --url https://YOUR-HOST.ts.net/icloud/mcp --out /NEW/client-directory`
also creates `icloud-plugin.zip`. This ZIP has one `icloud-plugin/` root containing
the portable manifest, configured MCP descriptor, workflow skill, project-owned
icon and license notices. The surrounding `.agents` marketplace is not inside
the ZIP. Never upload the server runtime artifact, state, custody, or credentials.

Use this ZIP with a supported private plugin import/account-save workflow; it is
not a public directory submission. Import supplies metadata and the MCP endpoint,
not a server deployment or OAuth authorization. The server must remain reachable,
and the owner still signs in and grants access. Account/workspace availability
must be verified in the target client. The manual URL connection remains a fallback.

The exporter bounds files, creates a deterministic ZIP, rejects unsafe endpoints,
and refuses to overwrite destinations. Tests inspect its complete file list and
CRC integrity, configured URL, contained icon, and repeatable bytes. This is local
package validation, not acceptance by the hosted importer or public review.
[Official portable package format](https://developers.openai.com/plugins/build/plugins).

The private owner admin wizard offers an authenticated plugin ZIP download. Each request builds the archive from the installed release's allowlisted manifest, workflow skill, icon and license files, adding only the configured public origin's `/icloud/mcp` URL. Request Host, query parameters, credentials, tokens and runtime state do not enter the package. The download is private, no-store and does not register or validate a client connection; manual connection instructions remain available.

Local verification (candidate 0.1.14): ZIP integrity and deterministic six-entry contents passed extraction tests. The HTTP owner guard and download were tested using the actual installed candidate modules/template in a temporary installation (9 assertions), with a fixture owner session. Separate real owner-auth HTTP tests check the public route remains absent. This does not claim hosted importer acceptance, and no package was uploaded.
