import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { AdminState, AuthMode, ScopeLabels } from "./contracts.js";
import type { StudioPage, AdminModel } from "./transport-contracts.js";
interface KitServer {
  init(options: { env: Record<string, string> }): Promise<void>;
  respond(
    request: Request,
    options: {
      platform: {
        studio:
          | StudioPage
          | { kind: "api"; handler(request: Request): Promise<Response> };
      };
      getClientAddress(): string;
    },
  ): Promise<Response>;
}
/** One shared Kit instance, injected request context, no listener or secret environment. */
export async function createStudio(directory: string) {
  const { server } = (await import(join(directory, "server/server.js"))) as {
    server: KitServer;
  };
  await server.init({ env: {} });
  const files = new Map<string, string>();
  async function collect(path: string, prefix = "") {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const relative = prefix + item.name,
        absolute = join(path, item.name);
      if (item.isDirectory()) await collect(absolute, relative + "/");
      else if (item.isFile()) files.set("/" + relative, absolute);
    }
  }
  await collect(join(directory, "client"));
  const respond = (
    request: Request,
    studio:
      | StudioPage
      | { kind: "api"; handler(request: Request): Promise<Response> },
  ) =>
    server.respond(request, {
      platform: { studio },
      getClientAddress: () => "127.0.0.1",
    });
  return {
    async asset(request: Request): Promise<Response | undefined> {
      const path = new URL(request.url).pathname;
      if (!path.startsWith("/icloud/_studio/")) return;
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, {
          status: 405,
          headers: { allow: "GET, HEAD" },
        });
      const file = files.get(path);
      if (!file) return new Response(null, { status: 404 });
      return new Response(request.method === "HEAD" ? null : Bun.file(file), {
        headers: {
          "content-type": Bun.file(file).type,
          "cache-control": path.includes("/immutable/") ? "public, max-age=31536000, immutable" : "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    },
    async admin(request: Request, state: AdminState) {
      const { presentation, ...rest } = state;
      const model: AdminModel = {
        ...rest,
        modules: state.modules?.map(({ id, title, fields }) => ({
          id,
          title,
          fields,
        })),
        ...(presentation
          ? {
              presentation: {
                capabilities: presentation.capabilities,
                credentialStepLabel: presentation.credentialStepLabel,
                credentialHtml:
                  presentation.credentialStepLabel === "stepMail"
                    ? undefined
                    : presentation.credentialSection(true),
              },
            }
          : {}),
      };
      return respond(request, { kind: "admin", state: model });
    },
    auth(
      request: Request,
      mode: AuthMode,
      privateAdmin: boolean,
      scopeLabels: ScopeLabels,
    ) {
      return respond(request, {
        kind: "auth",
        mode,
        privateAdmin,
        scopeLabels,
      });
    },
    // Protocol APIs have their own authority checks. Kit page CSRF must not reject originless OAuth forms.
    api(request: Request, handler: (request: Request) => Promise<Response>) {
      return handler(request);
    },
  };
}
