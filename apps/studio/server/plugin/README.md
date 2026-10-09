# Client plugin artifact

This subsystem produces the downloadable client ZIP for this configured service.
`package.ts` validates the configured public endpoint and selects allowed template
files; `archive.ts` constructs the archive. The private owner-management route uses
this package rather than shipping server code or local state to a client.

The flow is trusted packaged template + validated public origin → configured client
manifest and allowed assets → ZIP. No Apple credential, owner database, custody key
or runtime configuration belongs in the result. The caller owns access control;
archive generation itself is not authentication or installation.

[Client artifact](../../../../docs/client-artifact.md) specifies the content and
export workflow. Colocated package tests verify URL and artifact boundaries.
Downloading a ZIP does not establish that ChatGPT/Codex imported it, completed
OAuth or can reach the endpoint. The artifact includes Mail and optional Calendar workflow skills. Both use the
same MCP endpoint; including Calendar guidance does not enable the module or grant
its independent read, write, schedule or share permissions.
