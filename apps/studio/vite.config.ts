import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-node";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
export default defineConfig({
  resolve:{dedupe:["svelte"]},
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      strategy: ["cookie", "baseLocale"],
      emitTsDeclarations: true,
    }),
    sveltekit({
      adapter: adapter({ out: "dist/ui/kit", precompress: false }),
      paths: { relative: false },
      appDir: "icloud/_studio",
      csp: {
        mode: "nonce",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"],
          "frame-ancestors": ["none"],
          "form-action": ["self"],
          "base-uri": ["none"],
        },
      },
    }),
  ],
  ssr: { noExternal: [/^@decompozr\//,"svelte", "zod", "@simplewebauthn/browser"] },
});
