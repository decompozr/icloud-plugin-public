import { test, expect } from 'bun:test';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

test('L1: Bun actual MCP SDK initialize/list/call/error/auth/teardown', async () => {
  const mcp = new McpServer({ name: 'synthetic-mail-only', version: '0.0.0' });
  mcp.registerTool('read_fake_mail', { inputSchema: { uid: z.number().int() } }, async ({ uid }) => ({
    content: [{ type: 'text', text: uid === 7 ? 'Synthetic message seven' : 'Fake message missing' }],
    isError: uid !== 7,
  }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID(), enableJsonResponse: true });
  await mcp.connect(transport);
  const server = createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer dummy-loopback-only') {
      res.writeHead(401).end('Unauthorized'); return;
    }
    transport.handleRequest(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No loopback listener');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const client = new Client({ name: 'bun-fixture-client', version: '0.0.0' });
  try {
    expect((await fetch(url)).status).toBe(401);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer dummy-loopback-only' } } }));
    expect(client.getServerVersion()?.name).toBe('synthetic-mail-only');
    expect((await client.listTools()).tools.map(x => x.name)).toEqual(['read_fake_mail']);
    const read = await client.callTool({ name: 'read_fake_mail', arguments: { uid: 7 } });
    expect(read.isError).toBe(false);
    expect(read.content).toEqual([{ type: 'text', text: 'Synthetic message seven' }]);
    expect((await client.callTool({ name: 'read_fake_mail', arguments: { uid: 99 } })).isError).toBe(true);
    const unknown = await client.callTool({ name: 'missing_tool', arguments: {} });
    expect(unknown.isError).toBe(true);
  } finally {
    await client.close(); await mcp.close();
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  expect(server.listening).toBe(false);
  await expect(fetch(url)).rejects.toThrow();
});
