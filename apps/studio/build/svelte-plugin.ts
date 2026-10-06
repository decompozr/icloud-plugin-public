import type { BunPlugin } from "bun";
import { compile } from "svelte/compiler";
/** Build-time only: production serves compiled JS, never a runtime compiler. */
export const svelteServerPlugin: BunPlugin = {
  name: "studio-svelte-ssr",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const result = compile(await Bun.file(path).text(), {
        filename: path,
        generate: "server",
        dev: false,
        preserveWhitespace: true,
      });
      return { contents: result.js.code, loader: "js" };
    });
  },
};
