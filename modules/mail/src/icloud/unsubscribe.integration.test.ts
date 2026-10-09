import { expect, test } from 'bun:test';
import { createServer } from 'node:net';
import { createServer as createHttpServer, request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import nodemailer from 'nodemailer';
import { createOneClickPost, createUnsubscribeGateway, type OneClickTransport } from './unsubscribe.js';
import { UnsubscribeService } from '../services/unsubscribe.js';

// Local fixtures only: no Apple account, DNS provider or public unsubscribe endpoint.
test('mailto submission traverses a real SMTP socket with only header-derived fields', async () => {
  let message = ''; let data = false;
  const smtp = createServer(socket => {
    socket.write('220 fixture ESMTP\r\n'); let pending = '';
    socket.on('data', chunk => {
      pending += chunk.toString();
      while (pending.includes('\r\n')) {
        const index = pending.indexOf('\r\n'); const line = pending.slice(0, index); pending = pending.slice(index + 2);
        if (data) { if (line === '.') { data = false; socket.write('250 queued\r\n'); } else message += line + '\r\n'; }
        else if (line.startsWith('EHLO')) socket.write('250 fixture\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 Continue\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  }).listen(0, '127.0.0.1');
  await once(smtp, 'listening'); const address = smtp.address(); if (!address || typeof address === 'string') throw Error('No fixture port');
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: address.port, secure: false, ignoreTLS: true });
  try {
    const gateway = createUnsubscribeGateway({ sendMail: async input => {
      const result = await transport.sendMail({ from: 'owner@example.net', ...input });
      return { messageId: result.messageId, accepted: result.accepted.map(String), rejected: result.rejected.map(String) };
    } });
    const service = new UnsubscribeService({ fetchRaw: async () => Buffer.from('From: sender@example.com\r\nList-Unsubscribe: <mailto:leave@example.com?subject=Stop&body=Remove%20me>\r\n\r\nNews') }, gateway, { enabled: true });
    const target = { mailbox: 'INBOX', uid: 1, uidValidity: '1' };
    const candidate = (await service.discover(target)).candidates[0]!;
    expect(await service.submit({ ...target, candidateId: candidate.candidateId })).toMatchObject({ status: 'submitted' });
    expect(message).toContain('To: leave@example.com'); expect(message).toContain('Subject: Stop'); expect(message).toContain('Remove me');
  } finally { transport.close(); smtp.close(); }
});

test('production POST policy uses pinned DNS, exact unauthenticated payload, no redirects, and response bound', async () => {
  const received: { method?: string; headers: IncomingHttpHeaders; body: string }[] = [];
  let mode: 'ok' | 'redirect' | 'large' = 'ok';
  const http = createHttpServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      received.push({ method: req.method, headers: req.headers, body });
      if (mode === 'redirect') { res.writeHead(302, { Location: 'https://redirect.example/remove' }); res.end(); }
      else if (mode === 'large') { res.writeHead(200); res.end('x'.repeat(65537)); }
      else { res.writeHead(204); res.end(); }
    });
  }).listen(0, '127.0.0.1');
  await once(http, 'listening'); const address = http.address(); if (!address || typeof address === 'string') throw Error('No fixture port');
  let resolutions = 0; let requests = 0;
  const transport: OneClickTransport = {
    resolve: async hostname => { expect(hostname).toBe('example.com'); resolutions++; return [{ address: '8.8.8.8', family: 4 }]; },
    request: (url, options, response) => {
      requests++;
      expect(url.href).toBe('https://example.com/remove');
      expect(options.agent).toBe(false);
      expect(options.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength('List-Unsubscribe=One-Click') });
      // Inspect the exact production lookup callback, including the all-addresses branch.
      const pinned = options.lookup!;
      pinned('example.com', { all: false }, (error, ip, family) => {
        expect(error).toBeNull(); expect(ip).toBe('8.8.8.8'); expect(family).toBe(4);
      });
      pinned('example.com', { all: true }, (error, addresses) => {
        expect(error).toBeNull(); expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]);
      });
      // Only the trusted fixture connector substitutes the socket destination.
      // The production request options/policy remain intact above this seam.
      return httpRequest({ ...options, hostname: '127.0.0.1', port: address.port, path: '/remove', lookup: undefined }, response);
    },
  };
  try {
    const post = createOneClickPost(transport);
    await post(new URL('https://example.com/remove'));
    expect(received[0]?.method).toBe('POST');
    expect(received[0]?.body).toBe('List-Unsubscribe=One-Click');
    expect(received[0]?.headers.authorization).toBeUndefined();
    expect(received[0]?.headers.cookie).toBeUndefined();
    mode = 'redirect';
    await expect(post(new URL('https://example.com/remove'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(requests).toBe(2); expect(received).toHaveLength(2);
    mode = 'large';
    await expect(post(new URL('https://example.com/remove'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(requests).toBe(3); expect(resolutions).toBe(3);
    for (const addresses of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
      const blocked = createOneClickPost({ ...transport, resolve: async () => addresses });
      await expect(blocked(new URL('https://example.com/remove'))).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(requests).toBe(3);
  } finally { http.closeAllConnections(); http.close(); }
});
