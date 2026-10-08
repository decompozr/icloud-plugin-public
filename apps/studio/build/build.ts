import { mkdir, rm, cp } from "node:fs/promises";
import { join,dirname } from "node:path";
import { svelteServerPlugin } from "./svelte-plugin.js";
const root = join(import.meta.dir, ".."),
  dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const kit = Bun.spawn(
  [process.execPath, join(dirname(Bun.resolveSync("vite/package.json",root)),"bin/vite.js"), "build"],
  { cwd: root, stdout: "inherit", stderr: "inherit" },
);
if ((await kit.exited) !== 0) throw Error("SvelteKit application build failed");
const result = await Bun.build({
  entrypoints: [
    join(root, "src/index.ts"),
    join(root, "src/compat-resources.ts"),
    join(root, "src/transport.ts"),
  ],
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
    join(dirname(Bun.resolveSync("typescript/package.json",root)),"bin/tsc"),
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    join(dist,"types"),
    "--rootDir",
    join(root, "../.."),
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--skipLibCheck",
    join(root, "src/index.ts"),
    join(root, "src/transport.ts"),
    join(root, "src/svelte.d.ts"),
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await types.exited) !== 0) throw Error("Studio declaration build failed");
await cp(join(dist,"types/apps/studio/src"),dist,{recursive:true});
// Public declarations use installed package exports instead of repo source paths.
await rm(join(dist,"types"),{recursive:true,force:true});
const adminKeys = Object.keys(
  await Bun.file(join(root, "messages/en.json")).json(),
).filter((key) => key !== "$schema" && !key.startsWith("auth_"));
const authKeys = Object.keys(
  await Bun.file(join(root, "messages/en.json")).json(),
)
  .filter((key) => key.startsWith("auth_"))
  .map((key) => key.slice(5));
const shape = (keys: string[]) =>
  "{" + keys.map((key) => JSON.stringify(key) + ":string").join(";") + "}";
await Bun.write(
  join(dist, "compat-resources.d.ts"),
  `export declare const en:${shape(adminKeys)};\nexport declare const zh:typeof en;\nexport declare const authEnglish:${shape(authKeys)};\nexport declare const authChinese:typeof authEnglish;\n`,
);
console.log(
  "Built Svelte Studio SSR renderer; no source/compiler required at runtime.",
);
