// Synthetic child fixture. Receives only experiment-owned temporary paths.
const [statePath, markerPath] = process.argv.slice(2);
const existing = Bun.file(statePath);
let counter = await existing.exists() ? (await existing.json()).counter : 0;
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  if (request.method === 'POST') {
    counter++;
    await Bun.write(statePath, JSON.stringify({ counter }));
  }
  return Response.json({ counter });
} });
process.on('SIGTERM', async () => {
  await server.stop(true);
  await Bun.write(markerPath, 'SIGTERM-clean');
  process.exit(0);
});
console.log(server.url.href);
