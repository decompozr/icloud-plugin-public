import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImapFlow } from 'imapflow';
import { MailService } from './mail.js';
import { ICloudMailAdapter } from '../icloud/adapter.js';
import type { MailGateway, MailSession, Mailbox, ProviderSearch } from '../domain/mail.js';

const target = { mailbox: 'INBOX', uid: 41, uidValidity: '900' };
const boxes: Mailbox[] = [
  { path: 'INBOX', name: 'INBOX', selectable: true },
  { path: 'saved', name: 'Saved', specialUse: '\\Archive', selectable: true },
  { path: 'deleted', name: 'Deleted', specialUse: '\\Trash', selectable: true },
  { path: 'spam', name: 'Spam', specialUse: '\\Junk', selectable: true },
];
function fixture(overrides: Partial<MailSession> = {}) {
  const calls: string[] = [];
  const flags = new Map<number, Set<string>>();
  const setFlag = (uid: number, flag: string, enabled: boolean) => {
    const current = flags.get(uid) ?? new Set<string>();
    if (enabled) current.add(flag); else current.delete(flag);
    flags.set(uid, current);
  };
  const session: MailSession = {
    supportsMove: true, list: async () => boxes,
    select: async (_mailbox, options) => { calls.push(`select:${options?.readOnly}`); return { uidValidity: '900', uidNext: 100, supportsKeywords: true, release() {} }; },
    search: async () => [41, 42, 43],
    summaries: async uids => uids.map(uid => ({ uid, from: [], flags: [] })),
    metadata: async uid => { calls.push(`metadata:${uid}`); return { size: 1, flags: [...(flags.get(uid) ?? [])], attachments: [{ partId: '2', contentType: 'image/png' }] }; },
    download: async () => ({ contentType: 'message/rfc822', chunks: (async function* () { yield new Uint8Array([1]); })(), cancel() {} }),
    mark: async (uid, seen) => { calls.push(`mark:${uid}:${seen}`); setFlag(uid, '\\Seen', seen); return true; },
    flag: async (uid, flagged) => { calls.push(`flag:${uid}:${flagged}`); setFlag(uid, '\\Flagged', flagged); return true; },
    tag: async (uid, keyword, enabled) => { calls.push(`tag:${uid}:${keyword}:${enabled}`); setFlag(uid, keyword, enabled); return true; },
    move: async (uid, destination) => { calls.push(`move:${uid}:${destination}`); return { uid: uid + 100, uidValidity: '901' }; },
    ...overrides,
  };
  const gateway: MailGateway = { withSession: run => run(session), parse: async () => ({ to: [], text: 'x'.repeat(800) }) };
  return { service: new MailService({ allowWrites: true }, gateway), calls, session };
}

test('search uses fixed UID ceiling, filter binding and deterministic pages', async () => {
  const requests: ProviderSearch[] = [];
  let matches = [43, 41, 44, 42];
  const { service } = fixture({ search: async (_query, options) => { requests.push(options ?? {}); return matches; } });
  const first = await service.search({ mailbox: 'INBOX', query: 'invoice', unreadOnly: true, limit: 2 });
  assert.deepEqual(first.messages.map(message => message.uid), [44, 43]);
  assert.equal(first.nextCursor?.startingUpperUid, 99);
  matches = [200, 43, 41, 44, 42];
  const second = await service.search({ mailbox: 'INBOX', query: 'invoice', unreadOnly: true, limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.messages.map(message => message.uid), [42, 41]);
  assert.deepEqual(requests, [{ unreadOnly: true, beforeUid: 100 }, { unreadOnly: true, beforeUid: 43 }]);
  await assert.rejects(service.search({ mailbox: 'INBOX', query: 'different', unreadOnly: true, cursor: first.nextCursor }), { code: 'stale_identity' });
  await assert.rejects(service.search({ mailbox: 'INBOX', query: 'invoice', unreadOnly: false, cursor: first.nextCursor }), { code: 'stale_identity' });
});
test('search defaults to 20 and refuses more than 100', async () => {
  const { service } = fixture({ search: async () => Array.from({ length: 60 }, (_, i) => i + 1) });
  assert.equal((await service.search({ mailbox: 'INBOX' })).messages.length, 20);
  await assert.rejects(service.search({ mailbox: 'INBOX', limit: 101 }), { code: 'invalid_input' });
});
test('summary is a bounded structured excerpt without attachment data', async () => {
  const { service } = fixture();
  const summary = await service.read({ ...target, mode: 'summary' });
  assert.equal(summary.mode, 'summary'); assert.equal(summary.excerpt?.length, 500);
  assert.equal(summary.truncated, true); assert.equal('attachments' in summary, false);
  const full = await service.read(target);
  assert.equal(full.text.length, 800); assert.equal(full.attachments?.length, 1);
});
test('batch preflights every UID before the first mutation', async () => {
  const { service, calls } = fixture();
  const result = await service.batch({ ...target, uids: [41, 42], action: { type: 'flag', flagged: true } });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['select:false', 'metadata:41', 'metadata:42', 'metadata:41', 'flag:41:true', 'metadata:41', 'metadata:42', 'flag:42:true', 'metadata:42']);
});
test('duplicate, missing and stale batch inputs cause zero mutations', async () => {
  const { service, calls } = fixture({ metadata: async uid => uid === 42 ? undefined : { attachments: [] } });
  await assert.rejects(service.batch({ ...target, uids: [41, 41], action: { type: 'mark', seen: true } }), { code: 'invalid_input' });
  await assert.rejects(service.batch({ ...target, uids: [41, 42], action: { type: 'mark', seen: true } }), { code: 'missing' });
  await assert.rejects(service.batch({ ...target, uidValidity: '901', uids: [41], action: { type: 'mark', seen: true } }), { code: 'stale_identity' });
  assert.equal(calls.some(call => call.startsWith('mark:')), false);
});
test('batch keeps known per-item rejections separate from successful changes', async () => {
  const { service } = fixture({ mark: async uid => uid !== 42 });
  const result = await service.batch({ ...target, uids: [41, 42, 43], action: { type: 'mark', seen: false } });
  assert.equal(result.status, 'partial'); assert.deepEqual(result.items.map(item => item.status), ['succeeded', 'failed', 'succeeded']);
});
test('unknown mutation outcome stops remaining batch items without retries', async () => {
  const touched: number[] = [];
  const { service } = fixture({ metadata: async uid => ({ flags: uid === 41 ? ['\\Flagged'] : [], attachments: [] }), flag: async uid => { touched.push(uid); if (uid === 42) throw new Error('Socket lost'); return true; } });
  const result = await service.batch({ ...target, uids: [41, 42, 43], action: { type: 'flag', flagged: true } });
  assert.equal(result.status, 'unknown'); assert.deepEqual(touched, [41, 42]);
  assert.deepEqual(result.items.map(item => item.status), ['succeeded', 'outcome_unknown', 'not_attempted']);
});
test('folder actions resolve SPECIAL-USE and restore requires explicit existing destination', async () => {
  const { service, calls } = fixture();
  for (const action of ['archive', 'trash', 'junk', 'not_junk'] as const) await service.organize({ ...target, action });
  assert.deepEqual(calls.filter(call => call.startsWith('move:')), ['move:41:saved', 'move:41:deleted', 'move:41:spam', 'move:41:INBOX']);
  await assert.rejects(service.organize({ ...target, action: 'restore' }), { code: 'invalid_input' });
  await assert.rejects(service.organize({ ...target, action: 'restore', destination: 'nonexistent' }), { code: 'missing' });
  assert.equal((await service.organize({ ...target, action: 'restore', destination: 'saved' })).destination, 'saved');
});
test('move returns only provider-verified destination identity', async () => {
  const { service } = fixture();
  assert.deepEqual((await service.move({ ...target, destination: 'saved' })).destinationTarget, { mailbox: 'saved', uid: 141, uidValidity: '901' });
  const unknownMapping = fixture({ move: async () => ({}) });
  await assert.rejects(unknownMapping.service.move({ ...target, destination: 'saved' }), { code: 'outcome_unknown' });
});
test('keyword support comes from writable selection and rejects unsupported or system flags', async () => {
  const { service, calls } = fixture();
  await service.tag({ ...target, keyword: 'Project-A', enabled: true });
  await service.tag({ ...target, keyword: 'Project-A', enabled: false });
  assert.deepEqual(calls.filter(call => call.startsWith('tag:')), ['tag:41:Project-A:true', 'tag:41:Project-A:false']);
  await assert.rejects(service.tag({ ...target, keyword: '\\Seen', enabled: true }), { code: 'invalid_input' });
  const unsupported = fixture({ select: async () => ({ uidValidity: '900', uidNext: 100, supportsKeywords: false, release() {} }) });
  await assert.rejects(unsupported.service.tag({ ...target, keyword: 'Project', enabled: true }), { code: 'unsupported_capability' });
  assert.equal(unsupported.calls.some(call => call.startsWith('tag:')), false);
});
test('internal raw source access checks identity and remains read-only', async () => {
  const { service, calls } = fixture();
  assert.deepEqual([...await service.fetchRaw(target)], [1]);
  assert.equal(calls[0], 'select:true');
  await assert.rejects(service.fetchRaw({ ...target, uidValidity: '901' }), { code: 'stale_identity' });
});

function sdkFixture() {
  const client = new ImapFlow({ host: '127.0.0.1', port: 1, secure: false, auth: { user: 'unused', pass: 'unused' }, logger: false });
  client.connect = async () => {};
  client.logout = async () => {};
  return { client, adapter: new ICloudMailAdapter({ user: 'unused@example.invalid', password: 'unused' }, { createClient: () => client }) };
}
test('adapter refuses false SEARCH rather than inventing an empty result', async () => {
  const { client, adapter } = sdkFixture();
  client.search = async () => false;
  await assert.rejects(adapter.withSession(session => session.search()), { code: 'upstream_failure' });
});
test('adapter emits explicit UID keyword/flag operations and distinguishes NO from transport uncertainty', async () => {
  const { client, adapter } = sdkFixture();
  const stores: unknown[] = [];
  client.messageFlagsAdd = async (uid, flags, options) => { stores.push({ uid, flags, options }); return true; };
  await adapter.withSession(session => session.tag(41, 'Project', true));
  await adapter.withSession(session => session.flag(42, true));
  assert.deepEqual(stores, [{ uid: 41, flags: ['Project'], options: { uid: true } }, { uid: 42, flags: ['\\Flagged'], options: { uid: true } }]);
  client.messageFlagsAdd = async () => { throw { responseStatus: 'NO' }; };
  await assert.rejects(adapter.withSession(session => session.flag(41, true)), { code: 'upstream_failure' });
  client.messageFlagsAdd = async () => { throw new Error('Disconnected'); };
  await assert.rejects(adapter.withSession(session => session.flag(41, true)), { code: 'outcome_unknown' });
});
test('adapter normalizes COPYUID map for exactly the requested source UID', async () => {
  const { client, adapter } = sdkFixture(); client.capabilities.set('MOVE', true);
  client.messageMove = async () => ({ path: 'INBOX', destination: 'saved', uidValidity: 901n, uidMap: new Map([[41, 81], [42, 82]]) });
  assert.deepEqual(await adapter.withSession(session => session.move(41, 'saved')), { uid: 81, uidValidity: '901' });
  assert.deepEqual(await adapter.withSession(session => session.move(43, 'saved')), {});
});
test('adapter keyword capability requires wildcard PERMANENTFLAGS from a writable selection', async () => {
  const { client, adapter } = sdkFixture();
  let writable = false, wildcard = true;
  client.getMailboxLock = async () => {
    client.mailbox = { path: 'INBOX', delimiter: '/', flags: new Set(), permanentFlags: new Set(wildcard ? ['\\*'] : ['\\Seen']),
      uidValidity: 900n, uidNext: 100, exists: 3, readOnly: !writable };
    return { path: 'INBOX', release() {} };
  };
  assert.equal((await adapter.withSession(session => session.select('INBOX', { readOnly: true }))).supportsKeywords, false);
  writable = true;
  assert.equal((await adapter.withSession(session => session.select('INBOX', { readOnly: false }))).supportsKeywords, true);
  wildcard = false;
  assert.equal((await adapter.withSession(session => session.select('INBOX', { readOnly: false }))).supportsKeywords, false);
});
test('ambiguous SPECIAL-USE destinations reject the complete batch before writes', async () => {
  const { service, calls } = fixture({ list: async () => [...boxes, { path: 'other-trash', name: 'Other Trash', specialUse: '\\Trash', selectable: true }] });
  await assert.rejects(service.batch({ ...target, uids: [41, 42], action: { type: 'organize', action: 'trash' } }), { code: 'ambiguous_destination' });
  assert.equal(calls.some(call => call.startsWith('move:')), false);
});
test('UID disappearing after batch preflight is rejected before its STORE', async () => {
  let reads = 0;
  const { service, calls } = fixture({ metadata: async () => ++reads === 1 ? { flags: [], attachments: [] } : undefined });
  const result = await service.batch({ ...target, uids: [41], action: { type: 'mark', seen: true } });
  assert.equal(result.status, 'rejected');
  assert.equal(result.items[0]?.status, 'failed');
  assert.equal(calls.some(call => call.startsWith('mark:')), false);
});
test('UID disappearing after STORE has unknown outcome and remaining UIDs are untouched', async () => {
  let reads = 0;
  const { service, calls } = fixture({ metadata: async () => ++reads <= 3 ? { flags: [], attachments: [] } : undefined });
  const result = await service.batch({ ...target, uids: [41, 42], action: { type: 'mark', seen: true } });
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.items.map(item => item.status), ['outcome_unknown', 'not_attempted']);
  assert.deepEqual(calls.filter(call => call.startsWith('mark:')), ['mark:41:true']);
});
test('tagged OK without the requested flag state is never reported as succeeded', async () => {
  const { service } = fixture({ metadata: async () => ({ flags: [], attachments: [] }), mark: async () => true });
  await assert.rejects(service.mark({ ...target, seen: true }), { code: 'outcome_unknown' });
});
test('explicitly permitted custom keyword works without wildcard support', async () => {
  const { service, calls } = fixture({ select: async () => ({ uidValidity: '900', uidNext: 100, supportsKeywords: false, allowedKeywords: ['Project'], release() {} }) });
  await service.tag({ ...target, keyword: 'Project', enabled: true });
  await assert.rejects(service.tag({ ...target, keyword: 'Other', enabled: true }), { code: 'unsupported_capability' });
  assert.deepEqual(calls.filter(call => call.startsWith('tag:')), ['tag:41:Project:true']);
});
