import { test, expect } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { createHttpApp } from '../../icloud/dist/mail/http.js';
import { MailService } from '@decompozr/mail/server/services/mail.js';
import { ICloudMailAdapter } from '@decompozr/mail/server/icloud/adapter.js';
import { readConfig } from '@decompozr/mail/server/config.js';
import type { MailGateway, MailSession } from '@decompozr/mail/server/domain/mail.js';

const envelope = z.object({ content: z.array(z.object({ type: z.literal('text'), text: z.string() })), isError: z.boolean().optional() });
const readResult = z.object({ mode: z.enum(['summary', 'full']), text: z.string(), truncated: z.boolean(), excerpt: z.string().optional(), attachments: z.array(z.unknown()).optional() });

test('built HTTP MCP reads HTML-only MIME through the real parser with truthful summary bounds', async () => {
  const source = new TextEncoder().encode('Subject: HTML newsletter\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<h1>Newsletter update</h1><p>' + 'Useful newsletter content. '.repeat(40) + '</p><script>HIDDEN_SCRIPT()</script>');
  const selections: boolean[] = [];
  const noMutation = async (): Promise<never> => { throw new Error('Read attempted a mutation'); };
  const session: MailSession = {
    supportsMove: false,
    list: async () => [],
    select: async (_mailbox, options) => { selections.push(options?.readOnly ?? false); return { uidValidity: '900', uidNext: 42, supportsKeywords: false, release() {} }; },
    search: async () => [], summaries: async () => [],
    metadata: async () => ({ size: source.byteLength, flags: [], attachments: [] }),
    download: async () => ({ contentType: 'message/rfc822', chunks: (async function* () { yield source; })(), cancel() {} }),
    mark: noMutation, flag: noMutation, tag: noMutation, move: noMutation,
  };
  const parser = new ICloudMailAdapter({ user: 'fixture@example.invalid', password: 'unused' });
  const gateway: MailGateway = { withSession: run => run(session), parse: bytes => parser.parse(bytes) };
  const config = readConfig({ ICLOUD_USER: 'fixture@example.invalid', ICLOUD_APP_PASSWORD: 'dummy', MCP_PUBLIC_URL: 'https://mail.example.invalid/icloud/mcp',
    MCP_OAUTH_ISSUER: 'https://issuer.example.invalid/', MCP_OAUTH_AUDIENCE: 'mail', MCP_OAUTH_JWKS_URL: 'https://issuer.example.invalid/keys',
    MCP_OAUTH_ALLOWED_SUBJECTS: 'owner', MCP_OAUTH_SCOPES: 'mail.read' });
  const app = createHttpApp(config, new MailService(config, gateway), async authorization => {
    if (authorization !== 'Bearer fixture-token') throw new Error('Fixture token required');
    return { subject: 'owner', scopes: new Set(['mail.read']) };
  });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const address = listener.address(); if (!address || typeof address === 'string') throw new Error('No listener');
  config.port = address.port;
  const client = new Client({ name: 'html-mime-e2e', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/icloud/mcp`), { requestInit: { headers: { authorization: 'Bearer fixture-token' } } }));
    for (const mode of ['full', 'summary'] as const) {
      const result = envelope.parse(await client.callTool({ name: 'mail_read', arguments: { mailbox: 'INBOX', uid: 41, uidValidity: '900', mode } }));
      expect(result.isError).not.toBe(true);
      const text = result.content[0]?.text; if (!text) throw new Error('Missing response');
      const parsed = readResult.parse(JSON.parse(text));
      expect(parsed.text).toContain('Useful newsletter content.');
      expect(parsed.text).not.toContain('HIDDEN_SCRIPT');
      expect(parsed.text).not.toContain('<h1>');
      expect(parsed.mode).toBe(mode);
      if (mode === 'summary') {
        expect(parsed.text.length).toBe(500); expect(parsed.excerpt).toBe(parsed.text);
        expect(parsed.truncated).toBe(true); expect(parsed.attachments).toBeUndefined();
      } else {
        expect(parsed.text.length).toBeGreaterThan(500); expect(parsed.truncated).toBe(false);
      }
    }
    expect(selections).toEqual([true, true]);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
});
