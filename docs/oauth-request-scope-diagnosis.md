# OAuth request-scope diagnosis: 2026-10-02

Historical read-only evidence for the earlier ChatGPT client: client metadata and stored consent contain mail.read, mail.write, mail.send and offline_access. The canonical resource policy also contains all four after the resource reconciliation fix. Access-token metadata at 22:19:30Z and 22:19:58Z contains only mail.read/mail.write; both are linked to authorization codes, not refresh issuance. No token, authorization code or secret values were inspected. Historical authorization-request scope parameters were not logged and cannot be reconstructed from these rows.

The installed 0.1.15 provider composition was tested against temporary synthetic SQLite state, signed synthetic Passkeys and loopback HTTP. Command:

```sh
CP5_ARTIFACT_DIR="$PWD/.flow-runtime/native-instance/current" bun test apps/icloud/src/auth/scope-upgrade.test.ts
```

This imports installed code only; it does not load the installation configuration or database. The suite passes 1 integration test / 66 assertions.

| Isolated request | Observed result |
| --- | --- |
| Authorization asks read/write; stored consent has four | Token has read/write |
| Authorization asks four; token exchange includes scope read/write | Token has four; the code-grant handler does not use the exchange scope |
| Authorization omits scope | Application rejects with 403; bare pinned provider instead defaults to registered client scopes |
| Token exchange names an unauthorized resource | Rejected with 400 |

Those earlier observed tokens are consistent with narrower authorization requests; this remains an inference, not proof of the unrecorded requests. Broad existing consent does not force every later authorization to request all permissions. The deployed tools/list also hides send tools from tokens lacking mail.send, so clients may not discover the tool that would trigger a step-up challenge.

The tools-list/step-up circularity explanation remains a hypothesis, not a
confirmed cause of the earlier failure. The subsequent successful fresh-install
path below must not be attributed to the source-only discovery correction.

## Fresh-install acceptance reported by the parent agent

On 2026-10-02, the user freshly reinstalled with **Base scopes empty**. The parent
agent reports client `YByabnjWIiXQpCCaDEOrbNnkuPqoSzau` created at 22:38:05Z,
consent at 22:38:30Z and token issuance at 22:38:35Z, with `mail.read`, `mail.write`
and `mail.send`. The parent sees `mail_send` and `mail_reply`, and reading works.
Base scopes was therefore not required for this successful fresh-install path;
it must not be prescribed as a necessary workaround.

The original user-authorized happy-path send returned `submitted` at 22:41:57Z.
The parent reports receipt in Gmail (message ID `1a0fec81ac508bbc`) with matching
subject and body. This is reported live acceptance on deployed **0.1.15**, not a
new mailbox query or independent verification by this documentation worker. The
new discovery correction and icon changes remain source-only and undeployed;
this success does not establish their effect.

The latest user report, relayed by the parent, confirms the full
**iCloud → Gmail → iCloud → Gmail** exchange: all three emails were received in
the same thread, with correct In-Reply-To and References headers. Real send,
reply and threading acceptance is **PASS** for this fresh-install 0.1.15 path.
No additional live mail tests are required for this acceptance.

Reconnection or permission upgrade of the existing plugin without reinstall
remains unverified.
The earlier authorization-request parameters remain unavailable, so the earlier
root cause is unresolved. No configuration, grant, deployment or live-mail action
was performed as part of this documentation correction.

## Same-client source fix verification

Run `bun test apps/icloud/src/auth/scope-upgrade.test.ts` without `CP5_ARTIFACT_DIR`: 1 integration test / 78 assertions pass. The same already send-capable client first holds read/write access, discovers send through the source MCP catalog, and gets insufficient_scope without adapter execution. Refusing new consent leaves rights unchanged; accepting fresh explicit consent using that same client ID yields read/send access. Its old token remains insufficient. No re-registration is required for this path.

The separate old anonymous client whose registered ceiling excludes send still fails invalid_scope, and its unsupported owner update remains denied. The descriptor fix does not repair that separate ceiling. These are source-only tests, not installed 0.1.15 behavior and not a successful ChatGPT end-to-end demonstration. Refreshing metadata alone does not alter token grants; the real client must follow the challenge and request the additional scopes.

## Installed 0.1.16 lifecycle verification

The same command with `CP5_ARTIFACT_DIR` pointing to installed 0.1.16 now loads both its auth and MCP modules into the isolated fixture. The expanded test passes 1 / 90 assertions and strict typecheck. It verifies refresh scope escalation denial, successful scope-preserving rotation, replay rejection, rejection of the rotated successor after replay, explicit refresh revocation, access expiry and refresh expiry. Access validity is checked before changing expiry timestamps in the disposable database. Another original client's read token remains valid. This adds lifecycle evidence without reading or modifying live credentials or tokens and without sending mail. Actual ChatGPT token refresh/reconnect behavior remains outside this synthetic test.

## Mail extension verification boundary (2026-10-03)

Official OpenAI authentication documentation describes tool-level OAuth UI using resource discovery, per-tool securitySchemes, and error results carrying mcp/www_authenticate with error and error_description. This is a supported challenge/reauthorization mechanism; it does not establish that this account's existing ChatGPT connection completes the upgrade. Source: https://developers.openai.com/plugins/build/auth (read 2026-10-03).

The existing same-client synthetic auth/MCP lifecycle test is rerun with these changes. No production provider state or client ceilings are modified. The five new Mail tools use existing mail.read/write/send scopes, with mandatory read permission in every invocation. Real UI acceptance remains blocked on an owner-approved consent interaction in the existing connection. The acceptance must record that the connection/client is retained, an existing insufficient grant is challenged, fresh consent includes the intended scope, and subsequent permitted access succeeds. Do not perform a real send just to prove scope; use an explicitly authorized action or a validation-only rejected request after consent. Refresh alone is not evidence of an expanded grant, and a legacy registration ceiling may still reject it. Never delete/recreate the connection as a substitute for this test.
