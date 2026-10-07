# Bun runtime experiments (isolated)

> Historical research archived on 2026-10-07. Commands and prototype paths below describe the original experiment, not supported commands in the current checkout. See [retirement and current replacements](../retired-prototypes.md).

Goals and expected observations, written before execution:

- L1: Exercise the real MCP SDK client/server over ephemeral IPv4 loopback with a synthetic mail tool. Initialization and tool discovery succeed; a valid dummy token allows the tool; anonymous HTTP receives 401; a missing fake message returns a tool error; an unknown tool returns an SDK error. Closing the client, transport and listener leaves no reachable listener. This tests interoperability in Bun, not cloud ChatGPT, OAuth or iCloud.
- L10: Start a child Bun process using an owned temporary JSON state file and loopback HTTP listener. A dummy counter persists across process restart; SIGTERM writes a shutdown marker and releases the port; the second process loads the saved value. Temporary state is removed after the experiment. This is not launchd or crash durability evidence.

Run `cd playground/runtime && bun install --frozen-lockfile && bun test`.
The Bun tests use only local fixtures and dummy values, with no production imports, personal configuration, credentials, cloud calls, Tailscale or containers. The separate manual container experiment below has its own bounded scope.

Additional bounded container goal (before execution): L10-container checks the
already-running Apple container service using only its cached Alpine image.
Expected: a dummy BusyBox HTTP endpoint is published only on 127.0.0.1; an owned
bind-mounted counter persists across stop/start; stopping removes reachability;
deleting only the experiment container and temporary directory restores baseline.
If Alpine lacks Bun, this does not establish Bun or MCP container compatibility.
Run manually with `python3 container-experiment.py`; it never starts the global
container service, installs software, pulls images, or uses Tailscale.

## Observed results

On Bun 1.4.2 with pinned MCP SDK 1.31.0, `bun test` passed 2 tests / 19
assertions. L1 completed actual SDK initialization, tool listing, fake read,
missing-message/unknown-tool errors, anonymous 401 and listener teardown. The
successful fixture uses a stateful session: reusing one stateless SDK transport
for multiple HTTP requests produced 500 during initialized notification. Also,
Bun's Node HTTP adapter required calling `close` before `closeAllConnections`;
the opposite order reported `ERR_SERVER_NOT_RUNNING`.

L10's dummy Bun counter survived one restart; both SIGTERM exits were zero,
shutdown markers were present and listeners refused connections after stop.
Temporary state was removed. No crash/atomic-write, launchd, TLS, OAuth, real
mail or cloud-client behavior is established.

## Container findings (including follow-up)

The cached-image experiment on the already-running Apple container 1.5.0 service
used arm64 Alpine digest
`sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6`.
128 MiB was rejected (200 MiB minimum); 256 MiB worked. BusyBox lacks `httpd`,
so the final fixture uses its supported persistent `nc -lk -p 8080 -e` mode.
The responder consumes all HTTP headers before replying.

Follow-up goal, recorded before execution: distinguish an HTTP fixture bug from
port forwarding failure by comparing inside-container wget and host requests,
then verify restart/persistence independently. Observed:

- Inside-container requests to loopback and the container IP returned `1`.
- The host's direct request to the container IP returned `1`.
- Host requests to the published `127.0.0.1` port consistently reset (`Errno 54`),
  despite inspected configuration confirming `hostAddress: 127.0.0.1`.
- Stop/start preserved the bind-mounted counter; inside HTTP returned `2`.
- Stopped host ports were unreachable. Each owned container and temporary mount
  was removed; final container inventory returned to zero.
- Cached Alpine has no Bun. The later pinned Linux Bun experiment below establishes dummy Bun HTTP execution; MCP-in-container remains unverified.

The result isolates the remaining failure to the localhost publishing path in
this environment, rather than the responder or basic host-to-container network.
Its underlying cause remains undiagnosed. The script exits nonzero for this
partial result; container restart/persistence passed, published HTTP did not.
No image pull/install was requested. No global container-service or Tailscale
configuration changed. This does not prove availability of cloud clients or
production mail hosting.

Additional topology goal (before execution): exercise a temporary Bun HTTP proxy
bound only to host 127.0.0.1, forwarding to the container's inspected IP, with its
target refreshed after restart. Expected: HTTP counter1 before restart and2
afterward, clean SIGTERM, no remaining proxy listener. This avoids modifying
Apple's global forwarder permissions and does not establish Tailscale behavior.

Linux Bun goal (before execution): download the pinned official Bun1.4.2 Linux
arm64 musl release into an owned temporary directory, verify the GitHub release
SHA256, mount its binary read-only into the cached Alpine image, and run only a
dummy Bun HTTP counter. Expected: Linux Bun reports1.4.2; direct-IP HTTP works,
restart retains the counter; all downloaded and running artifacts are removed.
No image pull or global configuration is needed; the disposable-container library dependency discovered below is installed only for this experiment.

## Publishing diagnosis and working local alternative

The owned-container system logs show Apple's forwarder failing with `No route
to host (errno: 65)` while the same target succeeds from the host process.
[Apple issue2029](https://github.com/apple/container/issues/2029) records this exact
published-port-reset/direct-IP-success pattern and associates it with macOS
Local Network permission for `container-runtime-linux`. This is a strong
hypothesis here, not a confirmed permission-state reading. No TCC database,
permission switch, daemon restart or network setting was changed. The operator
can inspect System Settings → Privacy & Security → Local Network →
`container-runtime-linux` before choosing whether to grant access.

Apple's [tutorial](https://github.com/apple/container/blob/main/docs/tutorials/start-here.md)
also documents access through the container's IP. A temporary Bun proxy bound
to host127.0.0.1 forwarded to that IP successfully: response1 before restart,
response2 after restarting the container and rediscovering its changed IP.
The proxy exited0 on SIGTERM and its listener closed. This establishes a working
local route without Apple's published-port forwarder. A durable implementation
would need IP rediscovery or stable discovery; none is installed here.

Command: `python3 playground/runtime/container-experiment.py`. Native publishing
still fails, so the script deliberately returns a partial/nonzero result even
though its lifecycle and Bun proxy checks succeed. The script resolves the
actual Bun executable instead of an asdf shim before stripping child environment.
All owned proxy/container/state resources were removed after the final run.

The bare Alpine run revealed Bun musl's required `libstdc++.so.6` was absent.
Follow-up uses `apk add --no-cache libstdc++` only inside the disposable container
from its official Alpine repositories, captures installed library versions, and
removes the container afterward. This changes neither the cached base image nor
the host. The official Bun binary SHA256 remains pinned and verified.

## Linux Bun observed result

`python3 playground/runtime/bun-container-experiment.py` passed: Bun1.4.2 reported
`platform: linux`, `arch: arm64`, HTTP counter1 then2 across restart; SIGTERM
wrote the matching shutdown marker, stopped state was confirmed, and stopped
endpoints were unreachable. The official archive SHA256 is
`71760b6c8ea30623b81a4907cb815d48e2ea266f2e73e751534a44a0607950df`.
The final script pins the observed Alpine dependencies `libstdc++=15.2.0-r5`
and `libgcc=15.2.0-r5`. No production imports or real mail are involved.

Provenance: [official Bun installation](https://bun.com/docs/installation),
[Bun1.4.2 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2),
[release metadata/checksum](https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v1.4.2).
Bun is MIT-licensed; third-party components retain their respective licenses.
The downloaded binary was used only in an owned read-only mount, then removed;
no binary is redistributed by this playground. The Alpine packages were removed
with the disposable container, leaving the cached base image unchanged.

This closes dummy Bun-on-Linux/Apple-container feasibility, persistence and
signal cleanup. It does not test the MCP SDK inside Linux, mailbox credentials,
production durability, launchd, Tailscale or cloud-client access.
