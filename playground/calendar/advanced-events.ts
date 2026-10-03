import ICAL from 'ical.js';

/** Offline personal-event experiment. No network, scheduling, or persistence. */
export type DateValue = {value: string; tzid?: string}; // ICAL extended format
export type Policy = {date?: 'utc'; floating?: 'utc'};
export type Fields = {summary?: string; description?: string | null; location?: string | null;
  url?: string | null; categories?: string[]; status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
  transparency?: 'OPAQUE' | 'TRANSPARENT'; start?: DateValue; end?: DateValue;
  alarms?: {minutesBefore: number; description: string}[]};
const parse = (text: string) => new ICAL.Component(ICAL.parse(text));
const key = (t: ICAL.Time) => `${t.zone.tzid}|${t.toString()}`;
function value(calendar: ICAL.Component, input: DateValue) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z?)?$/.test(input.value)) throw Error('Invalid date format');
  const time = ICAL.Time.fromString(input.value);
  const check = new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second));
  const expected = input.value.length === 10 ? check.toISOString().slice(0, 10) : check.toISOString().slice(0, 19) + (input.value.endsWith('Z') ? 'Z' : '');
  if (expected !== input.value) throw Error('Invalid calendar date');
  if (input.tzid) {
    if (time.isDate || /Z$/.test(input.value)) throw Error('TZID requires local DATE-TIME');
    const zone = calendar.getTimeZoneByID(input.tzid);
    if (!zone) throw Error('Unresolved TZID');
    time.zone = zone;
  }
  return time;
}
/** Fail closed for a DST gap/fold. Candidate offsets come from supplied VTIMEZONE. */
export function instant(time: ICAL.Time, policy: Policy = {}) {
  if (time.isDate && policy.date !== 'utc') throw Error('DATE requires date: utc policy');
  if (!time.isDate && time.zone.tzid === 'floating' && policy.floating !== 'utc') throw Error('Floating requires floating: utc policy');
  if (time.isDate || ['UTC', 'floating'].includes(time.zone.tzid)) return time.toUnixTime() * 1000;
  const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  const offsets = new Set<number>(), transitions: {at: number; from: number; to: number}[] = [];
  for (const part of time.zone.component!.getAllSubcomponents()) {
    if (part.getAllProperties('rrule').length > 1 || part.hasProperty('exdate') || part.hasProperty('exrule')) throw Error('Unsupported timezone recurrence');
    const from = (part.getFirstPropertyValue('tzoffsetfrom') as ICAL.UtcOffset).toSeconds();
    const to = (part.getFirstPropertyValue('tzoffsetto') as ICAL.UtcOffset).toSeconds();
    offsets.add(from); offsets.add(to);
    const start = part.getFirstPropertyValue('dtstart') as ICAL.Time;
    const recurrence = part.getFirstPropertyValue('rrule') as ICAL.Recur | null;
    const iterator = recurrence?.iterator(start);
    const add = (t: ICAL.Time) => transitions.push({at: Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) - from * 1000, from, to});
    add(start);
    for (const p of part.getAllProperties('rdate')) for (const t of p.getValues()) add(t as ICAL.Time);
    if (iterator) {
      let exhausted = false;
      for (let i = 0; i < 10000; i++) {const t = iterator.next(); if (!t || t.year > time.year + 1) {exhausted = true; break;} add(t);}
      if (!exhausted) throw Error('Timezone expansion budget exceeded');
    }
  }
  transitions.sort((a, b) => a.at - b.at);
  if (!transitions.length) throw Error('Missing timezone observances');
  const candidates = [...offsets].map(offset => wall - offset * 1000).filter(ms => {
    let offset = transitions[0]!.from;
    for (const transition of transitions) {if (transition.at > ms) break; offset = transition.to;}
    return ms + offset * 1000 === wall;
  });
  if (candidates.length !== 1) throw Error('Ambiguous or nonexistent local time');
  return candidates[0]!;
}
function inspect(text: string, policy: Policy) {
  if (text.length > 65536) throw Error('Resource limit');
  const calendar = parse(text), components = calendar.getAllSubcomponents('vevent');
  if (calendar.name !== 'vcalendar' || calendar.hasProperty('method') || components.length > 100 || calendar.getAllSubcomponents().some(c => !['vevent', 'vtimezone'].includes(c.name))) throw Error('Unsupported calendar');
  const masters = components.filter(c => !c.hasProperty('recurrence-id'));
  if (masters.length !== 1) throw Error('One master required');
  const master = new ICAL.Event(masters[0]!);
  const seen = new Set<string>();
  for (const c of components) {
    const event = new ICAL.Event(c);
    if (!event.uid || event.uid !== master.uid || !c.hasProperty('dtstart') || c.hasProperty('attendee') || c.hasProperty('organizer')) throw Error('Personal events with one UID required');
    if (c.hasProperty('exrule') || c.getFirstProperty('recurrence-id')?.getParameter('range')) throw Error('EXRULE/RANGE unsupported');
    if (c.getAllProperties('rrule').length > 1) throw Error('Multiple RRULE unsupported');
    for (const p of c.getAllProperties('rrule')) {
      const r = p.getFirstValue() as ICAL.Recur;
      if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(r.freq) || r.interval < 1 || (r.count !== null && r.count < 1)) throw Error('Only DAILY/WEEKLY/MONTHLY supported');
    }
    for (const name of ['dtstart', 'dtend', 'recurrence-id', 'exdate', 'rdate']) for (const p of c.getAllProperties(name)) {
      const tzid = p.getParameter('tzid');
      if (tzid && !calendar.getTimeZoneByID(String(tzid))) throw Error('Unresolved TZID');
      for (const t of p.getValues()) {
        if (!(t instanceof ICAL.Time)) throw Error('Period dates unsupported');
        instant(t, policy);
      }
    }
    if (c.hasProperty('duration') && !['UTC', 'floating'].includes(event.startDate.zone.tzid)) throw Error('TZID DURATION unsupported; use DTEND');
    if (event.startDate.isDate !== event.endDate.isDate || instant(event.endDate, policy) <= instant(event.startDate, policy)) throw Error('Positive matching duration required');
    if (event.isRecurrenceException()) {
      if (!master.isRecurring() || event.recurrenceId.isDate !== master.startDate.isDate || event.recurrenceId.zone.tzid !== master.startDate.zone.tzid || seen.has(key(event.recurrenceId))) throw Error('Invalid recurrence identity');
      seen.add(key(event.recurrenceId));
    }
  }
  return {calendar, master, components};
}
function setTime(c: ICAL.Component, name: string, time: ICAL.Time) {
  c.removeAllProperties(name); const p = new ICAL.Property(name); p.setValue(time);
  if (!time.isDate && !['UTC', 'floating'].includes(time.zone.tzid)) p.setParameter('tzid', time.zone.tzid);
  c.addProperty(p);
}
function apply(calendar: ICAL.Component, c: ICAL.Component, fields: Fields) {
  for (const name of ['summary', 'description', 'location', 'url', 'status'] as const) if (fields[name] !== undefined) {
    if (fields[name] === null) c.removeAllProperties(name); else c.updatePropertyWithValue(name, fields[name]!);
  }
  if (fields.transparency) c.updatePropertyWithValue('transp', fields.transparency);
  if (fields.categories) {c.removeAllProperties('categories'); if (fields.categories.length) {const p = new ICAL.Property('categories'); p.setValues(fields.categories); c.addProperty(p);}}
  if (fields.start) setTime(c, 'dtstart', value(calendar, fields.start));
  if (fields.end) {c.removeAllProperties('duration'); setTime(c, 'dtend', value(calendar, fields.end));}
  if (fields.alarms) {
    c.removeAllSubcomponents('valarm');
    for (const alarm of fields.alarms) {
      if (!Number.isSafeInteger(alarm.minutesBefore) || alarm.minutesBefore < 0 || alarm.minutesBefore > 525600) throw Error('Invalid alarm');
      const a = new ICAL.Component('valarm'); a.addPropertyWithValue('action', 'DISPLAY'); a.addPropertyWithValue('description', alarm.description);
      a.addPropertyWithValue('trigger', ICAL.Duration.fromSeconds(-alarm.minutesBefore * 60)); c.addSubcomponent(a);
    }
  }
  c.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
  c.updatePropertyWithValue('sequence', Number(c.getFirstPropertyValue('sequence') ?? 0) + 1);
}
export function createEvent(uid: string, fields: Fields & {start: DateValue; end: DateValue}, recurrence?: {frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; count: number; byDay?: string[]}, timezone?: string, policy: Policy = {}) {
  const calendar = new ICAL.Component('vcalendar'); calendar.addPropertyWithValue('version', '2.0'); calendar.addPropertyWithValue('prodid', '-//Offline advanced calendar experiment//EN');
  if (timezone) calendar.addSubcomponent(parse(timezone));
  const c = new ICAL.Component('vevent'); calendar.addSubcomponent(c); c.addPropertyWithValue('uid', uid); apply(calendar, c, fields);
  if (recurrence) {if (!Number.isSafeInteger(recurrence.count) || recurrence.count < 1 || recurrence.count > 1000) throw Error('Finite recurrence count 1..1000 required'); if (recurrence.byDay?.some(day => !/^(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)$/.test(day))) throw Error('Invalid BYDAY'); c.addPropertyWithValue('rrule', ICAL.Recur.fromString(`FREQ=${recurrence.frequency};COUNT=${recurrence.count}${recurrence.byDay?.length ? ';BYDAY=' + recurrence.byDay.join(',') : ''}`));}
  const result = calendar.toString(); inspect(result, policy); return result;
}
/** Master edits change the base pattern; detached original IDs and explicit schedules remain unchanged. */
export function editSeries(text: string, fields: Fields, policy: Policy = {}) {
  const {calendar, master, components} = inspect(text, policy);
  // DTSTART changes move the master pattern; explicit detached overrides retain original IDs and schedules.
  apply(calendar, master.component, fields); const result = calendar.toString(); inspect(result, policy); return result;
}
export function editOccurrence(text: string, recurrenceId: DateValue, fields: Fields, policy: Policy = {}) {
  const {calendar, master, components} = inspect(text, policy), id = value(calendar, recurrenceId);
  if (!master.isRecurring() || id.isDate !== master.startDate.isDate || id.zone.tzid !== master.startDate.zone.tzid) throw Error('Invalid recurrence identity');
  const existing = components.find(c => c.hasProperty('recurrence-id') && key(new ICAL.Event(c).recurrenceId) === key(id));
  if (!existing) {
    const iterator = master.iterator(); let found = false;
    for (let i = 0; i < 10000; i++) {const t = iterator.next(); if (!t || t.compare(id) > 0) break; if (key(t) === key(id)) {found = true; break;}}
    if (!found) throw Error('Occurrence not found within budget');
  }
  const c = existing ?? new ICAL.Component(structuredClone(master.component.toJSON()));
  if (!existing) {
    for (const name of ['rrule', 'rdate', 'exdate']) c.removeAllProperties(name);
    setTime(c, 'recurrence-id', id); setTime(c, 'dtstart', id.clone());
    const end = master.startDate.isDate || master.startDate.zone.tzid === 'floating' ? id.clone() : ICAL.Time.fromJSDate(new Date(instant(id, policy) + instant(master.endDate, policy) - instant(master.startDate, policy)), true); if (master.startDate.isDate || master.startDate.zone.tzid === 'floating') end.addDuration(master.duration); setTime(c, 'dtend', end); c.removeAllProperties('duration'); calendar.addSubcomponent(c);
  }
  apply(calendar, c, fields); const result = calendar.toString(); inspect(result, policy); return result;
}
export const cancelOccurrence = (text: string, id: DateValue, policy: Policy = {}) => editOccurrence(text, id, {status: 'CANCELLED'}, policy);
/** Whole-resource deletion is deliberately a transport concern; this is local cancellation. */
export function cancelSeries(text: string, policy: Policy = {}) {
  const {calendar, components} = inspect(text, policy); for (const c of components) apply(calendar, c, {status: 'CANCELLED'}); return calendar.toString();
}
export function expand(text: string, window: {start: string; end: string}, policy: Policy = {}) {
  const from = Date.parse(window.start), to = Date.parse(window.end);
  if (!window.start.endsWith('Z') || !window.end.endsWith('Z') || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 366 * 86400000) throw Error('Finite UTC window of at most 366 days required');
  const {master, components} = inspect(text, policy);
  const rows: {id: string | null; start: string; end: string; summary: string; busy: boolean}[] = [], overridden = new Set<string>();
  const append = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, id: ICAL.Time | null) => {
    const a = instant(start, policy), b = instant(end, policy);
    if (b <= a) throw Error('Invalid occurrence duration');
    if (event.component.getFirstPropertyValue('status') === 'CANCELLED' || a >= to || b <= from) return;
    rows.push({id: id?.toString() ?? null, start: new Date(a).toISOString(), end: new Date(b).toISOString(), summary: event.summary ?? '', busy: event.component.getFirstPropertyValue('transp') !== 'TRANSPARENT'});
  };
  for (const c of components.filter(c => c.hasProperty('recurrence-id'))) {const e = new ICAL.Event(c); overridden.add(key(e.recurrenceId)); append(e, e.startDate, e.endDate, e.recurrenceId);}
  if (!master.isRecurring()) append(master, master.startDate, master.endDate, null);
  else {
    const iterator = master.iterator(); let finished = false;
    for (let i = 0; i < 10000; i++) {const next = iterator.next(); if (!next || instant(next, policy) >= to) {finished = true; break;} if (!overridden.has(key(next))) {const seconds = (instant(master.endDate, policy) - instant(master.startDate, policy)) / 1000; const end = master.startDate.isDate || master.component.hasProperty('duration') ? next.clone() : ICAL.Time.fromJSDate(new Date(instant(next, policy) + seconds * 1000), true); if (master.startDate.isDate || master.component.hasProperty('duration')) end.addDuration(master.duration); append(master, next, end, next);}}
    if (!finished) throw Error('Expansion budget exceeded');
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}
