import {test, expect} from 'bun:test';
import ICAL from 'ical.js';
import {readFileSync, statSync, rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {runLifecycle, runExtendedLifecycle, cleanupCreatedCalendar, LifecycleError, type LifecycleClient, type LifecycleOptions} from './live-lifecycle';
import {escapeXml} from './caldav-client';
const options: LifecycleOptions = {configPath: 'injected', confirmOwnerDiagnostic: true, confirmDedicatedCalendarMutations: true, account: 'owner@example.invalid', start: '2026-01-01T12:00:00Z', end: '2026-01-08T00:00:00Z', origins: ['https://caldav.icloud.com', 'https://p161-caldav.icloud.com']};
const load = () => ({user: options.account, appPassword: 'synthetic-not-a-secret'});
function fixture(fault: 'none' | 'unknown' | 'timeout' | 'shared' | 'changed' | 'bad-home' | 'bad-path' | 'bad-origin' | 'bad-witness' | 'reject-create' | 'sync-unavailable' | 'normalize-floating' | 'bad-sync-self' | 'sync-hydration-race' | 'sync-get-race' = 'none') {
  let calendar = '', marker = '', display = '', exists = false, data = '', revision = 0, eventHref = '', hydrationRacePending = false;
  const requests: string[] = [], reportBodies: string[] = [], home = 'https://p161-caldav.icloud.com/home/', principal = 'https://caldav.icloud.com/principal/';
  const owner = () => fault === 'bad-origin' ? 'https://p999-caldav.icloud.com/principal/' : fault === 'bad-path' ? 'https://p161-caldav.icloud.com/foreign/' : 'https://p161-caldav.icloud.com/principal/';
  const row = (href: string, props: string) => `<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:inapplicable/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>`;
  const multi = (inner: string) => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">${inner}</d:multistatus>`;
  const client: LifecycleClient = {async discover() {return {principal, home, calendars: []};}, async request(method, href, init = {}) {
    requests.push(method + ' ' + href); const response = (status: number, body = '', headers = {}) => ({status, body, headers: new Headers(headers), url: href});
    if (method === 'MKCALENDAR') {
      calendar = href; marker = init.body!.match(/<c:calendar-description>(.*?)<\/c:calendar-description>/)![1]!; display = marker; exists = true;
      if (fault === 'timeout') throw Error('committed but response lost');
      return response(201);
    }
    if (method === 'PROPFIND') {
      if (!exists) return response(404);
      if (init.body?.includes('supported-report-set')) return response(207, multi(row(calendar, '<d:supported-report-set><d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report></d:supported-report-set>')));
      if (href === 'https://p161-caldav.icloud.com/') return response(207, multi(row(href, `<d:current-user-principal><d:href>${fault === 'bad-witness' ? home + 'foreign/' : owner()}</d:href></d:current-user-principal>`)));
      if (href === owner()) return response(207, multi(row(href, `<c:calendar-home-set><d:href>${fault === 'bad-home' ? home + 'wrong/' : home}</d:href></c:calendar-home-set>`)));
      let content = row(calendar, `<d:displayname>${display}</d:displayname><c:calendar-description>${marker}</c:calendar-description><d:owner><d:href>${owner()}</d:href></d:owner><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><cs:invite>${fault === 'shared' ? '<cs:user/>' : ''}</cs:invite><d:acl><d:ace><d:principal><d:href>${owner()}</d:href></d:principal><d:grant><d:privilege><d:all/></d:privilege></d:grant></d:ace></d:acl>`);
      if (new Headers(init.headers).get('depth') === '1') {
        if (data) content += row(eventHref, `<d:getetag>&quot;r${revision}&quot;</d:getetag>`);
        if (fault === 'unknown' && revision >= 2) content += row(calendar + 'foreign.ics', '<d:getetag>&quot;foreign&quot;</d:getetag>');
      }
      return response(207, multi(content));
    }
    if (method === 'REPORT') {
      reportBodies.push(init.body ?? '');
      if (init.body?.includes('calendar-multiget') && init.body.includes('<d:href>http')) return response(207, multi(`<d:response><d:href>${eventHref}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`));
      if (fault === 'sync-unavailable' && init.body?.includes('sync-collection')) return response(403);
      let content = data ? row(eventHref, `<d:getetag>&quot;r${revision}&quot;</d:getetag>${init.body?.includes('sync-collection') ? '' : `<c:calendar-data>${escapeXml(data)}</c:calendar-data>`}`) : eventHref ? `<d:response><d:href>${eventHref}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>` : '';
      if (init.body?.includes('sync-collection')) content = row(calendar, `<d:getetag>&quot;collection${revision}&quot;</d:getetag>${fault === 'bad-sync-self' ? '<c:calendar-data>invalid</c:calendar-data>' : ''}`) + content;
      if (fault === 'sync-hydration-race' && data && init.body?.includes('sync-collection')) content = content.replace(`&quot;r${revision}&quot;`, '&quot;changed&quot;');
      if (fault === 'sync-get-race' && data && init.body?.includes('sync-collection')) hydrationRacePending = true;
      const xml = multi(content).replaceAll('<d:propstat><d:prop><d:inapplicable/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>', ''); return response(207, init.body?.includes('sync-collection') ? xml.replace('</d:multistatus>', `<d:sync-token>urn:revision:${revision}</d:sync-token></d:multistatus>`) : xml);
    }
    if (method === 'GET') {const tag = hydrationRacePending ? '"raced"' : `"r${revision}"`; hydrationRacePending = false; return data ? response(200, data, {etag: tag}) : response(404);}
    if (method === 'PUT') {
      if (fault === 'reject-create' && !data) return response(415);
      const headers = new Headers(init.headers);
      if (data ? headers.get('if-match') !== `"r${revision}"` : headers.get('if-none-match') !== '*') return response(412);
      if (fault === 'changed' && data) return response(412);
      const status = data ? 204 : 201; eventHref = href; const parsed = ICAL.parse(init.body!); parsed[1].reverse(); parsed[2][0][1].reverse(); data = new ICAL.Component(parsed).toString(); if (fault === 'normalize-floating') data = data.replace(/(DTSTART|DTEND):(\d{8}T\d{6})(\r?\n)/g, '$1:$2Z$3'); revision++; return response(status);
    }
    if (method === 'PROPPATCH') {display = marker + ' complete'; return response(207, multi(row(calendar, `<d:displayname>${display}</d:displayname>`)));}
    if (method === 'DELETE') {
      if (href === calendar) {if (data) return response(409); exists = false; return response(204);}
      if (new Headers(init.headers).get('if-match') !== `"r${revision}"`) return response(412);
      data = ''; revision++; return response(204);
    }
    return response(500);
  }};
  return {client, requests, reportBodies, setFault(value: typeof fault) {fault = value;}};
}
async function attempt(fault: Parameters<typeof fixture>[0]) {
  const f = fixture(fault);
  try {return {result: await runLifecycle({...options}, () => f.client, load), requests: f.requests};}
  catch (error) {return {error: error as LifecycleError, requests: f.requests};}
}
function ledger(path: string) {expect(statSync(path).mode & 0o777).toBe(0o600); return JSON.parse(readFileSync(path, 'utf8'));}
function clean(path: string) {rmSync(dirname(path), {recursive: true});}
test('dedicated lifecycle conditional writes and readbacks complete with retained private evidence', async () => {
  const {result, requests} = await attempt('none'); expect(result?.complete).toBe(true);
  const path = result!.manifestPath;
  try {const m = ledger(path); expect(m.state).toBe('complete'); expect(m.created201).toBe(true); expect(m.resources[0].deleted).toBe(true); expect(m.pending).toBeNull(); expect(requests.filter(r => r.startsWith('MKCALENDAR '))).toHaveLength(1); expect(requests.filter(r => r.startsWith('DELETE '))).toHaveLength(2); expect(JSON.stringify(m)).not.toContain('synthetic-not-a-secret');} finally {clean(path);}
});
for (const fault of ['unknown', 'timeout', 'shared', 'changed', 'bad-home', 'bad-path', 'bad-origin', 'bad-witness'] as const) test(`${fault} stops without cleanup or replay and retains ledger`, async () => {
  const {error, requests} = await attempt(fault); expect(error).toBeInstanceOf(LifecycleError); const path = error!.manifestPath!;
  try {const m = ledger(path); expect(m.state).toBe('stopped-needs-reconciliation'); expect(requests.filter(r => r.startsWith('MKCALENDAR '))).toHaveLength(1); expect(requests.filter(r => r.startsWith('DELETE '))).toHaveLength(0); if (fault === 'timeout') expect(m.pending).toBe('create-calendar');} finally {clean(path);}
});
test('account mismatch prevents discovery and manifest/write creation', async () => {
  let called = false;
  await expect(runLifecycle(options, () => {called = true; return fixture().client;}, () => ({user: 'different@example.invalid', appPassword: 'synthetic'}))).rejects.toMatchObject({code: 'ACCOUNT_MISMATCH', manifestPath: undefined}); expect(called).toBe(false);
});

test('exact ledger cleanup after witnessed alias never replays creation', async () => {
  const f = fixture('bad-home'); let path = '';
  try {await runLifecycle(options, () => f.client, load);} catch (error) {path = (error as LifecycleError).manifestPath!;}
  expect(path).not.toBe('');
  try {f.setFault('none'); const result = await cleanupCreatedCalendar(path, options, () => f.client, load); expect(result.complete).toBe(true); const m = ledger(path); expect(m.state).toBe('recovered-empty-calendar-removed'); expect(m.ownerPrincipal).toBe('https://p161-caldav.icloud.com/principal/'); expect(m.principal).toBe('https://caldav.icloud.com/principal/'); expect(f.requests.filter(r => r.startsWith('MKCALENDAR '))).toHaveLength(1); expect(f.requests.filter(r => r.startsWith('DELETE '))).toHaveLength(1); await expect(cleanupCreatedCalendar(path, options, () => f.client, load)).rejects.toMatchObject({code: 'LEDGER_NOT_ELIGIBLE_FOR_EMPTY_CLEANUP'});} finally {clean(path);}
});

test('extended date/floating/DST/BYDAY cases compose field edits, search, sync and stale protections', async () => {
  const f = fixture(); const result = await runExtendedLifecycle(options, () => f.client, load);
  try {expect(result.complete).toBe(true); expect(result.allCasesVerified).toBe(true); expect(result.providerTextFilterIgnored).toBe(true); expect(result.localTextSearchVerified).toBe(true); expect(f.reportBodies.filter(xml => xml.includes('text-match')).every(xml => xml.includes('time-range'))).toBe(true); expect(result.observations.filter(o => o.outcome === 'created-updated-deleted')).toHaveLength(6); expect(result.observations.filter(o => o.outcome === 'create-update-delete-observed')).toHaveLength(6); expect(result.observations.filter(o => o.outcome === 'matched-exact-resource')).toHaveLength(12); expect(f.reportBodies.filter(xml => xml.includes('calendar-multiget')).every(xml => xml.includes('<d:href>/home/') && !xml.includes('<d:href>http'))).toBe(true); expect(result.observations.filter(o => o.outcome === 'rejected-412')).toHaveLength(12); const m = ledger(result.manifestPath); expect(m.resources).toHaveLength(6); expect(m.resources.every((r: any) => r.deleted)).toBe(true);} finally {clean(result.manifestPath);}
});

for (const fault of ['reject-create', 'sync-unavailable', 'normalize-floating'] as const) test(`${fault} explicitly remains unverified while dedicated cleanup completes`, async () => {
  const f = fixture(fault); const result = await runExtendedLifecycle(options, () => f.client, load);
  try {expect(result.lifecycleComplete).toBe(true); expect(result.allCasesVerified).toBe(false); const observations = result.observations.map(o => o.outcome); if (fault === 'reject-create') {expect(observations.filter(o => o === 'create-rejected-http-415')).toHaveLength(6); expect(f.requests.filter(r => r.startsWith('DELETE '))).toHaveLength(1);} if (fault === 'sync-unavailable') {expect(observations).toContain('unavailable-http-403'); expect(observations).not.toContain('create-update-delete-observed');} if (fault === 'normalize-floating') {expect(observations).toContain('provider-representation-not-preserved'); expect(observations).toContain('normalized-resource-cleaned');} expect(ledger(result.manifestPath).state).toBe('complete');} finally {clean(result.manifestPath);}
});

test('initial sync malformed self-row stops before PUT; exact planned404 ledger cleanup does not adopt a resource', async () => {
  const f = fixture('bad-sync-self'); let path = '';
  try {await runExtendedLifecycle(options, () => f.client, load);} catch (error) {expect((error as LifecycleError).code).toBe('INVALID_SYNC_COLLECTION_METADATA'); path = (error as LifecycleError).manifestPath!;}
  try {expect(path).not.toBe(''); expect(f.requests.filter(r => r.startsWith('PUT '))).toHaveLength(0); const before = ledger(path); expect(before.resources).toHaveLength(1); expect(before.resources[0].etag).toBeNull(); const result = await cleanupCreatedCalendar(path, options, () => f.client, load); expect(result.complete).toBe(true); expect(f.requests.filter(r => r.startsWith('DELETE '))).toHaveLength(1);} finally {clean(path);}
});

test('ETag-only sync mismatch stops before update and exact confirmed-resource cleanup uses conditional DELETE', async () => {
  const f = fixture('sync-hydration-race'); let path = '';
  try {await runExtendedLifecycle(options, () => f.client, load);} catch (error) {expect((error as LifecycleError).code).toBe('SYNC_ETAG_MISMATCH'); path = (error as LifecycleError).manifestPath!;}
  try {const m = ledger(path); expect(m.pending).toBeNull(); expect(m.resources[0].etag).toBeTruthy(); expect(m.failure.kind).toBe('LifecycleError'); expect(m.failure.code).toBe('SYNC_ETAG_MISMATCH'); expect(f.requests.filter(r => r.startsWith('PUT '))).toHaveLength(1); const result = await cleanupCreatedCalendar(path, options, () => f.client, load); expect(result.complete).toBe(true); expect(f.requests.filter(r => r.startsWith('DELETE '))).toHaveLength(2); expect(ledger(path).resources[0].deleted).toBe(true);} finally {clean(path);}
});

test('hydration GET version race leaves recorded ETag unchanged and performs no update or cleanup', async () => {
  const f = fixture('sync-get-race'); let path = '';
  try {await runExtendedLifecycle(options, () => f.client, load);} catch (error) {expect((error as LifecycleError).code).toBe('SYNC_HYDRATION_RACE_OR_FAILURE'); path = (error as LifecycleError).manifestPath!;}
  try {const m = ledger(path); expect(m.resources[0].etag).toBe('"r1"'); expect(m.pending).toBeNull(); expect(f.requests.filter(r => r.startsWith('PUT '))).toHaveLength(1); expect(f.requests.filter(r => r.startsWith('DELETE '))).toHaveLength(0);} finally {clean(path);}
});
