import {test,expect} from 'bun:test';
import ICAL from 'ical.js';
import {XMLParser} from 'fast-xml-parser';
const ics=(extra='')=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Offline fixture//EN\r\nBEGIN:VEVENT\r\nUID:fixture-1@example.invalid\r\nDTSTAMP:20261001T120000Z\r\nDTSTART;VALUE=DATE:20261002\r\nDTEND;VALUE=DATE:20261003\r\nSUMMARY:Planning\\, review\r\nX-PRIVATE-FIXTURE:preserve\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;
const parse=(text:string)=>new ICAL.Component(ICAL.parse(text));
function personalWrite(text:string){const component=parse(text);if(component.hasProperty('method'))throw Error('Scheduling unsupported');for(const event of component.getAllSubcomponents('vevent'))if(event.hasProperty('attendee')||event.hasProperty('organizer'))throw Error('Scheduling unsupported');return component;}
test('real iCalendar parser preserves UID, all-day exclusive end, escaping and unknown property on edit',()=>{
 const component=parse(ics()),event=new ICAL.Event(component.getFirstSubcomponent('vevent')!);
 expect(event.uid).toBe('fixture-1@example.invalid');expect(event.startDate.isDate).toBe(true);expect(event.endDate.toString()).toBe('2026-10-03');expect(event.summary).toBe('Planning, review');
 event.summary='Changed';const reparsed=parse(component.toString()).getFirstSubcomponent('vevent')!;
 expect(reparsed.getFirstPropertyValue('x-private-fixture')).toBe('preserve');expect(reparsed.getFirstPropertyValue('uid')).toBe(event.uid);
});
test('bounded actual recurrence expansion honors exclusion',()=>{
 const event=new ICAL.Event(parse(ics('RRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;VALUE=DATE:20261003\r\n')).getFirstSubcomponent('vevent')!);
 const iterator=event.iterator(),dates:string[]=[];for(let i=0;i<10;i++){const next=iterator.next();if(!next)break;dates.push(next.toString());}
 expect(dates).toEqual(['2026-10-02','2026-10-04']);
});
test('CalDAV XML parser reads escaped href and ETag without namespace stripping',()=>{
 const parser=new XMLParser({ignoreAttributes:false,processEntities:true});
 const result=parser.parse('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/cal/a%20b.ics</d:href><d:propstat><d:prop><d:getetag>&quot;v1&quot;</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>');
 expect(result['d:multistatus']['d:response']['d:href']).toBe('/cal/a%20b.ics');expect(result['d:multistatus']['d:response']['d:propstat']['d:prop']['d:getetag']).toBe('"v1"');
});
test('personal-write policy rejects invitation and scheduling payloads',()=>{
 expect(()=>personalWrite(ics('ATTENDEE:mailto:guest@example.invalid\r\n'))).toThrow('Scheduling');expect(()=>personalWrite(ics('ORGANIZER:mailto:owner@example.invalid\r\n'))).toThrow('Scheduling');expect(()=>personalWrite(ics().replace('VERSION:2.0','VERSION:2.0\r\nMETHOD:REQUEST'))).toThrow('Scheduling');
 expect(personalWrite(ics()).name).toBe('vcalendar');
});
test('offline HTTP-shaped fixture enforces create/update/delete ETag preconditions',async()=>{
 let stored:string|null=null,revision=0;
 const fixture=async(request:Request)=>{const exists=stored!==null,etag=`"v${revision}"`;
  if(request.method==='GET')return new Response(stored,{status:exists?200:404,headers:exists?{etag}:{}});
  if(request.headers.get('if-none-match')==='*'){if(exists)return new Response(null,{status:412});}
  else if(!exists||request.headers.get('if-match')!==etag)return new Response(null,{status:412});
  if(request.method==='DELETE'){stored=null;return new Response(null,{status:204});}
  stored=await request.text();revision++;return new Response(null,{status:exists?204:201,headers:{etag:`"v${revision}"`}});
 };
 const call=(method:string,headers:Record<string,string>={},body?:string)=>fixture(new Request('https://fixture.invalid/cal/one.ics',{method,headers,body}));
 expect((await call('PUT',{'if-none-match':'*'},ics())).status).toBe(201);expect((await call('PUT',{'if-none-match':'*'},ics())).status).toBe(412);
 expect((await call('PUT',{'if-match':'"stale"'},ics())).status).toBe(412);expect((await call('PUT',{'if-match':'"v1"'},ics())).status).toBe(204);
 expect((await call('DELETE',{'if-match':'"v1"'})).status).toBe(412);expect((await call('DELETE',{'if-match':'"v2"'})).status).toBe(204);expect((await call('GET')).status).toBe(404);
});

test('timezone IDs need an explicit timezone source; floating time is not UTC',()=>{
 const text=ics().replace('DTSTART;VALUE=DATE:20261002','DTSTART;TZID=America/Toronto:20261002T090000').replace('DTEND;VALUE=DATE:20261003','DTEND;TZID=America/Toronto:20261002T100000');
 const component=parse(text).getFirstSubcomponent('vevent')!;
 expect(component.getFirstProperty('dtstart')!.getParameter('tzid')).toBe('America/Toronto');
 // The stock candidate contains no IANA timezone database: a production adapter
 // must reject unresolved TZID rather than silently format a UTC instant.
 expect(ICAL.TimezoneService.has('America/Toronto')).toBe(false);
 const floating=new ICAL.Event(parse(ics().replace('DTSTART;VALUE=DATE:20261002','DTSTART:20261002T090000')).getFirstSubcomponent('vevent')!);
 expect(floating.startDate.zone.tzid).toBe('floating');
});
