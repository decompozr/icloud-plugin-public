import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import type { HttpLifecycle } from "./lifecycle.js";
import type { ReconnectCapture } from "../observability/reconnect.js";
export interface IngressContext {
  remoteAddress?: string;
  onFinish: (callback: (status: number) => void) => void;
}
export type FetchHandler = (
  request: Request,
  context: IngressContext,
) => Promise<Response>;
export interface FetchListenerOptions {
  origin: string;
  handler: FetchHandler;
  headers?: (
    request: Request,
    context: IngressContext,
  ) => Promise<Response | undefined>;
  bodyLimit?: (path: string) => number;
  lifecycle?: HttpLifecycle;
  reconnect?: ReconnectCapture;
}
class BodyError extends Error {
  constructor(readonly status: number) {
    super("Invalid body");
  }
}
/** Decode the same encodings as the old raw/JSON parsers; bound decoded bytes. */
async function body(
  req: IncomingMessage,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    if (
      Number(req.headers["content-length"] ?? 0) > 0 ||
      req.headers["transfer-encoding"]
    )
      throw new BodyError(400);
    return;
  }
  const encoding = String(req.headers["content-encoding"] ?? "identity")
    .trim()
    .toLowerCase();
  const decoder =
    encoding === "identity"
      ? undefined
      : encoding === "gzip"
        ? createGunzip()
        : encoding === "deflate"
          ? createInflate()
          : encoding === "br"
            ? createBrotliDecompress()
            : null;
  if (decoder === null) throw new BodyError(415);
  const sourceError = (error: Error) => decoder?.destroy(error),
    aborted = () => decoder?.destroy(new BodyError(400));
  if (decoder) {
    req.on("error", sourceError);
    req.on("aborted", aborted);
  }
  const input = decoder ? req.pipe(decoder) : req;
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of input.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > limit) throw new BodyError(413);
      chunks.push(bytes);
    }
    return length ? new Uint8Array(Buffer.concat(chunks)) : undefined;
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError(400);
  } finally {
    if (decoder) {
      req.off("error", sourceError);
      req.off("aborted", aborted);
      req.unpipe(decoder);
      decoder.destroy();
    }
  }
}
function headers(req: IncomingMessage) {
  const result = new Headers();
  for (const [name, value] of Object.entries(req.headers))
    if (value !== undefined)
      result.set(name, Array.isArray(value) ? value.join(", ") : value);
  return result;
}
async function send(res: ServerResponse, response: Response, method: string) {
  if (res.destroyed) {
    await response.body?.cancel();
    return;
  }
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);
  if (method === "HEAD") {
    await response.body?.cancel();
    res.end();
    return;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!res.destroyed) res.end(bytes);
}
/** Fixed-origin ingress. Complete bodies enter task tracking; partial bodies do not. */
export class FetchListener {
  constructor(private readonly options: FetchListenerOptions) {}
  listen(port: number, host = "127.0.0.1"): Server {
    const { lifecycle, reconnect } = this.options;
    const server = createServer((req, res) => {
      req.on("error", () => {
        /* Partial rejected bodies cannot crash the listener. */
      });
      const context: IngressContext = {
        remoteAddress: req.socket.remoteAddress,
        onFinish: (callback) =>
          res.once("finish", () => callback(res.statusCode)),
      };
      const run = async () => {
        if (lifecycle && !lifecycle.admit(req, res)) return;
        try {
          if (!req.url?.startsWith("/") || req.url.startsWith("//"))
            return await send(
              res,
              Response.json({ error: "INVALID_TARGET" }, { status: 400 }),
              req.method ?? "GET",
            );
          const url = this.options.origin + req.url,
            method = req.method ?? "GET",
            requestHeaders = headers(req);
          const early = await this.options.headers?.(
            new Request(url, { method, headers: requestHeaders }),
            context,
          );
          if (early) {
            req.resume();
            return await send(res, early, method);
          }
          const bytes = await body(
            req,
            this.options.bodyLimit?.(new URL(url).pathname) ?? 256 * 1024,
          );
          const request = new Request(url, {
            method,
            headers: requestHeaders,
            ...(bytes ? { body: bytes } : {}),
          });
          const invoke = () => this.options.handler(request, context);
          const response = lifecycle
            ? await lifecycle.track(invoke)
            : await invoke();
          await send(res, response, method);
        } catch (error) {
          if (!res.destroyed && !res.headersSent) {
            req.resume();
            res.setHeader("Connection", "close");
            await send(
              res,
              Response.json(
                {
                  error:
                    error instanceof BodyError
                      ? "INVALID_BODY"
                      : "REQUEST_FAILED",
                },
                { status: error instanceof BodyError ? error.status : 500 },
              ),
              req.method ?? "GET",
            );
          }
        }
      };
      const path = req.url?.split("?")[0] ?? "";
      void (reconnect ? reconnect.run(path, run, context.onFinish) : run());
    });
    return server.listen(port, host);
  }
}
export function guardHost(request: Request, origin: string, port: number) {
  const allowed = new Set([
    new URL(origin).host,
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  return allowed.has(request.headers.get("host") ?? "")
    ? undefined
    : new Response(null, { status: 403 });
}
