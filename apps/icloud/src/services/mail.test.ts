import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MailService } from './mail.js';
import { ICloudMailAdapter } from '../icloud/adapter.js';
import type { MailGateway, MailPolicy, MailSession } from '../domain/mail.js';

interface Mutation { uid: number; seen?: boolean; destination?: string }
function fixture(extra: Partial<MailSession> = {}, options: MailPolicy = {}) {
  const calls: Mutation[] = [];
  const seenUids = new Set<number>();
  const session: MailSession = {
    supportsMove: true,
    list: async () => [{ path: 'Archive', name: 'Archive', selectable: true, specialUse: '\\Archive' }],
    select: async () => ({ uidValidity: '123', uidNext: 100, supportsKeywords: false, release() {} }),
    search: async () => [],
    summaries: async () => [],
    metadata: async uid => ({ size: 10, flags: seenUids.has(uid) ? ['\\Seen'] : [], attachments: [] }),
    download: async () => { throw new Error('Unexpected download'); },
    mark: async (uid, seen) => { calls.push({ uid, seen }); if (seen) seenUids.add(uid); else seenUids.delete(uid); return true; },
    move: async (uid, destination) => { calls.push({ uid, destination }); return {}; },
    flag: async () => true,
    tag: async () => true,
    ...extra,
  };
  const gateway: MailGateway = {
    withSession: run => run(session),
    parse: async () => ({ to: [], text: '' }),
  };
  const service = new MailService({ maxAttachmentBytes: 20, ...options }, gateway);
  return { service, calls };
}
const target = { mailbox: 'INBOX', uid: 42, uidValidity: '123' };
test('mail mutations default to disabled', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.mark({ ...target, seen: true }), { name: 'MailOperationError', code: 'forbidden' });
  await assert.rejects(service.move({ ...target, destination: 'Archive' }), { name: 'MailOperationError', code: 'forbidden' });
  assert.equal(calls.length, 0);
});
test('UIDVALIDITY mismatch prevents mutation', async () => {
  const { service, calls } = fixture({}, { allowWrites: true });
  await assert.rejects(service.mark({ ...target, uidValidity: '124', seen: true }), { name: 'MailOperationError', code: 'stale_identity' });
  assert.equal(calls.length, 0);
});
test('mark addresses exactly one UID', async () => {
  const { service, calls } = fixture({}, { allowWrites: true });
  await service.mark({ ...target, seen: true });
  assert.deepEqual(calls, [{ uid: 42, seen: true }]);
});
test('move rejects servers requiring unsafe expunge fallback', async () => {
  const { service, calls } = fixture({ supportsMove: false }, { allowWrites: true });
  await assert.rejects(service.move({ ...target, destination: 'Archive' }), /safe message move strategy/);
  assert.equal(calls.length, 0);
});
test('oversized message is rejected before downloading source', async () => {
  let fetches = 0;
  const { service } = fixture({ metadata: async () => { fetches++; return { size: 21, attachments: [] }; } });
  await assert.rejects(service.read(target), /download limit/);
  assert.equal(fetches, 1);
});
test('message stream is bounded and cancelled even when size metadata is inaccurate', async () => {
  let cancelled = false;
  const { service } = fixture({ download: async (_uid, _part, maxBytes) => {
    assert.equal(maxBytes, 21);
    return { contentType: 'application/octet-stream',
      chunks: (async function* () { yield new Uint8Array(15); yield new Uint8Array(15); })(),
      cancel() { cancelled = true; } };
  } });
  await assert.rejects(service.read(target), /download limit/);
  assert.equal(cancelled, true);
});
test('search fetches only bounded newest UIDs', async () => {
  let fetched: number[] = [];
  const { service } = fixture({ search: async () => [4, 1, 3, 2],
    summaries: async uids => { fetched = uids; return [
      { uid: 3, from: [], flags: [], size: 1 }, { uid: 4, from: [], flags: [], size: 1 },
    ]; } });
  const result = await service.search({ mailbox: 'INBOX', limit: 2 });
  assert.deepEqual(fetched, [4, 3]); assert.equal(result.truncated, true);
  assert.equal(result.uidValidity, '123'); assert.deepEqual(result.messages.map(x => x.uid), [4, 3]);
});
test('missing UID prevents mark before provider mutation', async () => {
  const { service, calls } = fixture({ metadata: async () => undefined }, { allowWrites: true });
  await assert.rejects(service.mark({ ...target, seen: true }), { code: 'missing' });
  assert.deepEqual(calls, []);
});
test('missing UID prevents move before provider mutation', async () => {
  const { service, calls } = fixture({ metadata: async () => undefined }, { allowWrites: true });
  await assert.rejects(service.move({ ...target, destination: 'Archive' }), { code: 'missing' });
  assert.deepEqual(calls, []);
});
test('read and search request read-only mailbox selection', async () => {
  const selections: boolean[] = [];
  const { service } = fixture({
    select: async (_mailbox, options) => { selections.push(options?.readOnly ?? false); return { uidValidity: '123', uidNext: 100, supportsKeywords: false, release() {} }; },
    download: async () => ({ contentType: 'message/rfc822', chunks: (async function* () { yield new Uint8Array(1); })(), cancel() {} }),
  });
  await service.search({ mailbox: 'INBOX' });
  await service.read(target);
  assert.deepEqual(selections, [true, true]);
});
test('unconfirmed provider mutation reports unknown outcome', async () => {
  const { service } = fixture({ mark: async () => { throw new Error('Connection lost'); } }, { allowWrites: true });
  await assert.rejects(service.mark({ ...target, seen: true }), { code: 'outcome_unknown' });
});
test('iCloud boundary normalizes MIME recipients and dates to domain values', async () => {
  const adapter = new ICloudMailAdapter({ user: 'person@icloud.com', password: 'unused' });
  const source = new TextEncoder().encode('From: Sender <sender@example.com>\r\nTo: Recipient <recipient@example.com>\r\nDate: Thu, 01 Oct 2026 14:00:00 +0000\r\nSubject: Example\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello');
  const parsed = await adapter.parse(source);
  assert.deepEqual(parsed.to, [{ name: 'Recipient', address: 'recipient@example.com' }]);
  assert.equal(parsed.date, '2026-10-01T14:00:00.000Z');
  assert.equal(parsed.text, 'Hello');
});
test('HTML-only MIME becomes useful plain text without executing or retaining script markup', async () => {
  const adapter = new ICloudMailAdapter({ user: 'person@icloud.com', password: 'unused' });
  const source = new TextEncoder().encode('From: Sender <sender@example.com>\r\nSubject: HTML only\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><head><style>.secret { color: red }</style></head><body><h1>Invoice ready</h1><p>Total: &pound;42 &amp; tax.</p><script>SHOULD_NOT_APPEAR()</script></body></html>');
  const parsed = await adapter.parse(source);
  assert.match(parsed.text, /Invoice ready/i);
  assert.match(parsed.text, /£42 & tax/);
  assert.doesNotMatch(parsed.text, /SHOULD_NOT_APPEAR|<script|<h1|\.secret/);
});
test('multipart alternative retains the supplied plain-text part', async () => {
  const adapter = new ICloudMailAdapter({ user: 'person@icloud.com', password: 'unused' });
  const source = new TextEncoder().encode('MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="parts"\r\n\r\n--parts\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPreferred plain content\r\n--parts\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Different HTML content</p>\r\n--parts--\r\n');
  assert.equal((await adapter.parse(source)).text.trim(), 'Preferred plain content');
});
