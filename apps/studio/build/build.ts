import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { svelteServerPlugin } from "./svelte-plugin.js";
const root = join(import.meta.dir, ".."),
  dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, "src/index.ts")],
  outdir: dist,
  target: "bun",
  plugins: [svelteServerPlugin],
  minify: true,
});
if (!result.success)
  throw new AggregateError(result.logs, "Studio component build failed");
const types = Bun.spawn(
  [
    process.execPath,
    join(root, "node_modules/typescript/bin/tsc"),
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    dist,
    "--rootDir",
    join(root, "src"),
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--skipLibCheck",
    join(root, "src/index.ts"),
    join(root, "src/svelte.d.ts"),
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await types.exited) !== 0) throw Error("Studio declaration build failed");
const browser = await Bun.build({
  entrypoints: [
    join(root, "src/admin-browser.ts"),
    join(root, "src/auth-browser.ts"),
  ],
  outdir: join(dist, "assets"),
  target: "browser",
});
if (!browser.success)
  throw new AggregateError(browser.logs, "Studio browser build failed");
console.log(
  "Built Svelte Studio SSR renderer; no source/compiler required at runtime.",
);
