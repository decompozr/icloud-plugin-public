import {expect, test} from 'bun:test';
import {availability, bounds, personalResource, query, type Resource} from './scenarios';
import {calendarHref, eventText, fixtureClient, sampleResources, startFixture} from './fixture';

const window = {start: '2026-10-02T09:00:00Z', end: '2026-10-02T13:00:00Z'};
const resource = (ics: string): Resource => ({href: `${calendarHref}test.ics`, etag: '"v1"', ics});
const single = (start: string, end: string, extra = '') => resource(eventText('test@example.invalid', start, end, 'Test', extra));

test('finite-window overlap, text search, recurrence exclusion and moved-in original identity', () => {
  const result = query(sampleResources(), window, {allDay: 'utc'});
  expect(result.complete).toBe(true);
  expect(result.occurrences).toHaveLength(5);
  expect(result.occurrences.find(event => event.summary === 'Moved planning')?.recurrenceId).toBe('2026-10-05T09:00:00Z');
  expect(query(sampleResources(), window, {allDay: 'utc', text: 'PLANNING'}).occurrences.map(event => event.summary)).toEqual(['Planning', 'Moved planning']);
  const excluded = query([sampleResources()[0]!], {start: '2026-10-03T00:00:00Z', end: '2026-10-04T00:00:00Z'});
  expect(excluded.complete).toBe(true); expect(excluded.occurrences).toHaveLength(0);
  const movedOut = query([sampleResources()[0]!], {start: '2026-10-05T00:00:00Z', end: '2026-10-06T00:00:00Z'});
  expect(movedOut.occurrences).toHaveLength(0);
  expect(query([single('20261002T080000Z', '20261002T090000Z'), single('20261002T130000Z', '20261002T140000Z')], window).occurrences).toHaveLength(0);
  expect(() => bounds({start: window.end, end: window.start})).toThrow();
  expect(() => bounds({start: '2026-10-02', end: window.end})).toThrow();
  expect(() => bounds({start: window.start, end: '2030-01-01T00:00:00Z'})).toThrow();
});

test('availability clips and merges busy time, excludes transparent/cancelled, and reports exact free slots', () => {
  const result = availability(query(sampleResources(), window, {allDay: 'utc'}), window);
  expect(result.busy).toEqual([
    {start: '2026-10-02T09:00:00.000Z', end: '2026-10-02T10:00:00.000Z'},
    {start: '2026-10-02T11:00:00.000Z', end: '2026-10-02T12:00:00.000Z'},
  ]);
  expect(result.free).toEqual([
    {start: '2026-10-02T10:00:00.000Z', end: '2026-10-02T11:00:00.000Z'},
    {start: '2026-10-02T12:00:00.000Z', end: '2026-10-02T13:00:00.000Z'},
  ]);
  expect(result.summary).toEqual({occurrences: 5, busyOccurrences: 3, busyMinutes: 120, freeMinutes: 120});
  expect(availability(query([], window), window).summary.freeMinutes).toBe(240);
});

test('availability refuses text-filtered snapshots and windows beyond the query coverage', () => {
  expect(() => availability(query(sampleResources(), window, {allDay: 'utc', text: 'Review'}), window)).toThrow('text-filtered');
  const result = query(sampleResources(), window, {allDay: 'utc'});
  expect(() => availability(result, {start: '2026-10-02T08:00:00Z', end: window.end})).toThrow('coverage');
  expect(() => availability(result, {start: window.start, end: '2026-10-02T14:00:00Z'})).toThrow('coverage');
  expect(availability(result, {start: '2026-10-02T10:00:00Z', end: '2026-10-02T11:00:00Z'}).summary).toEqual({occurrences: 1, busyOccurrences: 0, busyMinutes: 0, freeMinutes: 60});
});

test('DATE requires explicit UTC policy, preserves exclusive end, and unsupported times refuse availability', () => {
  const allDay = sampleResources().at(-1)!;
  const dateWindow = {start: '2026-10-03T00:00:00Z', end: '2026-10-04T00:00:00Z'};
  expect(query([allDay], dateWindow).complete).toBe(false);
  const result = query([allDay], dateWindow, {allDay: 'utc'});
  expect(result.occurrences[0]?.allDay).toBe(true);
  expect(result.occurrences[0]?.end).toBe('2026-10-04T00:00:00.000Z');
  expect(availability(result, dateWindow).summary.busyMinutes).toBe(1440);
  expect(query([allDay], {start: dateWindow.end, end: '2026-10-05T00:00:00Z'}, {allDay: 'utc'}).occurrences).toHaveLength(0);
  for (const ics of [
    eventText('floating', '20261002T090000', '20261002T100000', 'Floating'),
    eventText('tzid', '20261002T090000', '20261002T100000', 'TZID').replace('DTSTART:', 'DTSTART;TZID=America/Toronto:'),
  ]) {
    const unsupported = query([resource(ics)], window);
    expect(unsupported.complete).toBe(false);
    expect(() => availability(unsupported, window)).toThrow('incomplete');
  }
});

test('expansion, resource and result limits are explicit; no incomplete free-time claims', () => {
  const infinite = single('20200101T090000Z', '20200101T100000Z', 'RRULE:FREQ=DAILY\r\n');
  for (const result of [
    query([infinite], window, {maxInstances: 5}),
    query(sampleResources(), window, {maxResources: 1}),
    query(sampleResources(), window, {allDay: 'utc', maxResults: 1}),
    query([resource('invalid')], window),
  ]) {
    expect(result.complete).toBe(false); expect(result.issues.length).toBeGreaterThan(0);
    expect(() => availability(result, window)).toThrow('incomplete');
  }
  expect(query([infinite], window, {maxInstances: 5}).issues[0]).toContain('Expansion budget');
});

test('real loopback sequence: discover/read/query/create/update/conflict/delete without retries', async () => {
  const fixture = startFixture(), client = fixtureClient(fixture.server.url);
  try {
    expect((await client.list())[0].href).toBe(calendarHref);
    expect((await client.get(`${calendarHref}series.ics`)).ics).toContain('RRULE');
    const result = await client.query(window, {allDay: 'utc', text: 'planning'});
    expect(result.complete).toBe(true); expect(result.occurrences).toHaveLength(2);
    const href = `${calendarHref}personal-${crypto.randomUUID()}.ics`;
    const original = eventText(`personal-${crypto.randomUUID()}@example.invalid`, '20261002T140000Z', '20261002T150000Z', 'Initial',
      'X-KEEP:preserve\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT5M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\n');
    expect((await client.create(href, original)).status).toBe(201);
    const before = await client.get(href);
    await expect(client.create(href, original)).rejects.toThrow('412');
    expect((await client.updateSummary(before, 'Updated')).status).toBe(204);
    const after = await client.get(href), parsed = personalResource(after.ics);
    expect(parsed.event.uid).toBe(personalResource(before.ics).event.uid);
    expect(parsed.event.summary).toBe('Updated');
    expect(parsed.event.component.getFirstPropertyValue('x-keep')).toBe('preserve');
    expect(parsed.event.component.getFirstSubcomponent('valarm')?.getFirstPropertyValue('trigger')?.toString()).toBe('-PT5M');
    const calls = fixture.requests.length;
    await expect(client.updateSummary(before, 'Stale')).rejects.toThrow('412');
    expect(fixture.requests.length - calls).toBe(1);
    await expect(client.delete(before)).rejects.toThrow('412');
    expect((await client.get(href)).ics).toBe(after.ics);
    expect((await client.delete(after)).status).toBe(204);
    await expect(client.get(href)).rejects.toThrow('404');
    expect(fixture.resources.size).toBe(sampleResources().length);
  } finally { await fixture.server.stop(true); }
});

test('personal write guards reject scheduling, recurring resources, UID changes and weak ETags', async () => {
  const normal = eventText('personal', '20261002T140000Z', '20261002T150000Z', 'Personal');
  for (const extra of ['ATTENDEE:mailto:guest@example.invalid', 'ORGANIZER:mailto:owner@example.invalid', 'RRULE:FREQ=DAILY;COUNT=2', 'RECURRENCE-ID:20261002T140000Z'])
    expect(() => personalResource(normal.replace('END:VEVENT', `${extra}\r\nEND:VEVENT`))).toThrow();
  expect(() => personalResource(normal.replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:REQUEST'))).toThrow();
  expect(() => personalResource(normal, 'another-uid')).toThrow('UID');
  expect(() => personalResource(normal.replace('END:VCALENDAR', 'BEGIN:VTODO\r\nORGANIZER:mailto:guest@example.invalid\r\nEND:VTODO\r\nEND:VCALENDAR'))).toThrow('Only VEVENT');
  const fixture = startFixture(), client = fixtureClient(fixture.server.url);
  try {
    const series = await client.get(`${calendarHref}series.ics`), calls = fixture.requests.length;
    await expect(client.updateSummary(series, 'Invalid')).rejects.toThrow();
    await expect(client.delete(series)).rejects.toThrow();
    await expect(client.delete({...resource(normal), etag: 'W/"v1"'})).rejects.toThrow('Strong ETag');
    expect(fixture.requests).toHaveLength(calls);
    await expect(client.get('https://example.invalid/event.ics')).rejects.toThrow('Untrusted');
    const href = `${calendarHref}guard.ics`;
    await client.create(href, normal);
    const snapshot = await client.get(href);
    expect((await client.call(href, {method: 'PUT', headers: {'if-match': snapshot.etag}, body: normal.replace('UID:personal', 'UID:changed')})).status).toBe(422);
    expect((await client.get(href)).ics).toBe(normal);
    // Stored scheduling objects are checked at the server even if the client is bypassed.
    fixture.resources.set(href, {...snapshot, ics: normal.replace('END:VEVENT', 'ATTENDEE:mailto:guest@example.invalid\r\nEND:VEVENT')});
    expect((await client.call(href, {method: 'DELETE', headers: {'if-match': snapshot.etag}})).status).toBe(422);
    expect(fixture.resources.has(href)).toBe(true);
  } finally { await fixture.server.stop(true); }
});

test('semantic UID comparison rejects duplicates even when existing ICS uses LF line endings', async () => {
  const normal = eventText('same-uid', '20261002T140000Z', '20261002T150000Z', 'Personal');
  const fixture = startFixture([resource(normal.replaceAll('\r\n', '\n'))]);
  try {
    await expect(fixtureClient(fixture.server.url).create(`${calendarHref}duplicate.ics`, normal)).rejects.toThrow('422');
    expect(fixture.resources.size).toBe(1);
  } finally { await fixture.server.stop(true); }
});

test('delayed HTTP request body cannot bypass concurrent create/update ETag preconditions', async () => {
  const fixture = startFixture([]), client = fixtureClient(fixture.server.url);
  try {
    for (const mode of ['create', 'update']) {
      const href = `${calendarHref}${mode}.ics`;
      const original = eventText(`${mode}-uid`, '20261002T140000Z', '20261002T150000Z', 'Original');
      if (mode === 'update') await client.create(href, original);
      const snapshot = mode === 'update' ? await client.get(href) : null;
      const slowBody = original.replace('SUMMARY:Original', 'SUMMARY:Slow');
      let streamController: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode(slowBody.slice(0, 20)));
      }});
      const count = fixture.requests.length;
      const pending = client.call(href, {method: 'PUT', headers: snapshot ? {'if-match': snapshot.etag} : {'if-none-match': '*'}, body: stream});
      // Wait until the fixture received the first request before racing a second.
      for (let attempt = 0; fixture.requests.length === count && attempt < 100; attempt++) await Bun.sleep(1);
      expect(fixture.requests.length).toBe(count + 1);
      if (snapshot) await client.updateSummary(snapshot, 'Fast');
      else await client.create(href, original.replace('SUMMARY:Original', 'SUMMARY:Fast'));
      streamController!.enqueue(new TextEncoder().encode(slowBody.slice(20))); streamController!.close();
      expect((await pending).status).toBe(412);
      expect(personalResource((await client.get(href)).ics).event.summary).toBe('Fast');
    }
  } finally { await fixture.server.stop(true); }
});
