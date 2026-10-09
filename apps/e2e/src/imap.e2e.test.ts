import { test, expect } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { createHttpApp } from '../../studio/dist/server/mail/http.js';
import { MailService } from '@decompozr/mail/server/services/mail.js';
import { ICloudMailAdapter } from '@decompozr/mail/server/icloud/adapter.js';
import { readConfig } from '@decompozr/mail/server/config.js';
import { startImapFixture } from './helpers/imap-fixture.js';

const response = z.object({ content: z.array(z.object({ type: z.literal('text'), text: z.string() })), isError: z.boolean().optional() });

test('built HTTP MCP service uses real iCloud adapter and exact UID commands over loopback IMAP', async () => {
  const imap = await startImapFixture();
  const config = readConfig({ ICLOUD_USER: 'fixture@example.invalid', ICLOUD_APP_PASSWORD: 'dummy',
    MCP_PUBLIC_URL: 'https://mail.example.invalid/icloud/mcp', MCP_OAUTH_ISSUER: 'https://issuer.example.invalid/',
    MCP_OAUTH_AUDIENCE: 'mail', MCP_OAUTH_JWKS_URL: 'https://issuer.example.invalid/keys',
    MCP_OAUTH_ALLOWED_SUBJECTS: 'owner', MAIL_ALLOW_WRITES: 'true', MCP_OAUTH_SCOPES: 'mail.read mail.write' });
  const service = new MailService(config, new ICloudMailAdapter(config, { createClient: imap.createClient }));
  const app = createHttpApp(config, service, async authorization => {
    if (authorization !== 'Bearer fixture-token') throw new Error('Rejected fixture token');
    return { subject: 'owner', scopes: new Set(['mail.read', 'mail.write']) };
  });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No listener');
  config.port = address.port;
  const client = new Client({ name: 'imap-e2e-fixture', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/icloud/mcp`), {
      requestInit: { headers: { authorization: 'Bearer fixture-token' } },
    }));
    const searched = response.parse(await client.callTool({ name: 'mail_search', arguments: { mailbox: 'INBOX', limit: 2 } }));
    expect(searched.isError).not.toBe(true);
    const text = searched.content[0]?.text;
    if (!text) throw new Error('Missing search response');
    const result = z.object({ uidValidity: z.string(), messages: z.array(z.object({ uid: z.number() })) }).parse(JSON.parse(text));
    expect(result.uidValidity).toBe('900');
    expect(result.messages.map(message => message.uid)).toEqual([43, 42]);
    expect(imap.commands.some(command => command.startsWith('EXAMINE '))).toBe(true);
    expect(imap.commands.some(command => command.startsWith('SELECT '))).toBe(false);
    const target = { mailbox: 'INBOX', uid: 41, uidValidity: '900' };
    for (const invalid of [{ ...target, uidValidity: '901' }, { ...target, uid: 999 }]) {
      expect(response.parse(await client.callTool({ name: 'mail_mark', arguments: { ...invalid, seen: true } })).isError).toBe(true);
    }
    expect(imap.commands.filter(command => /STORE|MOVE|EXPUNGE/.test(command))).toEqual([]);
    expect(response.parse(await client.callTool({ name: 'mail_mark', arguments: { ...target, seen: true } })).isError).not.toBe(true);
    expect(response.parse(await client.callTool({ name: 'mail_move', arguments: { ...target, destination: 'Archive' } })).isError).not.toBe(true);
    const stores = imap.commands.filter(command => /^UID STORE/.test(command));
    expect(stores).toHaveLength(1);
    expect(stores[0]).toMatch(/^UID STORE 41 \+FLAGS(?:\.SILENT)? \(\\Seen\)$/);
    expect(imap.commands.filter(command => /^UID MOVE/.test(command))).toEqual(['UID MOVE 41 Archive']);
    expect(imap.commands.some(command => /EXPUNGE|UID COPY/.test(command))).toBe(false);
    expect([...imap.seen]).toEqual([41]); expect([...imap.moved]).toEqual([41]);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    await imap.close();
  }
}, 15000);

for (const failure of ['none', 'copy', 'store', 'expunge'] as const) {
  test(`built HTTP organize uses checked UIDPLUS without MOVE: ${failure}`, async () => {
    const imap = await startImapFixture({ nativeMove: false, failCopy: failure === 'copy', failStore: failure === 'store', failExpunge: failure === 'expunge' });
    const config = readConfig({ ICLOUD_USER: 'fixture@example.invalid', ICLOUD_APP_PASSWORD: 'dummy',
      MCP_PUBLIC_URL: 'https://mail.example.invalid/icloud/mcp', MCP_OAUTH_ISSUER: 'https://issuer.example.invalid/',
      MCP_OAUTH_AUDIENCE: 'mail', MCP_OAUTH_JWKS_URL: 'https://issuer.example.invalid/keys',
      MCP_OAUTH_ALLOWED_SUBJECTS: 'owner', MAIL_ALLOW_WRITES: 'true', MCP_OAUTH_SCOPES: 'mail.read mail.write' });
    const service = new MailService(config, new ICloudMailAdapter(config, { createClient: imap.createClient }));
    const app = createHttpApp(config, service, async () => ({ subject: 'owner', scopes: new Set(['mail.read', 'mail.write']) }));
    const listener = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => listener.once('listening', resolve));
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    config.port = address.port;
    const client = new Client({ name: 'uidplus-e2e-fixture', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/icloud/mcp`), {
        requestInit: { headers: { authorization: 'Bearer fixture-token' } },
      }));
      const output = response.parse(await client.callTool({ name: 'mail_batch', arguments: {
        mailbox: 'INBOX', uidValidity: '900', uids: [41, 42], action: { type: 'organize', action: 'junk' },
      } }));
      const body = z.object({ status: z.string(), items: z.array(z.object({ status: z.string(), result: z.object({
        destination: z.string(), destinationTarget: z.object({ uid: z.number(), uidValidity: z.string() }),
      }).optional() })) }).parse(JSON.parse(output.content[0]?.text ?? ''));
      expect(body.status).toBe(failure === 'none' ? 'completed' : 'unknown');
      expect(body.items.map(item => item.status)).toEqual(failure === 'none' ? ['succeeded', 'succeeded'] : ['outcome_unknown', 'not_attempted']);
      expect(imap.commands.some(command => /^(EXPUNGE|CLOSE|UID MOVE)/.test(command))).toBe(false);
      expect(imap.deleted.has(43)).toBe(true);
      expect(imap.expunged.has(43)).toBe(false);
      if (failure === 'none') {
        expect(body.items[0]?.result).toEqual({ destination: 'Junk', destinationTarget: { uid: 81, uidValidity: '901' } });
        expect(imap.commands.filter(command => /^UID EXPUNGE/.test(command))).toEqual(['UID EXPUNGE 41', 'UID EXPUNGE 42']);
      } else {
        expect(imap.commands.filter(command => /^UID COPY/.test(command))).toEqual(['UID COPY 41 Junk']);
        if (failure === 'copy') expect(imap.commands.filter(command => /^UID STORE/.test(command))).toEqual([]);
        if (failure !== 'expunge') expect(imap.commands.filter(command => /^UID EXPUNGE/.test(command))).toEqual([]);
      }
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
      await imap.close();
    }
  }, 15000);
}
