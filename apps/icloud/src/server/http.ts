import type { ReconnectCapture } from "../observability/reconnect.js";
import type { ReadinessEvidence } from "../admin/evidence.js";
import { HttpLifecycle } from "./lifecycle.js";
import {
  FetchListener,
  type FetchHandler,
  type IngressContext,
} from "./listener.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ModuleRuntime } from "../modules/runtime.js";
import type { Config } from "../config.js";
import type { Principal } from "../auth/verify.js";
import { createVerifier } from "../auth/verify.js";
import { createServer } from "../mcp/server.js";
const reply = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });
export function createHttpApp(
  config: Config,
  runtime: ModuleRuntime,
  verify = createVerifier(config),
  lifecycle = new HttpLifecycle(),
  evidence?: ReadinessEvidence,
  reconnect?: ReconnectCapture,
  fallback?: FetchHandler,
  fallbackHeaders?: (
    request: Request,
    context: IngressContext,
  ) => Promise<Response | undefined>,
): FetchListener {
  const resource = config.publicUrl,
    metadataPath = "/.well-known/oauth-protected-resource/icloud/mcp",
    metadataUrl = new URL(resource).origin + metadataPath;
  const principals = new WeakMap<IngressContext, Principal>();
  return new FetchListener({
    origin: new URL(resource).origin,
    lifecycle,
    reconnect,
    bodyLimit: (path) =>
      path === "/icloud/mcp" ? 2 * 1024 * 1024 : 256 * 1024,
    headers: async (request, context) => {
      const path = new URL(request.url).pathname;
      if (path === metadataPath) return;
      if (path === "/icloud/mcp" || path.startsWith("/icloud/mcp/")) {
        const host = request.headers.get("host")?.toLowerCase(),
          allowed = [
            new URL(resource).host,
            `127.0.0.1:${config.port}`,
            `localhost:${config.port}`,
            `[::1]:${config.port}`,
          ];
        if (!host || !allowed.includes(host))
          return reply({ error: "Invalid host" }, 403);
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(resource).origin)
          return reply({ error: "Invalid origin" }, 403);
        try {
          const principal = await lifecycle.track(() =>
            verify(request.headers.get("authorization") ?? undefined),
          );
          principals.set(context, principal);
          evidence?.observe(principal);
        } catch {
          reconnect?.noteError("invalid_token");
          return reply(
            { error: "A valid owner access token is required" },
            401,
            {
              "www-authenticate": `Bearer resource_metadata="${metadataUrl}", error="invalid_token"`,
            },
          );
        }
        return;
      }
      return fallbackHeaders?.(request, context);
    },
    handler: async (request, context) => {
      const path = new URL(request.url).pathname;
      if (path === metadataPath && ["GET", "HEAD"].includes(request.method))
        return reply(
          {
            resource,
            authorization_servers: [config.issuer],
            scopes_supported: runtime.allowedScopes,
            bearer_methods_supported: ["header"],
          },
          200,
          { "cache-control": "no-store" },
        );
      if (path === "/icloud/mcp") {
        if (request.method !== "POST")
          return new Response(null, {
            status: 405,
            headers: { allow: "POST" },
          });
        const parsed = JSONRPCMessageSchema.safeParse(
          request.headers.get("content-type")?.split(";")[0]?.trim() ===
            "application/json"
            ? await request.json().catch(() => undefined)
            : undefined,
        );
        if (!parsed.success)
          return reply({ error: "Invalid MCP request" }, 400);
        const principal = principals.get(context);
        if (!principal) return new Response(null, { status: 401 });
        const server = createServer(
          runtime,
          resource,
          principal.scopes,
          (operation) => lifecycle.track(operation),
          { ownerId: principal.subject, accountId: principal.accountId },
          (tool) => evidence?.start(principal, tool),
        );
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        try {
          await server.connect(transport);
          return await transport.handleRequest(request, {
            parsedBody: parsed.data,
          });
        } catch {
          return reply({ error: "MCP request failed" }, 500);
        } finally {
          await transport.close();
          await server.close();
        }
      }
      return fallback
        ? fallback(request, context)
        : new Response(null, { status: 404 });
    },
  });
}
