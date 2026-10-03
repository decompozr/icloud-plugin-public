import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { ImapFlow } from 'imapflow';
import { ICloudMailAdapter } from './adapter.js';
import { MailOperationError } from '../domain/mail.js';
import { MailService } from '../services/mail.js';
import { createServer as createMcpServer } from '../mcp/server.js';
import { readConfig } from '../config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';

type Fault = 'copy-reject' | 'copy-drop' | 'mapping' | 'store-reject' | 'store-noop' | 'store-drop'
  | 'expunge-reject' | 'expunge-noop' | 'expunge-drop' | 'verify-drop' | 'verify-reject' | 'native-reject';
async function fixture(fault?: Fault, uidplus = true) {
  const commands: string[] = [], sockets = new Set<Socket>();
  const deleted = new Set([42]);
  const present = new Set([41, 42]);
  const copies: number[] = [];
  let expunged = false;
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('* OK loopback protocol fixture\r\n');
    let buffer = '';
    socket.on('data', data => {
      buffer += data.toString();
      while (buffer.includes('\r\n')) {
        const cut = buffer.indexOf('\r\n'), line = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
        const split = line.indexOf(' '), tag = line.slice(0, split), command = line.slice(split + 1);
        commands.push(command);
        const reply = (value: string) => socket.write(value + '\r\n');
        if (command === 'CAPABILITY') reply(`* CAPABILITY IMAP4rev1${uidplus ? ' UIDPLUS' : ''}${fault === 'native-reject' ? ' MOVE' : ''}`);
        else if (/^LOGIN/.test(command)) { /* dummy credentials only */ }
        else if (/^LIST/.test(command)) {
          if (command === 'LIST "" ""') reply('* LIST (\\Noselect) "/" ""');
          else { reply('* LIST (\\HasNoChildren) "/" "INBOX"'); reply('* LIST (\\Archive) "/" "Archive"'); }
        }
        else if (/^(SELECT|EXAMINE)/.test(command)) {
          reply('* FLAGS (\\Seen \\Deleted)'); reply('* 2 EXISTS'); reply('* OK [UIDVALIDITY 900] validity'); reply('* OK [UIDNEXT 43] next');
        } else if (/^UID COPY 41 /.test(command)) {
          if (fault === 'copy-drop') { copies.push(81); socket.destroy(); continue; }
          if (fault === 'copy-reject') { reply(`${tag} NO rejected`); continue; }
          copies.push(81);
          reply(`${tag} OK${fault === 'mapping' ? '' : ' [COPYUID 901 41 81]'} copied`); continue;
        } else if (/^UID STORE 41 /.test(command)) {
          if (fault === 'store-drop') { socket.destroy(); continue; }
          if (fault === 'store-reject') { reply(`${tag} NO rejected`); continue; }
          if (fault !== 'store-noop') deleted.add(41);
        } else if (command === 'UID EXPUNGE 41') {
          if (fault === 'expunge-drop') { present.delete(41); socket.destroy(); continue; }
          if (fault === 'expunge-reject') { reply(`${tag} NO rejected`); continue; }
          expunged = true;
          if (fault !== 'expunge-noop') { present.delete(41); reply('* 1 EXPUNGE'); }
        } else if (/^UID FETCH 42 /.test(command)) {
          reply('* 2 FETCH (UID 42 FLAGS (\\Deleted))');
        } else if (/^UID FETCH 41 /.test(command)) {
          if (expunged && fault === 'verify-drop') { socket.destroy(); continue; }
          if (expunged && fault === 'verify-reject') { reply(`${tag} NO verification failed`); continue; }
          if (present.has(41)) reply(`* 1 FETCH (UID 41 FLAGS (${deleted.has(41) ? '\\Deleted' : ''}))`);
        } else if (/^UID MOVE/.test(command)) { reply(`${tag} NO rejected`); continue; }
        else if (command === 'LOGOUT') { reply('* BYE done'); reply(`${tag} OK logout`); socket.end(); continue; }
        else { reply(`${tag} BAD unsupported`); continue; }
        reply(`${tag} OK complete`);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture listener');
  const adapter = new ICloudMailAdapter({ user: 'fixture', password: 'dummy' }, { createClient: () => new ImapFlow({
    host: '127.0.0.1', port: address.port, secure: false, doSTARTTLS: false,
    auth: { user: 'fixture', pass: 'dummy' }, logger: false, disableAutoIdle: true,
    connectionTimeout: 1000, greetingTimeout: 1000, socketTimeout: 2000,
  }) });
  return { commands, deleted, present, copies, adapter,
    move: () => adapter.withSession(async session => {
      const lease = await session.select('INBOX', { readOnly: false });
      try { return await session.move(41, 'Archive'); } finally { lease.release(); }
    }),
    async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

test('UIDPLUS-only move validates COPYUID, Deleted state, exact expunge and source absence', async () => {
  const peer = await fixture();
  try {
    assert.deepEqual(await peer.move(), { uid: 81, uidValidity: '901' });
    assert.equal(peer.present.has(41), false);
    assert.equal(peer.present.has(42), true); assert.equal(peer.deleted.has(42), true);
    assert.deepEqual(peer.copies, [81]);
    assert.deepEqual(peer.commands.filter(command => /^(UID )?(COPY|MOVE|STORE|EXPUNGE|CLOSE)/.test(command)), [
      'UID COPY 41 Archive', 'UID STORE 41 +FLAGS (\\Deleted)', 'UID EXPUNGE 41',
    ]);
    const expunge = peer.commands.indexOf('UID EXPUNGE 41');
    assert.match(peer.commands[expunge - 1] ?? '', /^UID FETCH 41 .*FLAGS/);
    assert.match(peer.commands[expunge + 1] ?? '', /^UID FETCH 41 /);
  } finally { await peer.close(); }
});
for (const fault of ['copy-reject', 'copy-drop', 'mapping', 'store-reject', 'store-noop', 'store-drop', 'expunge-reject', 'expunge-noop', 'expunge-drop', 'verify-drop', 'verify-reject', 'native-reject'] as const) {
  test(`uncertain move reports outcome_unknown without retry for ${fault}`, async () => {
    const peer = await fixture(fault);
    try {
      await assert.rejects(peer.move(), (error: unknown) => {
        assert.ok(error instanceof MailOperationError);
        assert.equal(error.code, 'outcome_unknown');
        assert.deepEqual(error.recovery, ['copy-reject', 'copy-drop', 'mapping', 'native-reject'].includes(fault)
          ? undefined : { copiedTarget: { mailbox: 'Archive', uid: 81, uidValidity: '901' } });
        return true;
      });
      assert.equal(peer.commands.some(command => command === 'EXPUNGE' || /^CLOSE(?: |$)/.test(command)), false);
      assert.equal(peer.commands.filter(command => /^UID COPY/.test(command)).length <= 1, true);
      assert.equal(peer.present.has(42), true);
      if (['copy-reject', 'copy-drop', 'mapping'].includes(fault)) assert.equal(peer.commands.some(command => /^UID STORE/.test(command)), false);
      if (['store-reject', 'store-noop', 'store-drop'].includes(fault)) assert.equal(peer.commands.includes('UID EXPUNGE 41'), false);
    } finally { await peer.close(); }
  });
}
test('no MOVE or UIDPLUS rejects before any copy or store', async () => {
  const peer = await fixture(undefined, false);
  try {
    await assert.rejects(peer.move(), { code: 'unsupported_capability' });
    assert.equal(peer.commands.some(command => /^UID (COPY|STORE|EXPUNGE|MOVE)/.test(command)), false);
  } finally { await peer.close(); }
});
for (const fault of ['store-reject', 'mapping'] as const) {
  for (const name of ['mail_move', 'mail_organize', 'mail_batch'] as const) test(`${name} preserves only established COPYUID evidence for ${fault}`, async () => {
    const peer = await fixture(fault);
    const config = readConfig({ ICLOUD_USER: 'fixture@example.invalid', ICLOUD_APP_PASSWORD: 'dummy',
      MCP_PUBLIC_URL: 'https://mail.example.invalid/icloud/mcp', MCP_OAUTH_ISSUER: 'https://issuer.example.invalid/',
      MCP_OAUTH_AUDIENCE: 'mail', MCP_OAUTH_JWKS_URL: 'https://issuer.example.invalid/keys', MCP_OAUTH_ALLOWED_SUBJECTS: 'owner' });
    const server = createMcpServer(new MailService({ allowWrites: true }, peer.adapter), { ...config, allowWrites: true }, new Set(['mail.read', 'mail.write']));
    const client = new Client({ name: 'move-recovery', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const target = { mailbox: 'INBOX', uidValidity: '900', uid: 41 };
    try {
      await server.connect(b); await client.connect(a);
      const args = name === 'mail_batch' ? { mailbox: target.mailbox, uidValidity: target.uidValidity, uids: [41, 42], action: { type: 'move', destination: 'Archive' } }
        : name === 'mail_organize' ? { ...target, action: 'archive' } : { ...target, destination: 'Archive' };
      const result = await client.callTool({ name, arguments: args });
      const body = JSON.parse(z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(result.content)[0]!.text);
      const expected = fault === 'mapping' ? undefined : { copiedTarget: { mailbox: 'Archive', uid: 81, uidValidity: '901' } };
      assert.equal(body.status, 'unknown');
      if (name === 'mail_batch') {
        assert.deepEqual(body.items.map((item: { status: string }) => item.status), ['outcome_unknown', 'not_attempted']);
        assert.deepEqual(body.items[0].recovery, expected);
        assert.equal(body.items[0].result, undefined);
      } else {
        assert.equal(result.isError, true); assert.equal(body.error.code, 'outcome_unknown');
        assert.deepEqual(body.recovery, expected); assert.equal(body.destinationTarget, undefined);
      }
      assert.deepEqual(peer.copies, [81]);
      assert.equal(peer.commands.some(command => command === 'EXPUNGE' || command.startsWith('CLOSE')), false);
    } finally { await client.close(); await server.close(); await peer.close(); }
  });
}
