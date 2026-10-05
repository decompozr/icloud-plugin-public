import {test, expect} from 'bun:test';
import ICAL from 'ical.js';
import {createEvent, editSeries, editOccurrence, cancelOccurrence, cancelSeries, expand} from './codec.js';
const fields = {summary: 'Original', start: {value: '2026-10-01T09:00:00Z'}, end: {value: '2026-10-01T10:00:00Z'}};
const window = {start: '2026-10-01T00:00:00Z', end: '2026-10-10T00:00:00Z'};
const parse = (text: string) => new ICAL.Component(ICAL.parse(text));
const zone = `BEGIN:VTIMEZONE
TZID:Fixture/Eastern
BEGIN:DAYLIGHT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
BEGIN:STANDARD
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
END:VTIMEZONE`;
const local = (value: string) => ({value, tzid: 'Fixture/Eastern'});
test('complete metadata, time, categories and display alarm editing preserves identity and extensions', () => {
  const original = createEvent('fields@example.invalid', fields).replace('END:VEVENT', 'X-KEEP:untouched\r\nEND:VEVENT');
  const changed = editSeries(original, {summary: 'New, title', description: 'Multi\nline', location: 'Room', url: 'https://example.invalid/a', categories: ['work', 'planning'], status: 'TENTATIVE', transparency: 'TRANSPARENT', start: {value: '2026-10-02T11:00:00Z'}, end: {value: '2026-10-02T12:30:00Z'}, alarms: [{minutesBefore: 15, description: 'Reminder'}]});
  const c = parse(changed).getFirstSubcomponent('vevent')!;
  for (const [name, expected] of Object.entries({uid: 'fields@example.invalid', summary: 'New, title', description: 'Multi\nline', location: 'Room', url: 'https://example.invalid/a', status: 'TENTATIVE', transp: 'TRANSPARENT', 'x-keep': 'untouched'})) expect(c.getFirstPropertyValue(name)).toBe(expected);
  expect(c.getFirstProperty('categories')!.getValues()).toEqual(['work', 'planning']);
  expect(c.getFirstSubcomponent('valarm')!.getFirstPropertyValue('trigger')!.toString()).toBe('-PT15M');
  expect(expand(changed, window)[0]).toMatchObject({start: '2026-10-02T11:00:00.000Z', end: '2026-10-02T12:30:00.000Z', busy: false});
  const removed = parse(editSeries(changed, {description: null, location: null, url: null, categories: [], alarms: []})).getFirstSubcomponent('vevent')!;
  expect(removed.hasProperty('description')).toBe(false); expect(removed.hasProperty('categories')).toBe(false); expect(removed.getAllSubcomponents('valarm')).toHaveLength(0);
});
test('daily weekly monthly recurrence uses actual iterator and month-end skipping', () => {
  for (const frequency of ['DAILY', 'WEEKLY', 'MONTHLY'] as const) {
    const text = createEvent('recurrence', fields, {frequency, count: 3});
    expect(expand(text, {...window, end: '2027-01-01T00:00:00Z'})).toHaveLength(3);
  }
  const text = createEvent('monthend', {...fields, start: {value: '2026-01-31T09:00:00Z'}, end: {value: '2026-01-31T10:00:00Z'}}, {frequency: 'MONTHLY', count: 3});
  expect(expand(text, {start: '2026-01-01T00:00:00Z', end: '2026-06-01T00:00:00Z'}).map(r => r.start)).toEqual(['2026-01-31T09:00:00.000Z', '2026-03-31T09:00:00.000Z', '2026-05-31T09:00:00.000Z']);
});
test('moved-in and moved-out exceptions retain original ID, repeat edits and cancellations preserve others', () => {
  let text = createEvent('moves', fields, {frequency: 'DAILY', count: 5});
  text = editOccurrence(text, {value: '2026-10-05T09:00:00Z'}, {start: {value: '2026-10-02T11:00:00Z'}, end: {value: '2026-10-02T12:00:00Z'}});
  text = editOccurrence(text, {value: '2026-10-02T09:00:00Z'}, {start: {value: '2026-10-09T09:00:00Z'}, end: {value: '2026-10-09T10:00:00Z'}});
  text = editOccurrence(text, {value: '2026-10-05T09:00:00Z'}, {summary: 'Moved'});
  const narrow = {start: '2026-10-02T00:00:00Z', end: '2026-10-03T00:00:00Z'};
  expect(expand(text, narrow)).toHaveLength(1); expect(expand(text, narrow)[0]).toMatchObject({id: '2026-10-05T09:00:00Z', summary: 'Moved'});
  text = cancelOccurrence(text, {value: '2026-10-03T09:00:00Z'});
  expect(expand(text, window)).toHaveLength(4);
  const updated = editSeries(text, {summary: 'Master updated'});
  expect(expand(updated, narrow)[0]!.summary).toBe('Moved');
  expect(expand(editSeries(text, {start: fields.start}), narrow)[0]!.summary).toBe('Moved');
  expect(expand(cancelSeries(text), window)).toEqual([]);
  expect(() => editOccurrence(text, {value: '2026-11-01T09:00:00Z'}, {})).toThrow('not found');
});
test('existing EXDATE survives edits and excludes original occurrence', () => {
  const text = createEvent('exclude', fields, {frequency: 'DAILY', count: 3}).replace('END:VEVENT', 'EXDATE:20261002T090000Z\r\nEND:VEVENT');
  expect(expand(editSeries(text, {location: 'Room'}), window).map(r => r.id)).toEqual(['2026-10-01T09:00:00Z', '2026-10-03T09:00:00Z']);
  expect(() => editOccurrence(text, {value: '2026-10-02T09:00:00Z'}, {})).toThrow('not found');
});
test('synthetic local VTIMEZONE preserves daily wall-clock across both DST transitions', () => {
  for (const [day, expected] of [['2026-03-07', ['14', '13', '13']], ['2026-10-31', ['13', '14', '14']]] as const) {
    const text = createEvent('dst', {...fields, start: local(`${day}T09:00:00`), end: local(`${day}T10:00:00`)}, {frequency: 'DAILY', count: 3}, zone);
    const edited = editSeries(text, {description: 'Preserve timezone'});
    expect(parse(edited).getFirstSubcomponent('vtimezone')!.toString()).toBe(parse(text).getFirstSubcomponent('vtimezone')!.toString());
    const rows = expand(edited, {start: `${day}T00:00:00Z`, end: day.includes('03') ? '2026-03-11T00:00:00Z' : '2026-11-04T00:00:00Z'});
    expect(rows.map(r => r.start.slice(11, 13))).toEqual([...expected]);
  }
  for (const day of ['2026-03-08T02:30:00', '2026-11-01T01:30:00']) expect(() => createEvent('invalid', {...fields, start: local(day), end: local(day.replace('30', '45'))}, undefined, zone)).toThrow('Ambiguous or nonexistent');
  expect(() => createEvent('unknown', {...fields, start: local('2026-10-01T09:00:00')})).toThrow('Unresolved');
});
test('DATE and floating policy is explicit and RANGE fails closed', () => {
  const date = {...fields, start: {value: '2026-10-01'}, end: {value: '2026-10-02'}};
  expect(() => createEvent('date', date)).toThrow('DATE');
  expect(expand(createEvent('date', date, undefined, undefined, {date: 'utc'}), window, {date: 'utc'})[0]!.end).toBe('2026-10-02T00:00:00.000Z');
  const floating = {...fields, start: {value: '2026-10-01T09:00:00'}, end: {value: '2026-10-01T10:00:00'}};
  expect(() => createEvent('floating', floating)).toThrow('Floating');
  expect(expand(createEvent('floating', floating, undefined, undefined, {floating: 'utc'}), window, {floating: 'utc'})).toHaveLength(1);
  const floatingSeries = createEvent('floating-series', floating, {frequency: 'DAILY', count: 3}, undefined, {floating: 'utc'});
  const exception = parse(editOccurrence(floatingSeries, floating.start, {summary: 'Changed'}, {floating: 'utc'})).getAllSubcomponents('vevent')[1]!;
  expect(exception.getFirstPropertyValue('dtstart')!.toString()).toBe('2026-10-01T09:00:00');
  expect(exception.getFirstPropertyValue('dtend')!.toString()).toBe('2026-10-01T10:00:00');
  const range = editOccurrence(createEvent('range', fields, {frequency: 'DAILY', count: 3}), fields.start, {summary: 'Override'}).replace('RECURRENCE-ID:', 'RECURRENCE-ID;RANGE=THISANDFUTURE:');
  expect(() => expand(range, window)).toThrow('RANGE');
});
test('BYDAY and master time edits keep explicitly detached schedules', () => {
  const text = createEvent('weekdays', fields, {frequency: 'WEEKLY', count: 4, byDay: ['TH', 'FR']});
  expect(expand(text, {...window, end: '2026-10-20T00:00:00Z'}).map(r => r.start.slice(0, 10))).toEqual(['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09']);
  const detached = editOccurrence(text, {value: '2026-10-02T09:00:00Z'}, {summary: 'Explicit'});
  const before = parse(detached).getAllSubcomponents('vevent')[1]!.toString();
  const shifted = editSeries(detached, {start: {value: '2026-10-01T11:00:00Z'}, end: {value: '2026-10-01T12:00:00Z'}});
  expect(parse(shifted).getAllSubcomponents('vevent')[1]!.toString()).toBe(before);
  expect(expand(shifted, window)[0]!.start).toBe('2026-10-01T11:00:00.000Z');
  const monthly = createEvent('monthly', {...fields, start: {value: '2026-10-05T09:00:00Z'}, end: {value: '2026-10-05T10:00:00Z'}}, {frequency: 'MONTHLY', count: 3, byDay: ['1MO']});
  expect(expand(monthly, {...window, end: '2027-01-01T00:00:00Z'}).map(r => r.start.slice(0, 10))).toEqual(['2026-10-05', '2026-11-02', '2026-12-07']);
});
test('DST near-midnight offsets and exact DTEND duration are preserved', () => {
  const text = createEvent('overnight', {...fields, start: local('2026-03-07T23:00:00'), end: local('2026-03-08T04:00:00')}, {frequency: 'DAILY', count: 3}, zone);
  const rows = expand(text, {start: '2026-03-07T00:00:00Z', end: '2026-03-11T00:00:00Z'});
  expect(rows[0]).toMatchObject({start: '2026-03-08T04:00:00.000Z', end: '2026-03-08T08:00:00.000Z'});
  expect(rows.map(r => Date.parse(r.end) - Date.parse(r.start))).toEqual([14400000, 14400000, 14400000]);
  const edited = editOccurrence(text, local('2026-03-07T23:00:00'), {summary: 'Updated'});
  expect(expand(edited, {start: '2026-03-07T00:00:00Z', end: '2026-03-11T00:00:00Z'})[0]).toMatchObject({start: rows[0]!.start, end: rows[0]!.end});
  expect(() => expand(text.replace(/DTEND[^\r]+/, 'DURATION:PT4H'), {start: '2026-03-07T00:00:00Z', end: '2026-03-11T00:00:00Z'})).toThrow('TZID DURATION');
  for (const value of ['2026-02-30T09:00:00Z', '2026-10-01T25:00:00Z']) expect(() => createEvent('bad', {...fields, start: {value}})).toThrow('Invalid');
});
