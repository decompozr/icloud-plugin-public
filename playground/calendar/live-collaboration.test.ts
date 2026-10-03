import {test, expect} from 'bun:test';
import ICAL from 'ical.js';
import {readFileSync, rmSync, statSync} from 'node:fs';
import {dirname} from 'node:path';
import {runCollaboration, type CollaborationOptions} from './live-collaboration';
import {type LifecycleClient, LifecycleError} from './live-lifecycle';
import {escapeXml} from './caldav-client';
const future = new Date(Date.now() + 2 * 86400000); future.setUTCHours(16, 0, 0, 0);
const iso = (date: Date) => date.toISOString().replace('.000Z', 'Z');
const options: CollaborationOptions = {configPath: 'injected', account: 'Scottchu@icloud.com', confirmOwnerDiagnostic: true, confirmCollaboration: true, kind: 'invitation', eventStart: iso(future), eventEnd: iso(new Date(future.getTime() + 900000)), start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', origins: ['https://caldav.icloud.com']};
const load = () => ({user: options.account, appPassword: 'synthetic-secret'});
const clean = (path: string) => rmSync(dirname(path), {recursive: true});
function fixture(fault: 'none' | 'timeout-put' | 'unsupported-share' | 'foreign-organizer' | 'no-schedule-tag' | 'fresh404' | 'omitted-invite' | 'bad-options' | 'duplicate-organizer' | 'acl404' | 'invite403' | 'shared404' | 'bare-organizer' | 'foreign-share-organizer' = 'none') {
  let exists = false, calendar = '', marker = '', eventHref = '', data = '', revision = 0, shared = false, foreign = false;
  const principal = 'https://caldav.icloud.com/principal/', home = 'https://caldav.icloud.com/home/';
  const log: {method: string; body: string; headers: Headers}[] = [];
  const row = (href: string, props: string) => `<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  const multi = (rows: string) => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">${rows}</d:multistatus>`;
  const client: LifecycleClient = {async discover() {return {principal, home, calendars: []};}, async request(method, href, init = {}) {
    log.push({method, body: init.body ?? '', headers: new Headers(init.headers)});
    const response = (status: number, body = '', headers = {}) => ({status, body, headers: new Headers(headers), url: href});
    if (method === 'OPTIONS') return response(fault === 'bad-options' ? 500 : 200, '', {dav: 'calendar-auto-schedule, calendarserver-sharing'});
    if (method === 'PROPFIND') {
      if (href === principal) return response(207, multi(row(href, '<c:calendar-user-address-set><d:href>mailto:Scottchu@icloud.com</d:href><d:href>/principal/</d:href></c:calendar-user-address-set>')));
      if (!exists) return response(404);
      const user = (email: string) => `<cs:user><d:href>mailto:${email}</d:href><cs:access><cs:read/></cs:access><cs:invite-noresponse/></cs:user>`;
      let content = row(calendar, `<c:calendar-description>${marker}</c:calendar-description><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:owner><d:href>${principal}</d:href></d:owner><cs:invite>${shared ? user('chuhsinheng@gmail.com') : ''}${foreign ? user('foreign@example.invalid') : ''}</cs:invite>${fault === 'unsupported-share' ? '' : '<cs:allowed-sharing-modes><cs:can-be-shared/></cs:allowed-sharing-modes>'}`);
      if (['fresh404', 'invite403', 'shared404'].includes(fault) && !shared) content = content.replace('<cs:invite></cs:invite>', '').replace('</d:response>', '<d:propstat><d:prop><cs:invite/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>');
      if (fault === 'invite403') content = content.replace('404 Not Found', '403 Forbidden');
      if (fault === 'shared404') content = content.replace('<c:calendar/>', '<c:calendar/><cs:shared-owner/>');
      if (fault === 'acl404') content = content.replace('<cs:invite></cs:invite>', '').replace('</d:response>', '<d:propstat><d:prop><d:acl/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>');
      if (fault === 'omitted-invite') content = content.replace('<cs:invite></cs:invite>', '');
      if (shared && ['fresh404', 'duplicate-organizer', 'bare-organizer', 'foreign-share-organizer'].includes(fault)) content = content.replace('<cs:invite>', '<cs:invite>' + '<cs:organizer><d:href>mailto:Scottchu@icloud.com</d:href></cs:organizer>'.repeat(fault === 'duplicate-organizer' ? 2 : 1));
      if (fault === 'bare-organizer') content = content.replace('<cs:organizer><d:href>mailto:Scottchu@icloud.com', '<cs:organizer><d:href>Scottchu@icloud.com');
      if (fault === 'foreign-share-organizer') content = content.replace('<cs:organizer><d:href>mailto:Scottchu@icloud.com', '<cs:organizer><d:href>foreign@example.invalid');
      if (new Headers(init.headers).get('depth') === '1' && data) content += row(eventHref, `<d:getetag>&quot;r${revision}&quot;</d:getetag>`);
      return response(207, multi(content));
    }
    if (method === 'MKCALENDAR') {calendar = href; marker = init.body!.match(/<c:calendar-description>(.*?)<\/c:calendar-description>/)![1]!; exists = true; return response(201);}
    if (method === 'PUT') {eventHref = href; data = init.body!; revision++; const cal = new ICAL.Component(ICAL.parse(data)); cal.getFirstSubcomponent('vevent')!.updatePropertyWithValue('organizer', fault === 'foreign-organizer' ? '/foreign/' : '/principal/'); cal.getFirstSubcomponent('vevent')!.getFirstProperty('attendee')!.setParameter('schedule-status', '1.2'); data = cal.toString(); if (fault === 'timeout-put') throw Error('synthetic response lost'); return response(201);}
    if (method === 'GET') return data ? response(200, data, {etag: `"r${revision}"`, ...(fault === 'no-schedule-tag' ? {} : {'schedule-tag': `"s${revision}"`})}) : response(404);
    if (method === 'POST') {shared = !init.body!.includes('<cs:remove>'); return response(200);}
    if (method === 'DELETE') {if (href === calendar) {if (data || shared) return response(409); exists = false; return response(204);} if (new Headers(init.headers).get('if-match') !== `"r${revision}"` || (fault !== 'no-schedule-tag' && new Headers(init.headers).get('if-schedule-tag-match') !== `"s${revision}"`)) return response(412); data = ''; return response(204);}
    return response(500);
  }};
  return {client, log, get data() {return data;}, wrongAttendee() {const cal = new ICAL.Component(ICAL.parse(data)); cal.getFirstSubcomponent('vevent')!.getFirstProperty('attendee')!.setValue('mailto:foreign@example.invalid'); data = cal.toString();}, foreign() {foreign = true;}, reply() {const cal = new ICAL.Component(ICAL.parse(data)); cal.getFirstSubcomponent('vevent')!.getFirstProperty('attendee')!.setParameter('partstat', 'ACCEPTED'); data = cal.toString(); revision++;}};
}
test('invitation start uses one METHOD-free auto-scheduling PUT and waits for inspect/explicit cleanup', async () => {
  const f = fixture(), start = await runCollaboration('start', options, undefined, () => f.client, load), path = start.manifestPath!;
  try {
    expect(start.senderStored).toBe(true); expect(start.partstat).toBe('NEEDS-ACTION'); expect(start.scheduleStatus).toBe('1.2'); expect(start.deliveryVerified).toBe(false);
    expect(statSync(path).mode & 0o777).toBe(0o600); expect(f.log.filter(r => r.method === 'PUT')).toHaveLength(1); expect(f.log.filter(r => ['POST', 'DELETE'].includes(r.method))).toHaveLength(0); expect(f.data).not.toContain('METHOD:'); expect(f.data).not.toContain('VALARM'); expect(JSON.stringify(JSON.parse(readFileSync(path, 'utf8')))).not.toContain('synthetic-secret');
    f.reply(); const before = f.log.length; const inspect = await runCollaboration('inspect', options, path, () => f.client, load); expect(inspect.partstat).toBe('ACCEPTED'); expect(f.log.slice(before).every(r => ['GET', 'PROPFIND'].includes(r.method))).toBe(true);
    const end = await runCollaboration('cleanup', options, path, () => f.client, load); expect(end.senderArtifactsAbsent).toBe(true); const deletes = f.log.filter(r => r.method === 'DELETE'); expect(deletes).toHaveLength(2); expect(deletes[0]!.headers.get('if-match')).toBe('"r2"'); expect(deletes[0]!.headers.get('if-schedule-tag-match')).toBe('"s2"'); expect(f.log.filter(r => r.method === 'PUT')).toHaveLength(1);
  } finally {clean(path);}
});
test('uncertain invitation PUT retains intent; inspect does not replay or authorize cleanup', async () => {
  const f = fixture('timeout-put'); let path = '';
  try {await runCollaboration('start', options, undefined, () => f.client, load);} catch (error) {path = (error as LifecycleError).manifestPath!;}
  try {expect(JSON.parse(readFileSync(path, 'utf8')).pending).toBe('create-invitation-auto-schedule'); const inspect = await runCollaboration('inspect', options, path, () => f.client, load); expect(inspect.pendingOperation).toBe('create-invitation-auto-schedule'); await expect(runCollaboration('cleanup', options, path, () => f.client, load)).rejects.toMatchObject({code: 'COLLABORATION_CLEANUP_NOT_READY'}); expect(f.log.filter(r => r.method === 'PUT')).toHaveLength(1); expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(0);} finally {clean(path);}
});
test('private read-only sharing uses separate empty calendar and waits before explicit revoke', async () => {
  const f = fixture(), opts = {...options, kind: 'read-only-share' as const}; const start = await runCollaboration('start', opts, undefined, () => f.client, load), path = start.manifestPath!;
  try {expect(start.access).toBe('read'); expect(start.status).toBe('invite-noresponse'); expect(f.log.filter(r => r.method === 'PUT')).toHaveLength(0); expect(f.log.filter(r => r.method === 'POST')).toHaveLength(1); expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(0); expect(f.log.find(r => r.method === 'POST')!.body).toContain('<cs:read/>'); const inspect = await runCollaboration('inspect', opts, path, () => f.client, load); expect(inspect.recipientPresent).toBe(true); const end = await runCollaboration('cleanup', opts, path, () => f.client, load); expect(end.senderArtifactsAbsent).toBe(true); expect(f.log.filter(r => r.method === 'POST')).toHaveLength(2); expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(1);} finally {clean(path);}
});
test('unavailable sharing capability sends no invitation; unknown sharee prevents revocation/deletion', async () => {
  const opts = {...options, kind: 'read-only-share' as const}, f = fixture('unsupported-share'); const result = await runCollaboration('start', opts, undefined, () => f.client, load), path = result.manifestPath!;
  try {expect(result.sharingVerified).toBe(false); expect(f.log.filter(r => r.method === 'POST')).toHaveLength(0); await runCollaboration('cleanup', opts, path, () => f.client, load);} finally {clean(path);}
  const g = fixture(), second = await runCollaboration('start', opts, undefined, () => g.client, load), other = second.manifestPath!;
  try {g.foreign(); await expect(runCollaboration('cleanup', opts, other, () => g.client, load)).rejects.toMatchObject({code: 'UNEXPECTED_SHAREE'}); expect(g.log.filter(r => r.method === 'POST')).toHaveLength(1); expect(g.log.filter(r => r.method === 'DELETE')).toHaveLength(0);} finally {clean(other);}
});

test('a changed attendee prevents cleanup cancellation without any DELETE', async () => {
  const f = fixture(), start = await runCollaboration('start', options, undefined, () => f.client, load), path = start.manifestPath!;
  try {f.wrongAttendee(); await expect(runCollaboration('cleanup', options, path, () => f.client, load)).rejects.toMatchObject({code: 'SCHEDULING_IDENTITY_MISMATCH'}); expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(0);} finally {clean(path);}
});

test('exact pending invitation reconciles authenticated organizer alias without any network mutation', async () => {
  const f = fixture('timeout-put'); let path = '';
  try {await runCollaboration('start', options, undefined, () => f.client, load);} catch (error) {path = (error as LifecycleError).manifestPath!;}
  try {const before = f.log.length; const result = await runCollaboration('reconcile', options, path, () => f.client, load); expect(result.networkMutations).toBe(0); expect(result.organizerAliasUsed).toBe(true); expect(f.log.slice(before).every(r => ['GET', 'PROPFIND'].includes(r.method))).toBe(true); const ledger = JSON.parse(readFileSync(path, 'utf8')); expect(ledger.pending).toBeNull(); expect(ledger.state).toBe('awaiting-recipient'); expect(ledger.collaboration.observedOrganizer).toBe('/principal/'); expect(f.log.filter(r => r.method === 'PUT')).toHaveLength(1);} finally {clean(path);}
});
test('unauthenticated organizer alias is rejected; missing Schedule-Tag stays explicitly absent', async () => {
  const f = fixture('foreign-organizer'); let path = '';
  try {await runCollaboration('start', options, undefined, () => f.client, load);} catch (error) {expect((error as LifecycleError).code).toBe('UNVERIFIED_ORGANIZER_ALIAS'); path = (error as LifecycleError).manifestPath!;}
  try {expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(0);} finally {clean(path);}
  const g = fixture('no-schedule-tag'), start = await runCollaboration('start', options, undefined, () => g.client, load), other = start.manifestPath!;
  try {expect(start.scheduleTag).toBeNull(); await runCollaboration('cleanup', options, other, () => g.client, load); expect(g.log.find(r => r.method === 'DELETE')!.headers.has('if-schedule-tag-match')).toBe(false);} finally {clean(other);}
});

test('fresh explicit invite404 permits one share; organizer metadata and final absent roster permit revoke cleanup', async () => {
  const f = fixture('fresh404'), opts = {...options, kind: 'read-only-share' as const};
  const start = await runCollaboration('start', opts, undefined, () => f.client, load), path = start.manifestPath!;
  try {
    expect(start.recipientPresent).toBe(true);
    expect(f.log.filter(r => r.method === 'POST')).toHaveLength(1);
    const end = await runCollaboration('cleanup', opts, path, () => f.client, load);
    expect(end.senderArtifactsAbsent).toBe(true);
    expect(f.log.filter(r => r.method === 'POST')).toHaveLength(2);
    expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(1);
  } finally {clean(path);}
});
test('omitted roster and failed OPTIONS never send share POST', async () => {
  for (const fault of ['omitted-invite', 'bad-options', 'acl404'] as const) {
    const f = fixture(fault), opts = {...options, kind: 'read-only-share' as const};
    const start = await runCollaboration('start', opts, undefined, () => f.client, load), path = start.manifestPath!;
    try {expect(start.sharingVerified).toBe(false); expect(f.log.filter(r => r.method === 'POST')).toHaveLength(0);}
    finally {clean(path);}
  }
});
test('duplicate share organizer stops readback without replay or deletion', async () => {
  const f = fixture('duplicate-organizer'); let path = '';
  try {await runCollaboration('start', {...options, kind: 'read-only-share'}, undefined, () => f.client, load);}
  catch (error) {expect((error as LifecycleError).code).toBe('AMBIGUOUS_SHARE_ORGANIZER'); path = (error as LifecycleError).manifestPath!;}
  try {expect(f.log.filter(r => r.method === 'POST')).toHaveLength(1); expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(0); expect(JSON.parse(readFileSync(path, 'utf8')).pending).toBe('invite-read-only-share');}
  finally {clean(path);}
});

test('forbidden roster and already-shared resource never authorize a first-share POST', async () => {
  for (const fault of ['invite403', 'shared404'] as const) {
    const f = fixture(fault); let path = '';
    try {await runCollaboration('start', {...options, kind: 'read-only-share'}, undefined, () => f.client, load);}
    catch (error) {path = (error as LifecycleError).manifestPath!;}
    try {expect(path).not.toBe(''); expect(f.log.filter(r => r.method === 'POST')).toHaveLength(0); expect(f.log.filter(r => r.method === 'DELETE')).toHaveLength(0);}
    finally {if(path)clean(path);}
  }
});

test('bare organizer email requires exact authenticated mailto alias; share reconciliation never resends', async () => {
  const f = fixture('bare-organizer'), opts = {...options, kind: 'read-only-share' as const};
  const start = await runCollaboration('start', opts, undefined, () => f.client, load), path = start.manifestPath!;
  try {
    const ledger = JSON.parse(readFileSync(path, 'utf8')); ledger.pending = 'invite-read-only-share'; ledger.state = 'stopped-needs-reconciliation';
    require('node:fs').writeFileSync(path, JSON.stringify(ledger));
    const before = f.log.length, result = await runCollaboration('reconcile', opts, path, () => f.client, load);
    expect(result.networkMutations).toBe(0); expect(result.recipientPresent).toBe(true);
    expect(f.log.slice(before).every(r => ['GET', 'PROPFIND'].includes(r.method))).toBe(true);
    expect(f.log.filter(r => r.method === 'POST')).toHaveLength(1);
    expect(JSON.parse(readFileSync(path, 'utf8')).pending).toBeNull();
  } finally {clean(path);}
  const g = fixture('foreign-share-organizer'); let other = '';
  try {await runCollaboration('start', opts, undefined, () => g.client, load);}
  catch(error) {expect((error as LifecycleError).code).toBe('UNVERIFIED_SHARE_ORGANIZER'); other = (error as LifecycleError).manifestPath!;}
  try {expect(g.log.filter(r => r.method === 'POST')).toHaveLength(1); expect(g.log.filter(r => r.method === 'DELETE')).toHaveLength(0);}
  finally {clean(other);}
});
