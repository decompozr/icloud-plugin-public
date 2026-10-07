import type { BunPlugin } from "bun";
import{join}from"node:path";
import { compile, compileModule } from "svelte/compiler";
/** Build-time only: production serves compiled JS, never a runtime compiler. */
export const svelteServerPlugin: BunPlugin = {
  name: "studio-svelte-ssr",
  setup(build) {
    build.onResolve({filter:/^svelte(?:\/.*)?$/},args=>({path:Bun.resolveSync(args.path,join(import.meta.dir,".."))}));
    build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => ({
      contents: compileModule(
        new Bun.Transpiler({ loader: "ts" }).transformSync(
          await Bun.file(path).text(),
        ),
        { filename: path, generate: "server", dev: false },
      ).js.code,
      loader: "js",
    }));
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
