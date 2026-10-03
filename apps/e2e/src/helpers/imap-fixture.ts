import { createServer, type Socket } from 'node:net';
import { ImapFlow } from 'imapflow';

/** Scripted protocol peer for SDK integration tests, not an iCloud emulator. */
export async function startImapFixture(options: { nativeMove?: boolean; failCopy?: boolean; failStore?: boolean; failExpunge?: boolean; headers?: string } = {}) {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const seen = new Set<number>();
  const moved = new Set<number>();
  const deleted = new Set<number>([43]);
  const expunged = new Set<number>();
  const uids = [41, 42, 43];
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('* OK local protocol fixture\r\n');
    let buffer = '';
    socket.on('data', data => {
      buffer += data.toString();
      while (buffer.includes('\r\n')) {
        const cut = buffer.indexOf('\r\n');
        const line = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
        const split = line.indexOf(' ');
        const tag = line.slice(0, split), command = line.slice(split + 1);
        commands.push(command);
        const reply = (value: string) => socket.write(value + '\r\n');
        if (/^CAPABILITY/i.test(command)) reply(`* CAPABILITY IMAP4rev1 SPECIAL-USE ${options.nativeMove === false ? '' : 'MOVE '}UIDPLUS`);
        else if (/^LOGIN/i.test(command)) { /* Dummy loopback login only. */ }
        else if (/^LIST/i.test(command)) {
          if (command === 'LIST "" ""') reply('* LIST (\\Noselect) "/" ""');
          else {
            reply('* LIST (\\HasNoChildren) "/" "INBOX"');
            reply('* LIST (\\HasNoChildren \\Archive) "/" "Archive"');
            reply('* LIST (\\HasNoChildren \\Junk) "/" "Junk"');
            reply('* LIST (\\HasNoChildren \\Drafts) "/" "Drafts"');
          }
        } else if (/^(SELECT|EXAMINE)/i.test(command)) {
          reply('* FLAGS (\\Seen \\Flagged \\Deleted)');
          reply('* OK [PERMANENTFLAGS (\\Seen \\Flagged \\Deleted)] flags');
          reply('* 3 EXISTS'); reply('* OK [UIDVALIDITY 900] validity'); reply('* OK [UIDNEXT 44] next');
          reply(`${tag} OK [${/^EXAMINE/.test(command) ? 'READ-ONLY' : 'READ-WRITE'}] selected`); continue;
        } else if (/^UID SEARCH/i.test(command)) {
          reply('* SEARCH 43 41 42');
        } else if (/^UID FETCH/i.test(command)) {
          const range = command.split(' ')[2] ?? '';
          const requested = uids.filter(uid => range.split(',').some(part => {
            const [start, end] = part.split(':').map(Number);
            return end === undefined ? uid === start : start !== undefined && uid >= Math.min(start, end) && uid <= Math.max(start, end);
          }));
          for (const uid of requested.filter(uid => !expunged.has(uid))) {
            if(command.includes('HEADER')&&options.headers){
              const source=Buffer.from(options.headers).subarray(0,65537);
              socket.write(`* 1 FETCH (UID ${uid} BODY[HEADER]<0> {${source.length}}\r\n`);socket.write(source);reply(')');continue;
            }
            reply(`* ${uids.indexOf(uid) + 1} FETCH (UID ${uid} FLAGS (${[seen.has(uid) ? '\\Seen' : '', deleted.has(uid) ? '\\Deleted' : ''].filter(Boolean).join(' ')}) RFC822.SIZE 30 BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1))`);
          }
        } else if (/^UID STORE/i.test(command)) {
          const uid = Number(command.split(' ')[2]);
          if (options.failStore) { reply(`${tag} NO store refused`); continue; }
          const flags = command.includes('\\Deleted') ? deleted : seen;
          if (/\+FLAGS/.test(command)) flags.add(uid); else flags.delete(uid);
        } else if (/^UID COPY/i.test(command)) {
          if (options.failCopy) { reply(`${tag} NO copy refused`); continue; }
          const uid = Number(command.split(' ')[2]);
          reply(`${tag} OK [COPYUID 901 ${uid} ${uid + 40}] copied`); continue;
        } else if (/^UID EXPUNGE/i.test(command)) {
          if (options.failExpunge) { reply(`${tag} NO expunge refused`); continue; }
          const uid = Number(command.split(' ')[2]);
          if (deleted.has(uid)) { expunged.add(uid); reply('* 1 EXPUNGE'); }
        } else if (/^UID MOVE/i.test(command)) {
          const uid = Number(command.split(' ')[2]); moved.add(uid);
          reply(`${tag} OK [COPYUID 901 ${uid} ${uid + 40}] moved`); continue;
        } else if (/^LOGOUT/i.test(command)) {
          reply('* BYE complete'); reply(`${tag} OK logout`); socket.end(); continue;
        } else { reply(`${tag} BAD unsupported fixture command`); continue; }
        reply(`${tag} OK complete`);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listener missing');
  const port = address.port;
  return {
    commands, seen, moved, deleted, expunged,
    createClient: () => new ImapFlow({ host: '127.0.0.1', port, secure: false, doSTARTTLS: false,
      auth: { user: 'fixture', pass: 'dummy' }, logger: false, disableAutoIdle: true,
      connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 3000 }),
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
