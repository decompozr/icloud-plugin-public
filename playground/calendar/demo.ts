import {availability, personalResource} from './scenarios';
import {calendarHref, eventText, fixtureClient, startFixture} from './fixture';

const fixture = startFixture(), client = fixtureClient(fixture.server.url);
const window = {start: '2026-10-02T09:00:00Z', end: '2026-10-02T13:00:00Z'};
try {
  console.log('OFFLINE SYNTHETIC DATA ONLY; JSON fixture is not an iCloud/CalDAV server.');
  console.log('1. Calendars:', JSON.stringify(await client.list()));
  const series = await client.get(`${calendarHref}series.ics`);
  console.log('   Read recurring resource:', series.href, series.etag);
  const result = await client.query(window, {allDay: 'utc'});
  console.log('2. Finite window occurrences:', JSON.stringify(result));
  console.log('   Search PLANNING:', JSON.stringify(await client.query(window, {allDay: 'utc', text: 'PLANNING'})));
  console.log('   Availability (DATE policy: UTC):', JSON.stringify(availability(result, window)));
  const href = `${calendarHref}personal-${crypto.randomUUID()}.ics`;
  const uid = `experiment-${crypto.randomUUID()}@example.invalid`;
  await client.create(href, eventText(uid, '20261002T140000Z', '20261002T150000Z', 'Experiment', 'X-KEEP:preserved\r\n'));
  const before = await client.get(href);
  await client.updateSummary(before, 'Experiment updated');
  const after = await client.get(href);
  let conflict = '';
  try { await client.updateSummary(before, 'Stale update'); } catch (error) { conflict = (error as Error).message; }
  if (conflict !== 'Mutation 412' || (await client.get(href)).ics !== after.ics) throw Error('Conflict preservation failed');
  const preserved = personalResource(after.ics);
  if (preserved.event.uid !== uid || preserved.event.component.getFirstPropertyValue('x-keep') !== 'preserved') throw Error('Identity preservation failed');
  await client.delete(after);
  const final = await client.call(href);
  if (final.status !== 404) throw Error('Delete verification failed');
  console.log('3. Personal CRUD: create 201 -> read -> update 204 -> read -> stale update 412 (preserved) -> delete 204 -> GET 404; UID/X-KEEP preserved.');
  console.log('Complete. Fixture server closes; no account credentials or real events used.');
} finally { await fixture.server.stop(true); }
