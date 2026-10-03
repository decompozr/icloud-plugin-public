import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ICloudOutboundAdapter } from './outbound.js';

const credentials = { user: 'sender@example.invalid', password: 'dummy' };
const message = { to: ['recipient@example.invalid'], subject: 'A useful reply', text: 'Plain text only.',
  messageId: '<operation-123@example.invalid>', inReplyTo: '<original@example.invalid>', references: ['<older@example.invalid>', '<original@example.invalid>'] };
async function smtpFixture(drop = false, rejectionCode = 550) {
  const sockets = new Set<Socket>(), messages: string[] = [], commands: string[] = [];
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '', data = false, content = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line !== '.') { content += line.replace(/^\.\./, '.') + '\r\n'; continue; }
          messages.push(content); content = ''; data = false;
          if (drop) socket.destroy(); else socket.write('250 accepted for relay\r\n');
          continue;
        }
        commands.push(line);
        if (/^EHLO/.test(line)) socket.write('250-localhost\r\n250 SIZE 200000\r\n');
        else if (/^RCPT TO:.*rejected@/.test(line)) socket.write(`${rejectionCode} recipient refused\r\n`);
        else if (/^DATA/.test(line)) { data = true; socket.write('354 send message\r\n'); }
        else if (/^QUIT/.test(line)) { socket.end('221 bye\r\n'); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
  return { messages, commands,
    adapter: new ICloudOutboundAdapter(credentials, { createSmtp: () => nodemailer.createTransport({ host: '127.0.0.1', port: address.port, secure: false, ignoreTLS: true, socketTimeout: 2000 }) }),
    async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
async function imapFixture(mode: 'ok' | 'missing' | 'drop' | 'reject' = 'ok') {
  const sockets = new Set<Socket>(), sources: Buffer[] = [], commands: string[] = [];
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('* OK local IMAP\r\n');
    let buffer = '', pending: { tag: string; length: number } | undefined;
    socket.on('data', chunk => {
      buffer += chunk.toString('latin1');
      while (true) {
        if (pending) {
          if (buffer.length < pending.length + 2) return;
          sources.push(Buffer.from(buffer.slice(0, pending.length), 'latin1'));
          buffer = buffer.slice(pending.length + 2);
          if (mode === 'drop') { socket.destroy(); return; }
          socket.write(`${pending.tag} ${mode === 'reject' ? 'NO rejected' : mode === 'missing' ? 'OK appended' : 'OK [APPENDUID 901 81] appended'}\r\n`);
          pending = undefined;
        }
        const end = buffer.indexOf('\r\n'); if (end < 0) return;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const split = line.indexOf(' '), tag = line.slice(0, split), command = line.slice(split + 1); commands.push(command);
        if (command === 'CAPABILITY') socket.write('* CAPABILITY IMAP4rev1 UIDPLUS\r\n');
        else if (/^LIST/.test(command)) socket.write('* LIST (\\Noselect) "/" ""\r\n');
        else if (/^APPEND/.test(command)) {
          const length = /\{(\d+)\}$/.exec(command)?.[1];
          if (!length) { socket.write(`${tag} BAD literal required\r\n`); continue; }
          pending = { tag, length: Number(length) }; socket.write('+ continue\r\n'); continue;
        } else if (command === 'LOGOUT') { socket.end(`* BYE done\r\n${tag} OK logout\r\n`); continue; }
        else if (!/^LOGIN/.test(command)) { socket.write(`${tag} BAD unsupported\r\n`); continue; }
        socket.write(`${tag} OK complete\r\n`);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
  return { sources, commands,
    adapter: new ICloudOutboundAdapter(credentials, { createImap: () => new ImapFlow({ host: '127.0.0.1', port: address.port,
      secure: false, doSTARTTLS: false, auth: { user: 'fixture', pass: 'dummy' }, logger: false, disableAutoIdle: true, socketTimeout: 2000 }) }),
    async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
test('SMTP wire preserves deterministic identity and threading and reports recipient acceptance separately', async () => {
  const peer = await smtpFixture();
  try {
    const receipt = await peer.adapter.send({ ...message, to: [...message.to, 'rejected@example.invalid'] });
    assert.deepEqual(receipt, { messageId: message.messageId, accepted: message.to, rejected: ['rejected@example.invalid'] });
    assert.equal(peer.messages.length, 1);
    const parsed = await simpleParser(peer.messages[0] ?? '');
    assert.equal(parsed.messageId, message.messageId); assert.equal(parsed.inReplyTo, message.inReplyTo);
    assert.deepEqual(parsed.references, message.references); assert.equal(parsed.text?.trim(), message.text);
    assert.equal(parsed.html, false);
  } finally { await peer.close(); }
});
test('SMTP connection lost after DATA is unknown and never retried', async () => {
  const peer = await smtpFixture(true);
  try { await assert.rejects(peer.adapter.send(message), { code: 'outcome_unknown' }); assert.equal(peer.messages.length, 1); }
  finally { await peer.close(); }
});
test('outbound input rejects header injection before connecting', async () => {
  let connected = false;
  const adapter = new ICloudOutboundAdapter(credentials, { createSmtp: () => { connected = true; throw new Error('Unexpected connection'); } });
  await assert.rejects(adapter.send({ ...message, subject: 'hello\r\nBcc: other@example.invalid' }), { code: 'invalid_input' });
  await assert.rejects(adapter.send({ ...message, references: ['<good@example.invalid>\r\nBcc: x'] }), { code: 'invalid_input' });
  await assert.rejects(adapter.send({ ...message, text: 'x'.repeat(100001) }), { code: 'invalid_input' });
  assert.equal(connected, false);
});
test('draft APPEND preserves MIME identity and returns verified UID without deleting messages', async () => {
  const peer = await imapFixture();
  try {
    assert.deepEqual(await peer.adapter.draft(message, 'Drafts'), { mailbox: 'Drafts', uid: 81, uidValidity: '901', messageId: message.messageId });
    assert.equal(peer.sources.length, 1);
    assert.equal((await simpleParser(peer.sources[0] ?? Buffer.alloc(0))).messageId, message.messageId);
    assert.match(peer.commands.find(command => command.startsWith('APPEND')) ?? '', /^APPEND Drafts \(\\Draft\)/);
    assert.equal(peer.commands.some(command => /STORE|EXPUNGE|MOVE|DELETE|CLOSE/.test(command)), false);
  } finally { await peer.close(); }
});
for (const mode of ['missing', 'drop', 'reject'] as const) test(`draft ${mode} completion is unknown without retry`, async () => {
  const peer = await imapFixture(mode);
  try { await assert.rejects(peer.adapter.draft(message, 'Drafts'), { code: 'outcome_unknown' }); assert.equal(peer.sources.length, 1); }
  finally { await peer.close(); }
});
test('explicit refusal of every RCPT is a rejected receipt with no DATA submission', async () => {
  const peer = await smtpFixture();
  try {
    const to = ['rejected@example.invalid'];
    assert.deepEqual(await peer.adapter.send({ ...message, to }), { messageId: message.messageId, accepted: [], rejected: to });
    assert.equal(peer.messages.length, 0); assert.equal(peer.commands.includes('DATA'), false);
  } finally { await peer.close(); }
});
test('shared message limits reject multibyte overflow, NUL and duplicate recipients before connecting', async () => {
  const adapter = new ICloudOutboundAdapter(credentials, { createSmtp: () => { throw Error('Must not connect'); } });
  for (const invalid of [{ ...message, text: 'é'.repeat(50001) }, { ...message, text: 'bad\0body' }, { ...message, to: ['a@example.invalid', 'a@EXAMPLE.INVALID'] }]) {
    await assert.rejects(adapter.send(invalid), { code: 'invalid_input' });
  }
});

test('explicit temporary refusal of every RCPT is rejected without DATA or retry', async () => {
  const peer = await smtpFixture(false, 450);
  try {
    const to = ['rejected@example.invalid'];
    assert.deepEqual(await peer.adapter.send({ ...message, to }), { messageId: message.messageId, accepted: [], rejected: to });
    assert.equal(peer.messages.length, 0); assert.equal(peer.commands.includes('DATA'), false);
    assert.equal(peer.commands.filter(command => command.startsWith('RCPT TO:')).length, 1);
  } finally { await peer.close(); }
});
