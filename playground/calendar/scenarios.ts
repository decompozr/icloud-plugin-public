import ICAL from 'ical.js';

export type Resource = {href: string; etag: string; ics: string};
export type Window = {start: string; end: string};
export type Occurrence = {
  href: string; uid: string; recurrenceId: string | null; summary: string;
  start: string; end: string; allDay: boolean; busy: boolean;
};
export type QueryResult = {complete: boolean; issues: string[]; occurrences: Occurrence[]; coverage: Window; filtered: boolean};
export type QueryOptions = {
  text?: string; allDay?: 'utc'; maxResources?: number; maxInstances?: number; maxResults?: number;
};
const DAY = 86400000;
export const parseCalendar = (text: string) => new ICAL.Component(ICAL.parse(text));

export function bounds(window: Window): [number, number] {
  // UTC is intentional in this experiment: there is no hidden host timezone.
  if (![window.start, window.end].every(value => /Z$/.test(value))) throw Error('Window requires UTC instants');
  const start = Date.parse(window.start), end = Date.parse(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * DAY)
    throw Error('Window must be finite, positive and at most 366 days');
  return [start, end];
}
function instant(time: ICAL.Time, allDay?: 'utc'): number {
  if (time.isDate) {
    if (allDay !== 'utc') throw Error('DATE requires explicit allDay: utc policy');
    return Date.UTC(time.year, time.month - 1, time.day);
  }
  if (time.zone.tzid !== 'UTC') throw Error('Floating/TZID times unsupported by this query experiment');
  return time.toUnixTime() * 1000;
}
function validateEvent(event: ICAL.Event, options: QueryOptions) {
  const component = event.component;
  if (!event.uid || !component.hasProperty('dtstart')) throw Error('UID and DTSTART required');
  if (component.getFirstProperty('recurrence-id')?.getParameter('range')) throw Error('RANGE overrides unsupported');
  if (component.hasProperty('exrule')) throw Error('EXRULE unsupported');
  // Do not allow a missing timezone registration to fall back to floating/UTC.
  for (const name of ['dtstart', 'dtend', 'recurrence-id', 'rdate', 'exdate']) {
    for (const property of component.getAllProperties(name)) {
      if (property.getParameter('tzid')) throw Error('TZID unsupported by this query experiment');
      for (const value of property.getValues()) {
        if (!(value instanceof ICAL.Time)) throw Error('Period-valued dates unsupported');
        instant(value, options.allDay);
      }
    }
  }
  if (event.startDate.isDate !== event.endDate.isDate || instant(event.endDate, options.allDay) <= instant(event.startDate, options.allDay))
    throw Error('Event must have a positive duration and matching date types');
  // Keep iterator work predictable for this small fixture, including unbounded rules.
  const rules = component.getAllProperties('rrule');
  if (rules.length > 1) throw Error('Multiple RRULEs unsupported');
  for (const property of rules) {
    const rule = property.getFirstValue() as ICAL.Recur;
    if (!['DAILY', 'WEEKLY'].includes(rule.freq) || Object.keys(rule.parts).length)
      throw Error('Only simple DAILY/WEEKLY recurrence supported');
    if (rule.interval < 1 || (rule.count !== null && rule.count < 1)) throw Error('Invalid recurrence bounds');
  }
}

/** Application query over complete supplied resource snapshots, not a CalDAV REPORT implementation. */
export function query(resources: Resource[], window: Window, options: QueryOptions = {}): QueryResult {
  const [from, to] = bounds(window);
  const maxResources = options.maxResources ?? 100, maxInstances = options.maxInstances ?? 1000, maxResults = options.maxResults ?? 200;
  if (![maxResources, maxInstances, maxResults].every(n => Number.isSafeInteger(n) && n > 0 && n <= 10000)) throw Error('Invalid query budget');
  const issues: string[] = [], occurrences: Occurrence[] = [];
  let examined = 0;
  if (resources.length > maxResources) issues.push('Resource budget exceeded');
  for (const resource of resources.slice(0, maxResources)) {
    try {
      if (resource.ics.length > 65536) throw Error('Resource size limit exceeded');
      const calendar = parseCalendar(resource.ics);
      if (calendar.name !== 'vcalendar') throw Error('VCALENDAR required');
      const components = calendar.getAllSubcomponents('vevent');
      if (!components.length || components.length > 100) throw Error('Event component limit');
      const events = components.map(component => new ICAL.Event(component));
      for (const event of events) validateEvent(event, options);
      const masters = events.filter(event => !event.isRecurrenceException());
      if (masters.length !== 1 || events.some(event => event.uid !== masters[0]!.uid)) throw Error('One UID/master required per resource');
      const master = masters[0]!;
      const exceptions = events.filter(event => event.isRecurrenceException());
      if (exceptions.length && !master.isRecurring()) throw Error('Detached override without recurring master');
      const ids = new Set<string>();
      const append = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurrenceId: ICAL.Time | null) => {
        const a = instant(start, options.allDay), b = instant(end, options.allDay);
        if (!(a < to && b > from)) return;
        const summary = event.summary || '';
        if (options.text && !summary.toLocaleLowerCase('en').includes(options.text.toLocaleLowerCase('en'))) return;
        if (occurrences.length >= maxResults) throw Error('Result budget exceeded');
        occurrences.push({href: resource.href, uid: event.uid, recurrenceId: recurrenceId?.toString() ?? null,
          summary, start: new Date(a).toISOString(), end: new Date(b).toISOString(), allDay: start.isDate,
          busy: event.component.getFirstPropertyValue('transp') !== 'TRANSPARENT' && event.component.getFirstPropertyValue('status') !== 'CANCELLED'});
      };
      // Evaluate overrides independently so an original instance outside the window
      // moved into it is not lost when expansion stops at the window end.
      for (const exception of exceptions) {
        const id = exception.recurrenceId.toString();
        if (ids.has(id)) throw Error('Duplicate recurrence override');
        ids.add(id);
        append(exception, exception.startDate, exception.endDate, exception.recurrenceId);
      }
      if (!master.isRecurring()) { append(master, master.startDate, master.endDate, null); continue; }
      const iterator = master.iterator();
      while (true) {
        if (++examined > maxInstances) throw Error('Expansion budget exceeded');
        const next = iterator.next();
        if (!next || instant(next, options.allDay) >= to) break;
        if (ids.has(next.toString())) continue;
        const details = master.getOccurrenceDetails(next);
        append(master, details.startDate, details.endDate, next);
      }
    } catch (error) { issues.push(`${resource.href}: ${(error as Error).message}`); }
  }
  occurrences.sort((a, b) => a.start.localeCompare(b.start) || a.href.localeCompare(b.href));
  return {complete: issues.length === 0, issues, occurrences, coverage: {...window}, filtered: !!options.text};
}

export function availability(result: QueryResult, window: Window) {
  if (!result.complete) throw Error('Cannot compute availability from incomplete query');
  const [from, to] = bounds(window);
  if (result.filtered) throw Error('Cannot compute availability from text-filtered query');
  const [coveredFrom, coveredTo] = bounds(result.coverage);
  if (from < coveredFrom || to > coveredTo) throw Error('Availability window exceeds query coverage');
  const scoped = result.occurrences.filter(event => Date.parse(event.start) < to && Date.parse(event.end) > from);
  const intervals = scoped.filter(event => event.busy)
    .map(event => [Math.max(from, Date.parse(event.start)), Math.min(to, Date.parse(event.end))] as [number, number])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const free: [number, number][] = []; let cursor = from;
  for (const [a, b] of merged) { if (cursor < a) free.push([cursor, a]); cursor = b; }
  if (cursor < to) free.push([cursor, to]);
  const format = (rows: [number, number][]) => rows.map(([start, end]) => ({start: new Date(start).toISOString(), end: new Date(end).toISOString()}));
  return {busy: format(merged), free: format(free), summary: {
    occurrences: scoped.length, busyOccurrences: scoped.filter(event => event.busy).length,
    busyMinutes: merged.reduce((total, [a, b]) => total + (b - a) / 60000, 0),
    freeMinutes: free.reduce((total, [a, b]) => total + (b - a) / 60000, 0),
  }};
}

/** Reject whole resources outside the deliberately small personal-write subset. */
export function personalResource(text: string, expectedUid?: string) {
  if (text.length > 65536) throw Error('Resource size limit exceeded');
  const calendar = parseCalendar(text), events = calendar.getAllSubcomponents('vevent');
  if (calendar.name !== 'vcalendar' || calendar.hasProperty('method')) throw Error('Scheduling unsupported');
  if (calendar.getAllSubcomponents().some(component => component.name !== 'vevent')) throw Error('Only VEVENT resources may be written');
  if (events.length !== 1) throw Error('Only one nonrecurring personal event may be written');
  const component = events[0]!;
  for (const name of ['attendee', 'organizer', 'rrule', 'rdate', 'exdate', 'exrule', 'recurrence-id'])
    if (component.hasProperty(name)) throw Error('Scheduling/recurrence writes unsupported');
  const event = new ICAL.Event(component);
  validateEvent(event, {allDay: 'utc'});
  if (expectedUid !== undefined && event.uid !== expectedUid) throw Error('UID mismatch');
  return {calendar, event};
}

export function editSummary(snapshot: Resource, summary: string): string {
  const {calendar, event} = personalResource(snapshot.ics);
  event.summary = summary;
  // Editing the parsed component retains UID, alarms and unknown properties.
  return calendar.toString();
}
