import {editSummary, parseCalendar, personalResource, query, type QueryOptions, type Resource, type Window} from './scenarios';

export const calendarHref = '/cal/experiment/';
export const eventText = (uid: string, start: string, end: string, summary: string, extra = '') =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Calendar experiment//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261003T120000Z\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${summary}\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;
export const sampleResources = (): Resource[] => {
  const resource = (name: string, ics: string) => ({href: `${calendarHref}${name}.ics`, etag: '"v1"', ics});
  const series = eventText('series@example.invalid', '20261001T090000Z', '20261001T100000Z', 'Planning',
    'RRULE:FREQ=DAILY;COUNT=5\r\nEXDATE:20261003T090000Z\r\nX-KEEP:series\r\n');
  const override = 'BEGIN:VEVENT\r\nUID:series@example.invalid\r\nRECURRENCE-ID:20261005T090000Z\r\nDTSTART:20261002T110000Z\r\nDTEND:20261002T120000Z\r\nSUMMARY:Moved planning\r\nEND:VEVENT\r\n';
  return [
    resource('series', series.replace('END:VCALENDAR', `${override}END:VCALENDAR`)),
    resource('overlap', eventText('overlap@example.invalid', '20261002T083000Z', '20261002T093000Z', 'Review')),
    resource('transparent', eventText('transparent@example.invalid', '20261002T100000Z', '20261002T110000Z', 'Optional hold', 'TRANSP:TRANSPARENT\r\n')),
    resource('cancelled', eventText('cancelled@example.invalid', '20261002T120000Z', '20261002T130000Z', 'Cancelled meeting', 'STATUS:CANCELLED\r\n')),
    resource('all-day', eventText('date@example.invalid', '20261003', '20261004', 'All day').replace('DTSTART:', 'DTSTART;VALUE=DATE:').replace('DTEND:', 'DTEND;VALUE=DATE:')),
  ];
};

/** Loopback application fixture. JSON discovery/query is NOT CalDAV wire format. */
export function startFixture(seed = sampleResources()) {
  const resources = new Map(seed.map(resource => [resource.href, {...resource}]));
  const requests: {method: string; href: string}[] = [];
  let revision = 10;
  const server = Bun.serve({hostname: '127.0.0.1', port: 0, async fetch(request) {
    const href = new URL(request.url).pathname;
    requests.push({method: request.method, href});
    if (href === '/calendars' && request.method === 'GET') return Response.json([
      {href: calendarHref, displayName: 'Synthetic experiment', privileges: ['read', 'write'], synthetic: true},
    ]);
    if (href === calendarHref && request.method === 'REPORT') {
      try {
        const {window, options} = await request.json() as {window: Window; options: QueryOptions};
        return Response.json(query([...resources.values()], window, options));
      } catch (error) { return new Response((error as Error).message, {status: 400}); }
    }
    if (!href.startsWith(calendarHref) || !/^[-a-zA-Z0-9]+\.ics$/.test(href.slice(calendarHref.length))) return new Response(null, {status: 404});
    if (request.method === 'GET') {
      const current = resources.get(href);
      return new Response(current?.ics ?? null, {status: current ? 200 : 404, headers: current ? {etag: current.etag} : {}});
    }
    if (!['PUT', 'DELETE'].includes(request.method)) return new Response(null, {status: 405});
    // Consume body before checking the current revision. No await may separate
    // the precondition check from mutation of the shared in-memory resource.
    const ics = request.method === 'PUT' ? await request.text() : '';
    const current = resources.get(href);
    if (request.headers.get('if-none-match') === '*' && request.method === 'PUT') {
      if (current) return new Response(null, {status: 412});
    } else if (!current || request.headers.get('if-match') !== current.etag) return new Response(null, {status: 412});
    try {
      if (current) personalResource(current.ics);
      if (request.method === 'DELETE') { resources.delete(href); return new Response(null, {status: 204}); }
      const proposal = personalResource(ics);
      if (current) personalResource(ics, personalResource(current.ics).event.uid);
      if (!current && [...resources.values()].some(resource => parseCalendar(resource.ics).getAllSubcomponents('vevent').some(event => event.getFirstPropertyValue('uid') === proposal.event.uid))) throw Error('Duplicate UID');
      const etag = `"v${++revision}"`;
      resources.set(href, {href, ics, etag});
      return new Response(null, {status: current ? 204 : 201, headers: {etag}});
    } catch (error) { return new Response((error as Error).message, {status: 422}); }
  }});
  return {server, requests, resources};
}

const strongEtag = (etag: string) => { if (!/^"[^"\r\n]+"$/.test(etag)) throw Error('Strong ETag required'); };
export function fixtureClient(base: URL) {
  if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:') throw Error('Only loopback fixture supported');
  const call = async (href: string, init: RequestInit = {}) => {
    const url = new URL(href, base);
    if (url.origin !== base.origin || url.search || url.hash || url.username || url.password || /%|\\/.test(href)
      || !(href === '/calendars' || href === calendarHref || new RegExp(`^${calendarHref}[-a-zA-Z0-9]+\\.ics$`).test(href))) throw Error('Untrusted fixture href');
    return fetch(url, {...init, redirect: 'manual', signal: AbortSignal.timeout(2000)});
  };
  const get = async (href: string): Promise<Resource> => {
    const response = await call(href);
    if (response.status !== 200) throw Error(`GET ${response.status}`);
    const etag = response.headers.get('etag') ?? ''; strongEtag(etag);
    return {href, etag, ics: await response.text()};
  };
  const mutation = async (href: string, init: RequestInit) => {
    const response = await call(href, init);
    if (![201, 204].includes(response.status)) throw Error(`Mutation ${response.status}`);
    return response;
  };
  return {call, get,
    async list() { const response = await call('/calendars'); if (!response.ok) throw Error(`List ${response.status}`); return response.json(); },
    async query(window: Window, options: QueryOptions = {}) {
      const response = await call(calendarHref, {method: 'REPORT', body: JSON.stringify({window, options})});
      if (!response.ok) throw Error(`Query ${response.status}`);
      return response.json() as Promise<ReturnType<typeof query>>;
    },
    async create(href: string, ics: string) {
      personalResource(ics);
      return mutation(href, {method: 'PUT', headers: {'if-none-match': '*'}, body: ics});
    },
    async updateSummary(snapshot: Resource, summary: string) {
      strongEtag(snapshot.etag);
      return mutation(snapshot.href, {method: 'PUT', headers: {'if-match': snapshot.etag}, body: editSummary(snapshot, summary)});
    },
    async delete(snapshot: Resource) {
      strongEtag(snapshot.etag); personalResource(snapshot.ics);
      return mutation(snapshot.href, {method: 'DELETE', headers: {'if-match': snapshot.etag}});
    },
  };
}
