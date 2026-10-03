import {test,expect} from 'bun:test';
import ICAL from 'ical.js';
const timezone=`BEGIN:VTIMEZONE
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
const parse=(text:string)=>new ICAL.Component(ICAL.parse(text.replaceAll('\n','\r\n')));
test('bundled synthetic VTIMEZONE preserves local daily recurrence across spring and fall DST',()=>{
 const zone=new ICAL.Timezone(parse(timezone));ICAL.TimezoneService.register(zone);
 try{for(const [start,expected] of [['20260307',['2026-03-07T14:00:00.000Z','2026-03-08T13:00:00.000Z','2026-03-09T13:00:00.000Z']],['20261031',['2026-10-31T13:00:00.000Z','2026-11-01T14:00:00.000Z','2026-11-02T14:00:00.000Z']]] as const){
  const event=new ICAL.Event(parse(`BEGIN:VEVENT\nUID:dst@example.invalid\nDTSTART;TZID=Fixture/Eastern:${start}T090000\nDTEND;TZID=Fixture/Eastern:${start}T100000\nRRULE:FREQ=DAILY;COUNT=3\nEND:VEVENT`));
  const iterator=event.iterator(),actual:string[]=[];for(let i=0;i<3;i++)actual.push(iterator.next()!.toJSDate().toISOString());expect(actual).toEqual([...expected]);expect(iterator.next()).toBeUndefined();
 }}finally{ICAL.TimezoneService.remove('Fixture/Eastern');}
});
test('RECURRENCE-ID override moves one instance while EXDATE excludes another',()=>{
 const calendar=parse(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series@example.invalid
DTSTART:20261001T090000Z
DTEND:20261001T100000Z
RRULE:FREQ=DAILY;COUNT=3
EXDATE:20261003T090000Z
X-KEEP:original
END:VEVENT
BEGIN:VEVENT
UID:series@example.invalid
RECURRENCE-ID:20261002T090000Z
DTSTART:20261002T110000Z
DTEND:20261002T120000Z
SUMMARY:Moved instance
END:VEVENT
END:VCALENDAR`);
 const master=new ICAL.Event(calendar.getAllSubcomponents('vevent')[0]!);master.relateException(new ICAL.Event(calendar.getAllSubcomponents('vevent')[1]!));
 const iterator=master.iterator();expect(master.getOccurrenceDetails(iterator.next()!).startDate.toString()).toBe('2026-10-01T09:00:00Z');
 const moved=master.getOccurrenceDetails(iterator.next()!);expect(moved.startDate.toString()).toBe('2026-10-02T11:00:00Z');expect(moved.item.summary).toBe('Moved instance');expect(iterator.next()).toBeUndefined();
 const roundtrip=parse(calendar.toString().replaceAll('\r\n','\n'));expect(roundtrip.getAllSubcomponents('vevent').length).toBe(2);expect(roundtrip.getAllSubcomponents('vevent')[0]!.getFirstPropertyValue('x-keep')).toBe('original');
});
