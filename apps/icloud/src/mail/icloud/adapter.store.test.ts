import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { ImapFlow } from 'imapflow';
import { ICloudMailAdapter } from './adapter.js';
import { MailService } from '../services/mail.js';

const target = { mailbox: 'INBOX', uidValidity: '900', uid: 41 };
async function fixture(fault?: 'NO' | 'BAD' | 'drop') {
  const commands: string[] = [], sockets = new Set<Socket>();
  const flags = new Map([[41, new Set<string>()], [42, new Set<string>()], [43, new Set(['\\Flagged'])]]);
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('* OK loopback STORE fixture\r\n');
    let buffer = '';
    socket.on('data', data => {
      buffer += data.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const split = line.indexOf(' '), tag = line.slice(0, split), command = line.slice(split + 1);
        commands.push(command);
        const reply = (value: string) => socket.write(value + '\r\n');
        const store = /^UID STORE (\d+) ([+-])FLAGS \(([^()]+)\)$/.exec(command);
        const fetch = /^UID FETCH (\d+) /.exec(command);
        if (command === 'CAPABILITY') reply('* CAPABILITY IMAP4rev1');
        else if (/^LOGIN /.test(command)) { /* synthetic credential */ }
        else if (/^LIST /.test(command)) reply(command === 'LIST "" ""' ? '* LIST (\\Noselect) "/" ""' : '* LIST () "/" "INBOX"');
        else if (/^(SELECT|EXAMINE) /.test(command)) {
          reply('* FLAGS (\\Seen \\Flagged \\Deleted Project)');
          reply('* OK [PERMANENTFLAGS (\\Seen \\Flagged \\Deleted Project)] allowed');
          reply('* 3 EXISTS'); reply('* OK [UIDVALIDITY 900] validity'); reply('* OK [UIDNEXT 44] next');
          reply(`${tag} OK [${command.startsWith('EXAMINE') ? 'READ-ONLY' : 'READ-WRITE'}] selected`); continue;
        } else if (fetch) {
          const uid = Number(fetch[1]), selected = flags.get(uid);
          if (selected) reply(`* ${uid - 40} FETCH (UID ${uid} FLAGS (${[...selected].join(' ')}))`);
        } else if (store) {
          const uid = Number(store[1]), selected = flags.get(uid)!;
          if (uid === 41 && (fault === 'NO' || fault === 'BAD')) { reply(`${tag} ${fault} refused`); continue; }
          if (store[2] === '+') selected.add(store[3]!); else selected.delete(store[3]!);
          if (uid === 41 && fault === 'drop') { socket.destroy(); continue; }
        } else if (command === 'LOGOUT') { reply('* BYE done'); reply(`${tag} OK logout`); socket.end(); continue; }
        else { reply(`${tag} BAD unsupported`); continue; }
        reply(`${tag} OK complete`);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing fixture address');
  const adapter = new ICloudMailAdapter({ user: 'fixture', password: 'dummy' }, { createClient: () => new ImapFlow({
    host: '127.0.0.1', port: address.port, secure: false, doSTARTTLS: false, disableAutoIdle: true,
    auth: { user: 'fixture', pass: 'dummy' }, logger: false, connectionTimeout: 1000, greetingTimeout: 1000, socketTimeout: 2000,
  }) });
  return { flags, commands, adapter, service: new MailService({ allowWrites: true }, adapter),
    async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test('checked STORE adds and removes exact Seen, Flagged and allowed keyword over the real SDK', async () => {
  const peer = await fixture();
  try {
    for (const enabled of [true, false]) {
      await peer.service.mark({ ...target, seen: enabled });
      await peer.service.flag({ ...target, flagged: enabled });
      await peer.service.tag({ ...target, keyword: 'Project', enabled });
      assert.equal(peer.flags.get(41)?.has('\\Seen'), enabled);
      assert.equal(peer.flags.get(41)?.has('\\Flagged'), enabled);
      assert.equal(peer.flags.get(41)?.has('Project'), enabled);
    }
    assert.deepEqual(peer.commands.filter(command => command.startsWith('UID STORE')), [
      'UID STORE 41 +FLAGS (\\Seen)', 'UID STORE 41 +FLAGS (\\Flagged)', 'UID STORE 41 +FLAGS (Project)',
      'UID STORE 41 -FLAGS (\\Seen)', 'UID STORE 41 -FLAGS (\\Flagged)', 'UID STORE 41 -FLAGS (Project)',
    ]);
    assert.deepEqual([...peer.flags.get(43)!], ['\\Flagged']);
  } finally { await peer.close(); }
});
for (const fault of ['NO', 'BAD'] as const) test(`explicit STORE ${fault} is a rejection and a later safe batch item may proceed`, async () => {
  const peer = await fixture(fault);
  try {
    const result = await peer.service.batch({ ...target, uids: [41, 42], action: { type: 'mark', seen: true } });
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.items.map(item => item.status), ['failed', 'succeeded']);
    assert.deepEqual(result.items[0], { target, status: 'failed', code: 'upstream_failure' });
    assert.equal(peer.flags.get(41)?.has('\\Seen'), false); assert.equal(peer.flags.get(42)?.has('\\Seen'), true);
    assert.equal(peer.commands.filter(command => command.startsWith('UID STORE')).length, 2);
  } finally { await peer.close(); }
});
test('STORE applied then lost acknowledgement stays unknown and stops later items', async () => {
  const peer = await fixture('drop');
  try {
    const result = await peer.service.batch({ ...target, uids: [41, 42], action: { type: 'mark', seen: true } });
    assert.equal(result.status, 'unknown');
    assert.deepEqual(result.items.map(item => item.status), ['outcome_unknown', 'not_attempted']);
    assert.equal(peer.flags.get(41)?.has('\\Seen'), true); assert.equal(peer.flags.get(42)?.has('\\Seen'), false);
    assert.deepEqual(peer.commands.filter(command => command.startsWith('UID STORE')), ['UID STORE 41 +FLAGS (\\Seen)']);
    assert.deepEqual([...peer.flags.get(43)!], ['\\Flagged']);
  } finally { await peer.close(); }
});
test('invalid UID, keyword, absent selection, read-only selection and unsupported add emit no STORE', async () => {
  const peer = await fixture();
  try {
    await peer.adapter.withSession(async session => {
      await assert.rejects(session.mark(41, true), { code: 'forbidden' });
      const readOnly = await session.select('INBOX', { readOnly: true });
      try { await assert.rejects(session.mark(41, true), { code: 'forbidden' }); } finally { readOnly.release(); }
    });
    await peer.adapter.withSession(async session => {
      const lease = await session.select('INBOX', { readOnly: false });
      try {
        for (const uid of [0, -1, 1.5, 4294967296]) await assert.rejects(session.mark(uid, true), { code: 'invalid_input' });
        for (const keyword of ['\\Deleted', 'Project) (\\Seen', 'a\r\nNOOP']) {
          await assert.rejects(session.tag(41, keyword, true), { code: 'invalid_input' });
        }
        await assert.rejects(session.tag(41, 'Unsupported', true), { code: 'unsupported_capability' });
      } finally { lease.release(); }
    });
    assert.equal(peer.commands.some(command => command.startsWith('UID STORE')), false);
  } finally { await peer.close(); }
});
test('checked STORE validates resolved acknowledgements and always releases their response queue', async () => {
  for (const [status, code] of [['NO', 'upstream_failure'], ['BAD', 'upstream_failure'], ['BYE', 'outcome_unknown'], [undefined, 'outcome_unknown']] as const) {
    let next = 0;
    const client = new ImapFlow({ host: 'unused', port: 993, secure: true, logger: false });
    client.connect = async () => {}; client.logout = async () => {};
    client.mailbox = { path: 'INBOX', delimiter: '/', uidValidity: 900n, uidNext: 44, exists: 3, flags: new Set(), permanentFlags: new Set(['\\Seen']), readOnly: false };
    Object.assign(client, { exec: async () => ({ response: { command: status }, next() { next++; } }) });
    const adapter = new ICloudMailAdapter({ user: 'fixture', password: 'dummy' }, { createClient: () => client });
    await assert.rejects(adapter.withSession(session => session.mark(41, true)), { code });
    assert.equal(next, 1);
  }
});
