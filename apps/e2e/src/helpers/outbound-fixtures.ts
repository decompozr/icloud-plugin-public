import {createServer,type Socket} from 'node:net';
import nodemailer from 'nodemailer';
import {ImapFlow} from 'imapflow';
import {ICloudOutboundAdapter} from '../../../icloud/dist/icloud/outbound.js';
const credentials={user:'sender@example.invalid',password:'dummy'};
export async function smtpFixture(drop = false) {
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
        else if (/^RCPT TO:.*rejected@/.test(line)) socket.write('550 recipient refused\r\n');
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
export async function imapFixture(mode: 'ok' | 'missing' | 'drop' | 'reject' = 'ok') {
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
