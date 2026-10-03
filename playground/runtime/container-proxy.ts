// Owned experiment fixture: no discovery beyond its temporary target file.
const targetFile = process.argv[2];
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch() {
  const target = (await Bun.file(targetFile).text()).trim();
  return fetch(target, { signal: AbortSignal.timeout(2000) });
} });
process.on('SIGTERM', async () => { await server.stop(true); process.exit(0); });
console.log(server.url.href);
