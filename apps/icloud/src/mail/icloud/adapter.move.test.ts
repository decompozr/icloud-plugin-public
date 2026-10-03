import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { ImapFlow } from 'imapflow';
import { ICloudMailAdapter } from './adapter.js';

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
          else reply('* LIST (\\HasNoChildren) "/" "INBOX"');
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
  return { commands, deleted, present, copies,
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
      await assert.rejects(peer.move(), { code: 'outcome_unknown' });
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
