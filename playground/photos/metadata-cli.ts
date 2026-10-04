import { importMetadata } from "./metadata";
const args = Bun.argv.slice(2);
if (args.length !== 2) {
  console.error("Usage: bun run metadata-cli.ts <local-library-namespace> <json-file>");
  process.exitCode = 1;
} else {
  try { console.log(JSON.stringify(await importMetadata(args[1]!, args[0]!), null, 2)); }
  catch { console.error("Metadata import failed: invalid input, exceeded bounds, or unreadable file."); process.exitCode = 1; }
}
