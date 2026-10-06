import type { Handle } from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "./lib/paraglide/server.js";
export const handle: Handle = ({ event, resolve }) => {
  const studio = event.platform?.studio;
  if (!studio) return new Response("Not found", { status: 404 });
  if (studio.kind === "api") return studio.handler(event.request);
  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.studio = studio;
    event.locals.locale = locale;
    const response = await resolve(event, {
      transformPageChunk: ({ html }) => html.replace("%lang%", locale),
    });
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("x-content-type-options", "nosniff");
    return response;
  });
};
