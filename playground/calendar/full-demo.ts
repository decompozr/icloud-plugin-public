import {createCalDavClient, escapeXml, parseXml} from './caldav-client';
import {createEvent, editSeries, editOccurrence, cancelOccurrence, expand} from './advanced-events';
import {calendarOperations, invitation, reply, cancel, updateInvitation, sharingChange} from './calendar-operations';

/** A composed protocol experiment on an ephemeral loopback server. No account or recipient. */
export async function runFullDemo() {
  let exists = false, name = '', data: string | undefined, revision = 0;
  const collection = '/home/experiment-full-demo/', resource = collection + 'event.ics';
  const etag = () => `"r${revision}"`;
  const row = (href: string, props: string) => `<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  const collectionRow = () => row(collection, `<d:displayname>${escapeXml(name)}</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>`);
  const eventRow = () => row(resource, `<d:getetag>${escapeXml(etag())}</d:getetag><c:calendar-data>${escapeXml(data!)}</c:calendar-data>`);
  const multi = (rows: string, token = '') => new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${rows}${token ? `<d:sync-token>${token}</d:sync-token>` : ''}</d:multistatus>`, {status: 207});
  const requests: string[] = [];
  const server = Bun.serve({hostname: '127.0.0.1', port: 0, async fetch(req) {
    const path = new URL(req.url).pathname, body = await req.text();
    requests.push(`${req.method} ${path}`);
    if (req.method === 'PROPFIND') {
      if (path === '/') return multi(row('/', '<d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal>'));
      if (path === '/principal/') return multi(row(path, '<c:calendar-home-set><d:href>/home/</d:href></c:calendar-home-set>'));
      if (path === '/home/') return multi(row(path, '<d:resourcetype><d:collection/></d:resourcetype>') + (exists ? collectionRow() : ''));
      if (path === collection && exists) return multi(collectionRow() + (req.headers.get('depth') === '1' && data ? eventRow() : ''));
    }
    if (req.method === 'MKCALENDAR' && path === collection && !exists && req.headers.get('if-none-match') === '*') {
      parseXml(body); exists = true; name = 'Full experiment'; return new Response(null, {status: 201});
    }
    if (req.method === 'PROPPATCH' && path === collection && exists) {
      parseXml(body); name = 'Renamed experiment'; return multi(collectionRow());
    }
    if (path === resource && exists) {
      if (req.method === 'GET') return data ? new Response(data, {headers: {etag: etag()}}) : new Response(null, {status: 404});
      if (req.method === 'PUT') {
        if (data ? req.headers.get('if-match') !== etag() : req.headers.get('if-none-match') !== '*') return new Response(null, {status: 412});
        const created = !data; data = body; revision++; return new Response(null, {status: created ? 201 : 204, headers: {etag: etag()}});
      }
      if (req.method === 'DELETE' && data) {
        if (req.headers.get('if-match') !== etag()) return new Response(null, {status: 412});
        data = undefined; revision++; return new Response(null, {status: 204});
      }
    }
    if (req.method === 'REPORT' && path === collection && exists) {
      const root = parseXml(body);
      if (root.name === '{DAV:}sync-collection') return multi(data ? eventRow() : revision ? `<d:response><d:href>${resource}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>` : '', `urn:revision:${revision}`);
      return multi(data ? eventRow() : '');
    }
    if (req.method === 'DELETE' && path === collection && exists && !data) {exists = false; return new Response(null, {status: 204});}
    return new Response(null, {status: 404});
  }});
  const require = (condition: unknown, message: string) => {if (!condition) throw Error(message);};
  try {
    const client = createCalDavClient({baseUrl: server.url.href});
    const operations = calendarOperations(client);
    const discovery = await client.discover();
    require(discovery.calendars.length === 0, 'Initial discovery');
    const href = await operations.create(discovery.home, 'full-demo', 'Full experiment');
    require((await client.discover()).calendars.length === 1, 'Created calendar discovery');
    const url = new URL('event.ics', href).href;
    const original = createEvent('full-demo@example.invalid', {summary: 'Planning', description: 'Synthetic experiment', location: 'Room A', url: 'https://example.invalid/meeting', categories: ['Experiment'], status: 'CONFIRMED', transparency: 'OPAQUE', start: {value: '2026-10-05T14:00:00Z'}, end: {value: '2026-10-05T15:00:00Z'}, alarms: [{minutesBefore: 15, description: 'Reminder'}]}, {frequency: 'DAILY', count: 3});
    const created = await client.create(url, original);
    require((await client.request('GET', url)).body === original, 'Create readback');
    const first = await client.sync(href);
    let updated = editSeries(original, {summary: 'Updated planning', location: 'Room B', description: 'Changed description', categories: ['Updated'], url: null, alarms: [{minutesBefore: 5, description: 'Updated reminder'}]});
    updated = editOccurrence(updated, {value: '2026-10-06T14:00:00Z'}, {start: {value: '2026-10-06T16:00:00Z'}, end: {value: '2026-10-06T17:00:00Z'}});
    updated = cancelOccurrence(updated, {value: '2026-10-07T14:00:00Z'});
    const write = await client.update(url, updated, created.etag!);
    require((await client.request('GET', url)).body === updated, 'Update readback');
    let conflict = false;
    try {await client.update(url, original, created.etag!);} catch (error) {conflict = String(error).includes('412');}
    require(conflict, 'Stale write must fail');
    const second = await client.sync(href, first);
    // XML 1.0 normalizes embedded CRLF; raw GET above remains byte-for-byte verified.
    require(second.resources[url]?.data.replace(/\r\n/g, '\n') === updated.replace(/\r\n/g, '\n') && second.token !== first.token, 'Changed sync');
    const rows = expand(second.resources[url]!.data, {start: '2026-10-05T00:00:00Z', end: '2026-10-08T00:00:00Z'});
    require(rows.length === 2 && rows[1]!.start === '2026-10-06T16:00:00.000Z', 'Moved and cancelled occurrences');
    require((await client.query(href, '20261005T000000Z', '20261008T000000Z')).length === 1, 'Query');
    require((await client.multiget(href, [url])).length === 1, 'Multiget');
    let nonemptyRejected = false;
    try {await operations.remove(href);} catch {nonemptyRejected = true;}
    require(nonemptyRejected, 'Nonempty collection protected');
    await client.remove(url, write.etag!);
    const third = await client.sync(href, second);
    require(Object.keys(third.resources).length === 0, 'Sync tombstone');
    await operations.rename(href, 'Renamed experiment');
    await operations.remove(href);
    require((await client.discover()).calendars.length === 0, 'Collection removal readback');
    const invite = invitation({uid: 'invite@example.invalid', organizer: 'mailto:owner@example.invalid', attendees: ['mailto:guest@example.invalid'], summary: 'Offline invitation', start: '20261005T140000Z', end: '20261005T150000Z', stamp: '20261001T000000Z'});
    const changedInvite = updateInvitation(invite, 'mailto:owner@example.invalid', {summary: 'Revised invitation'}, '20261002T000000Z');
    const accepted = reply(changedInvite, 'mailto:guest@example.invalid', 'ACCEPTED', '20261002T010000Z');
    const cancelled = cancel(changedInvite, 'mailto:owner@example.invalid', '20261003T000000Z');
    require(accepted.includes('METHOD:REPLY') && accepted.includes('PARTSTAT=ACCEPTED') && cancelled.includes('METHOD:CANCEL'), 'Scheduling artifacts');
    for (const access of ['read', 'read-write', 'remove'] as const) parseXml(sharingChange({dav: 'calendarserver-sharing', allowedModesXml: '<cs:allowed-sharing-modes xmlns:cs="http://calendarserver.org/ns/"><cs:can-be-shared/></cs:allowed-sharing-modes>', owner: true, sharee: 'mailto:guest@example.invalid', access}).body);
    require(!requests.some(r => r.startsWith('POST ')), 'No invitation or sharing transmission');
    return {mode: 'loopback-only', calendarLifecycle: 'created-renamed-deleted', eventLifecycle: 'created-updated-deleted', recurrence: {remainingOccurrences: rows.length, movedOccurrence: true, cancelledOccurrence: true}, staleWriteRejected: conflict, nonemptyDeletionRejected: nonemptyRejected, sync: 'initial-change-tombstone', scheduling: 'REQUEST-update-REPLY-CANCEL artifacts only', sharing: 'read-read-write-remove XML artifacts only', externalMessagesSent: 0, requests: requests.length, liveICloudVerified: false};
  } finally {await server.stop(true);}
}
if (import.meta.main) console.log(JSON.stringify(await runFullDemo(), null, 2));
