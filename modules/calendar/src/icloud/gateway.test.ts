import {test,expect} from 'bun:test';
import {createICloudCalendarGateway} from './gateway.js';
import {createEvent} from '../domain/codec.js';
import {CalendarError} from '../domain/calendar.js';
import {escapeXml, CAL, DAV, createCalDavClient, parseMultiStatus} from './caldav-client.js';
const origin='https://p161-caldav.icloud.com',home=origin+'/home/',calendar=home+'cal/',principal=origin+'/principal/';
const fields={summary:'Original',start:{value:'2026-10-05T16:00:00Z'},end:{value:'2026-10-05T17:00:00Z'}};
const multi=(value:string,token='')=>`<d:multistatus xmlns:d="DAV:" xmlns:c="${CAL}" xmlns:cs="http://calendarserver.org/ns/">${value}${token?`<d:sync-token>${token}</d:sync-token>`:''}</d:multistatus>`;
const prop=(href:string,value:string)=>`<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop>${value}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
function fixture(){
 const calls:{method:string;url:string;body:string;headers:Headers}[]=[];
 let calendarName='Personal',rosterMissing=false,rosterStatus=404,rosterXml='',renameWrongHref=false;
 const objects=new Map<string,string>();let etag='"v1"',scheduleTag:string|undefined,writeFailure:number|undefined,throwWrite=false,wrongHome=false,readHook:(()=>void)|undefined;
 const fetcher:typeof fetch=Object.assign(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET',body=String(init?.body??''),headers=new Headers(init?.headers);calls.push({method,url,body,headers});
  if(method==='PROPFIND'){
   readHook?.();
   if(url==='https://caldav.icloud.com/'||url===origin+'/')return new Response(multi(prop(url,`<d:current-user-principal><d:href>${principal}</d:href></d:current-user-principal>`)),{status:207});
   if(url===principal)return new Response(multi(prop(url,`<c:calendar-home-set><d:href>${wrongHome?'https://p161-caldav.icloud.com/other/':home}</d:href></c:calendar-home-set><c:calendar-user-address-set><d:href>mailto:owner@icloud.com</d:href><d:href>${principal}</d:href></c:calendar-user-address-set>`)),{status:207});
   if(url===home && body.includes('current-user-privilege-set') && headers.get('depth')!=='1')return new Response(multi(prop(home,'<d:current-user-privilege-set><d:privilege><d:unbind/></d:privilege></d:current-user-privilege-set>')),{status:207});
   if(url===home)return new Response(multi(prop(calendar,'<d:displayname>Personal</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>')),{status:207});
   const properties=`<d:displayname>${calendarName}</d:displayname><d:getetag>&quot;collection&quot;</d:getetag><d:current-user-privilege-set><d:privilege><d:write-properties/></d:privilege></d:current-user-privilege-set><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:owner><d:href>${principal}</d:href></d:owner>${rosterMissing?'':`<cs:invite>${rosterXml}</cs:invite>`}<cs:allowed-sharing-modes><cs:can-be-shared/></cs:allowed-sharing-modes>`;
   const response=prop(url,properties).replace('</d:response>',rosterMissing?`<d:propstat><d:prop><cs:invite/></d:prop><d:status>HTTP/1.1 ${rosterStatus} Missing</d:status></d:propstat></d:response>`:'</d:response>');
   return new Response(multi(response),{status:207});
  }
  if(method==='GET'){const data=objects.get(url);return new Response(data??null,{status:data?200:404,headers:{etag,...(scheduleTag?{'schedule-tag':scheduleTag}:{})}});}
  if(method==='OPTIONS')return new Response(null,{headers:{dav:'calendar-access, calendar-auto-schedule, calendarserver-sharing'}});
  if(method==='REPORT')return new Response(multi([...objects].map(([href,data])=>prop(href,`<d:getetag>${escapeXml(etag)}</d:getetag><c:calendar-data>${escapeXml(data)}</c:calendar-data>`)).join(''),'next'),{status:207});
  if(throwWrite)throw Error('socket disconnected');if(writeFailure)return new Response(null,{status:writeFailure});
  if(method==='PROPPATCH'){calendarName=body.match(/<d:displayname>(.*?)<\/d:displayname>/)?.[1]??calendarName;return new Response(multi(prop(renameWrongHref?home+'wrong/':url,'<d:displayname/>')),{status:207});}
  if(method==='POST'){const address=body.match(/<d:href>(.*?)<\/d:href>/)?.[1]??'';if(body.includes('<cs:remove>')){rosterMissing=true;rosterXml='';}else{rosterMissing=false;rosterXml=`<cs:organizer><d:href>owner@icloud.com</d:href></cs:organizer><cs:user><d:href>${address}</d:href><cs:access><cs:${body.includes('<cs:read-write/>')?'read-write':'read'}/></cs:access><cs:invite-noresponse/></cs:user>`;}return new Response(null,{status:200});}
  if(method==='PUT'){objects.set(url,body);etag='"v2"';return new Response(null,{status:201});}
  if(method==='DELETE'){objects.delete(url);return new Response(null,{status:204});}
  return new Response(null,{status:201});
 },{preconnect:()=>{}}) as typeof fetch;
 const gateway=createICloudCalendarGateway({credential:{user:'owner@icloud.com',appPassword:'secret'},fetch:fetcher});
 return {gateway,calls,objects,fetcher,setEtag:(v:string)=>{etag=v},setScheduleTag:(v:string)=>{scheduleTag=v},setWriteFailure:(v:number)=>{writeFailure=v},throwWrite:()=>{throwWrite=true},onRead:(fn:()=>void)=>{readHook=fn},missingRoster:(code=404)=>{rosterMissing=true;rosterStatus=code},setRoster:(xml:string)=>{rosterMissing=false;rosterXml=xml},wrongRename:()=>{renameWrongHref=true}};
}
test('authenticated shard discovery, deterministic creation, lossless conditional edits and deletion',async()=>{
 const f=fixture();const made=await f.gateway.execute({operation:'create_event',calendarHref:calendar,uid:'event-1',fields});
 expect(made.event?.href).toBe(calendar+'event-1.ics');expect(f.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
 f.objects.set(made.event!.href,made.event!.ical.replace('END:VEVENT','X-KEEP:untouched\r\nEND:VEVENT'));
 const changed=await f.gateway.execute({operation:'update_event',identity:made.event!,fields:{summary:'Changed'}});
 expect(changed.event?.ical).toContain('X-KEEP:untouched');expect(changed.event?.summary).toBe('Changed');expect(f.calls.filter(c=>c.method==='PUT').at(-1)?.headers.get('if-match')).toBe('"v2"');
 expect((await f.gateway.execute({operation:'delete_event',identity:changed.event!})).deleted).toBe(true);expect(f.objects.size).toBe(0);
 expect(f.calls.every(c=>new URL(c.url).hostname.endsWith('.icloud.com'))).toBe(true);
});
test('stale ETag fails before write; witnessed 412 remains a definitive conflict',async()=>{
 const f=fixture(),href=calendar+'one.ics';f.objects.set(href,createEvent('one',fields));
 await expect(f.gateway.execute({operation:'delete_event',identity:{calendarHref:calendar,href,uid:'one',etag:'"stale"'}})).rejects.toMatchObject({code:'conflict',dispatched:false});expect(f.calls.filter(c=>c.method==='DELETE')).toHaveLength(0);
 f.setWriteFailure(412);await expect(f.gateway.execute({operation:'delete_event',identity:{calendarHref:calendar,href,uid:'one',etag:'"v1"'}})).rejects.toMatchObject({code:'conflict',dispatched:true,definitive:true});
});
test('unknown mutation is never replayed; dispatch callback distinguishes read and write',async()=>{
 const f=fixture();f.throwWrite();const phases:boolean[]=[];
 await expect(f.gateway.execute({operation:'create_event',calendarHref:calendar,uid:'once',fields},c=>{phases.push(c.mutation===true)})).rejects.toMatchObject({code:'outcome_unknown',dispatched:true});
 expect(f.calls.filter(c=>c.method==='PUT')).toHaveLength(1);expect(phases.filter(Boolean)).toHaveLength(1);expect(phases.includes(false)).toBe(true);
});
test('immediate policy revocation stops mutation after preflight',async()=>{
 const f=fixture();let allow=true;f.onRead(()=>{allow=false});
 await expect(f.gateway.execute({operation:'create_event',calendarHref:calendar,uid:'revoked',fields},()=>{if(!allow)throw new CalendarError('forbidden','revoked')})).rejects.toMatchObject({code:'forbidden'});
 expect(f.calls.filter(c=>c.method==='PUT')).toHaveLength(0);
});
test('scheduling writes carry Schedule-Tag and require scheduling dispatch context',async()=>{
 const f=fixture(),href=calendar+'scheduled.ics';f.setScheduleTag('"s1"');f.objects.set(href,createEvent('scheduled',fields).replace('END:VEVENT',`ORGANIZER:${principal}\r\nATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:friend@example.com\r\nEND:VEVENT`));
 const actual=(await f.gateway.execute({operation:'get_event',calendarHref:calendar,href})).event!;const contexts:boolean[]=[];
 await f.gateway.execute({operation:'update_event',identity:actual,fields:{summary:'Moved'}},c=>{if(c.mutation)contexts.push(c.scheduled)});
 const put=f.calls.find(c=>c.method==='PUT')!;expect(put.headers.get('if-schedule-tag-match')).toBe('"s1"');expect(contexts).toEqual([true]);expect(put.body).toContain('ATTENDEE');
});
test('caller foreign paths and untrusted transport targets receive no credentials',async()=>{
 const f=fixture();await expect(f.gateway.execute({operation:'get_event',calendarHref:calendar,href:origin+'/other/leak.ics'})).rejects.toMatchObject({code:'forbidden'});expect(f.calls.some(c=>c.url.includes('/other/'))).toBe(false);
 expect(()=>createICloudCalendarGateway({credential:{user:'owner@icloud.com',appPassword:'secret'},allowedOrigins:['https://evil.example']})).toThrow('Untrusted');
 const client=createCalDavClient({baseUrl:origin,fetch:f.fetcher});await expect(client.request('GET','http://localhost/')).rejects.toThrow('Untrusted');
});
test('redirects are not followed and duplicate XML property statuses are rejected',async()=>{
 const seen:string[]=[];const fetcher=Object.assign(async(input:RequestInfo|URL)=>{seen.push(String(input));return new Response(null,{status:302,headers:{location:'https://evil.example/'}})},{preconnect:()=>{}}) as typeof fetch;
 const c=createCalDavClient({baseUrl:origin,authorization:'Basic secret',fetch:fetcher});await expect(c.request('GET','/')).rejects.toThrow('redirect');expect(seen).toHaveLength(1);
 expect(()=>parseMultiStatus(multi(prop('/x','<d:getetag>one</d:getetag><d:getetag>two</d:getetag>')))).toThrow('Duplicate');
});
test('sync hydration revision mismatch preserves previous snapshot and token',async()=>{
 const href=calendar+'one.ics',previous={token:'old',resources:{[href]:{etag:'"old"',data:'old'}}};
 const fetcher=Object.assign(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='REPORT'?new Response(multi(prop(href,'<d:getetag>&quot;new&quot;</d:getetag>'),'next'),{status:207}):new Response('new',{headers:{etag:'"different"'}}),{preconnect:()=>{}}) as typeof fetch;
 const c=createCalDavClient({baseUrl:origin,fetch:fetcher});await expect(c.sync(calendar,previous)).rejects.toThrow('revision changed');expect(previous).toEqual({token:'old',resources:{[href]:{etag:'"old"',data:'old'}}});
});

test('UID path separators fail before dispatch or write',async()=>{
 for(const uid of ['a/b','..\\escape','control\u0001']){const f=fixture();await expect(f.gateway.execute({operation:'create_event',calendarHref:calendar,uid,fields})).rejects.toMatchObject({code:'invalid_input'});expect(f.calls.some(c=>c.method==='PUT')).toBe(false);}
});
test('collection rename validates exact target and observed name; deletion has destructive scheduling guard',async()=>{
 const f=fixture();const renamed=await f.gateway.execute({operation:'update_calendar',calendarHref:calendar,name:'Renamed',etag:'"collection"'});expect(renamed.concurrency).toBe('preflight-only');expect(renamed.calendar).toEqual({href:calendar,name:'Renamed',etag:'"collection"'});
 const contexts:boolean[]=[];await f.gateway.execute({operation:'delete_calendar',calendarHref:calendar,etag:'"collection"',confirmDeleteAllEvents:true},c=>{if(c.mutation)contexts.push(c.scheduled)});expect(contexts).toEqual([true]);
 const wrong=fixture();wrong.wrongRename();await expect(wrong.gateway.execute({operation:'update_calendar',calendarHref:calendar,name:'Other',etag:'"collection"'})).rejects.toMatchObject({code:'outcome_unknown'});
});
test('first share supports nonempty unshared calendar404, verified add/change/remove and bare-email organizer',async()=>{
 const f=fixture();f.missingRoster();f.objects.set(calendar+'existing.ics',createEvent('existing',fields));
 const added=await f.gateway.execute({operation:'share',calendarHref:calendar,sharee:'friend@example.com',access:'read'});expect(added.sharing?.members).toEqual([{address:'mailto:friend@example.com',access:'read',status:'invite-noresponse'}]);
 const changed=await f.gateway.execute({operation:'share',calendarHref:calendar,sharee:'friend@example.com',access:'read-write'});expect(changed.sharing?.members[0]?.access).toBe('read-write');
 const removed=await f.gateway.execute({operation:'share',calendarHref:calendar,sharee:'friend@example.com',access:'remove'});expect(removed.sharing?.members).toEqual([]);expect(f.objects.size).toBe(1);expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(3);
});
test('sharing forbidden metadata, ambiguous organizer, and missing remove roster prevent POST',async()=>{
 for(const setup of [(f:ReturnType<typeof fixture>)=>f.missingRoster(403),(f:ReturnType<typeof fixture>)=>f.setRoster('<cs:organizer><d:href>intruder@example.com</d:href></cs:organizer>')]){const f=fixture();setup(f);await expect(f.gateway.execute({operation:'share',calendarHref:calendar,sharee:'friend@example.com',access:'read'})).rejects.toBeInstanceOf(CalendarError);expect(f.calls.some(c=>c.method==='POST')).toBe(false);}
 const missing=fixture();missing.missingRoster();await expect(missing.gateway.execute({operation:'share',calendarHref:calendar,sharee:'friend@example.com',access:'remove'})).rejects.toMatchObject({code:'unsupported'});expect(missing.calls.some(c=>c.method==='POST')).toBe(false);
});
test('recurring invitation and occurrence cancellation preserve series scheduling identities',async()=>{
 const f=fixture();const made=await f.gateway.execute({operation:'invite',calendarHref:calendar,uid:'series',fields,recurrence:{frequency:'DAILY',count:3},attendees:['friend@example.com']});expect(made.event?.ical).toContain('RRULE:FREQ=DAILY;COUNT=3');
 const edited=await f.gateway.execute({operation:'update_event',identity:made.event!,recurrenceId:{value:'2026-10-06T16:00:00Z'},fields:{summary:'Exception'}});expect(edited.event?.ical).toContain('RECURRENCE-ID:20261006T160000Z');
 const cancelled=await f.gateway.execute({operation:'delete_event',identity:edited.event!,recurrenceId:{value:'2026-10-06T16:00:00Z'}});expect(cancelled.event?.ical).toContain('STATUS:CANCELLED');expect(cancelled.event?.ical.match(/ATTENDEE/g)?.length).toBe(2);
});

test('sharing access namespace confusion fails before POST',async()=>{
 const f=fixture();f.setRoster('<cs:user><d:href>mailto:friend@example.com</d:href><cs:access><x:read xmlns:x="http://calendarserver.org/xx/"/></cs:access><cs:invite-noresponse/></cs:user>');
 await expect(f.gateway.execute({operation:'share',calendarHref:calendar,sharee:'friend@example.com',access:'read-write'})).rejects.toMatchObject({code:'unsupported'});expect(f.calls.some(c=>c.method==='POST')).toBe(false);
});

test('invalid normalized UTC dates are rejected before a range REPORT',async()=>{
 for(const operation of ['query_events','availability'] as const){
  for(const start of ['2026-02-30T00:00:00Z','2026-10-05T24:00:00Z']){
   const f=fixture();await expect(f.gateway.execute({operation,calendarHref:calendar,start,end:'2026-10-07T00:00:00Z'})).rejects.toMatchObject({code:'invalid_input'});
   expect(f.calls.filter(c=>c.method==='REPORT')).toHaveLength(0);
  }
 }
 const f=fixture();await f.gateway.execute({operation:'query_events',calendarHref:calendar,start:'2028-02-29T00:00:00.000Z',end:'2028-03-01T00:00:00Z'});
 expect(f.calls.filter(c=>c.method==='REPORT')).toHaveLength(1);
});
