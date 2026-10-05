import ICAL from 'ical.js';
import
{
  escapeXml, parseMultiStatus, parseXml
}
from './caldav-client';
export interface CalendarTransport
{
  request(method:string, href:string, options?:
  {
    headers?:Record<string,string>;body?:string
  }):Promise<
  {
    status:number;
    headers:Headers;
    body:string;
    url:string
  }
  >
}
const xmlHeaders=
{
  'content-type':'application/xml; charset=utf-8'
};
const propfind=(props:string)=>`<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`;
function success(status:number, allowed:number[])
{
  if(!allowed.includes(status))throw Error(`Calendar operation failed: HTTP ${status}`);
}
/** Collection mutations are deliberately limited to collections created by this instance. */
export function calendarOperations(client:CalendarTransport)
{
  const owned=new Set<string>();
  async function list(home:string)
  {
    const res=await client.request('PROPFIND',home,
    {
      headers:
      {
        ...xmlHeaders,depth:'1'
      },body:propfind('<d:displayname/><d:resourcetype/><d:current-user-privilege-set/>')
    });
    success(res.status,[207]);
    return parseMultiStatus(res.body);
  }
  async function inspect(href:string)
  {
    const options=await client.request('OPTIONS',href);
    success(options.status,[200,204]);
    const res=await client.request('PROPFIND',href,
    {
      headers:
      {
        ...xmlHeaders,depth:'0'
      },body:propfind('<d:current-user-privilege-set/><d:acl/><d:owner/><c:schedule-inbox-URL/><c:schedule-outbox-URL/><cs:allowed-sharing-modes xmlns:cs="http://calendarserver.org/ns/"/><cs:invite xmlns:cs="http://calendarserver.org/ns/"/>')
    });
    success(res.status,[207]);
    return {
      dav:options.headers.get('dav')??'',allow:options.headers.get('allow')??'',properties:parseMultiStatus(res.body),sharingMutation:'unsupported-unverified' as const
    };
  }
  async function create(home:string, token:string, name:string)
  {
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(token))throw Error('Invalid experiment token');
    const base=new URL(home);
    if(!base.pathname.endsWith('/')||base.search||base.hash)throw Error('Expected calendar home collection URL');
    const href=new URL(`experiment-${token}/`,base).href;
    const body=`<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>${escapeXml(name)}</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`;
    const res=await client.request('MKCALENDAR',href,
    {
      headers:
      {
        ...xmlHeaders,'if-none-match':'*'
      },body
    });
    success(res.status,[201]);
    owned.add(href);
    return href;
  }
  function requireOwned(href:string)
  {
    if(!owned.has(href))throw Error('Collection is not owned by this experiment');
  }
  async function rename(href:string,name:string)
  {
    requireOwned(href);
    const res=await client.request('PROPPATCH',href,
    {
      headers:xmlHeaders,body:`<d:propertyupdate xmlns:d="DAV:"><d:set><d:prop><d:displayname>${escapeXml(name)}</d:displayname></d:prop></d:set></d:propertyupdate>`
    });
    success(res.status,[207]);
    const patched=parseMultiStatus(res.body);
    if(patched.length!==1||patched[0]!.errors.length>0||new URL(patched[0]!.href,href).href!==href||!('{DAV:}displayname' in patched[0]!.props))throw Error('Rename property update failed');
    const check=await client.request('PROPFIND',href,
    {
      headers:
      {
        ...xmlHeaders,depth:'0'
      },body:propfind('<d:displayname/>')
    });
    success(check.status,[207]);
    const rows=parseMultiStatus(check.body);
    if(!rows.some(row=>row.errors.length===0&&new URL(row.href,href).href===href&&row.props['{DAV:}displayname']===name))throw Error('Rename verification failed');
  }
  /** Fixture-only: the empty check and DELETE are not atomic. Do not use on shared/live collections. */
  async function remove(href:string)
  {
    requireOwned(href);
    const rows=await list(href);
    const base=new URL(href);
    if(rows.length!==1||rows[0]!.errors.length>0||(rows[0]!.status!==undefined&&rows[0]!.status!==200)||new URL(rows[0]!.href,base).href!==base.href)throw Error('Refuse deletion: collection is not verified empty');
    const res=await client.request('DELETE',href);
    success(res.status,[200,204]);
    owned.delete(href);
    const verify=await client.request('PROPFIND',href,
    {
      headers:
      {
        ...xmlHeaders,depth:'0'
      },body:propfind('<d:resourcetype/>')
    });
    success(verify.status,[404,410]);
  }
  return {
    list,inspect,create,rename,remove
  };
}
export type Participation='ACCEPTED'|'TENTATIVE'|'DECLINED';
function address(input:string)
{
  if(!/^mailto:[^\s<>:,;]+@[^\s<>:,;]+$/i.test(input))throw Error('Expected a single mailto address');
  return input;
}
function utc(input:string)
{
  if(!/^\d{8}T\d{6}Z$/.test(input))throw Error('Expected UTC iCalendar timestamp');
  const parsed=ICAL.Time.fromString(`${input.slice(0,4)}-${input.slice(4,6)}-${input.slice(6,8)}T${input.slice(9,11)}:${input.slice(11,13)}:${input.slice(13,15)}Z`);
  if(parsed.toICALString()!==input)throw Error('Invalid timestamp');
  return parsed;
}
function eventOf(ics:string)
{
  const cal=new ICAL.Component(ICAL.parse(ics));
  const events=cal.getAllSubcomponents('vevent');
  if(events.length!==1)throw Error('Expected exactly one event');
  const event=events[0]!;
  if(!event.getFirstPropertyValue('uid')||!event.getFirstPropertyValue('organizer'))throw Error('Missing scheduling identity');
  if(event.hasProperty('rrule')||event.hasProperty('recurrence-id'))throw Error('Recurring scheduling is not supported by this experiment');
  return {
    cal,event
  };
}
function actorIs(actual:unknown,actor:string)
{
  if(String(actual).toLowerCase()!==address(actor).toLowerCase())throw Error('Scheduling actor does not own this role');
}
function sequence(event:ICAL.Component)
{
  const value=event.getFirstPropertyValue('sequence')??0;
  if(typeof value!=='number'||!Number.isInteger(value)||value<0)throw Error('Invalid sequence');
  return value;
}
/** These functions only construct messages;
none transmits or writes an invitation. */
export function invitation(input:
{
  uid:string;organizer:string;attendees:string[];summary:string;start:string;end:string;stamp:string
})
{
  if(!input.uid||/[\r\n]/.test(input.uid)||input.attendees.length===0)throw Error('Missing invitation identity or attendees');
  const start=utc(input.start),end=utc(input.end);
  if(start.compare(end)>=0)throw Error('Invalid event interval');
  const cal=new ICAL.Component('vcalendar');
  cal.updatePropertyWithValue('version','2.0');
  cal.updatePropertyWithValue('prodid','-//iCloud Plugin Calendar Experiment//EN');
  cal.updatePropertyWithValue('method','REQUEST');
  const event=new ICAL.Component('vevent');
  cal.addSubcomponent(event);
  for(const [key,value] of Object.entries(
  {
    uid:input.uid,organizer:address(input.organizer),summary:input.summary,sequence:0,dtstamp:utc(input.stamp),dtstart:start,dtend:end
  }))event.updatePropertyWithValue(key,value);
  for(const attendee of [...new Set(input.attendees.map(address))])
  {
    const prop=new ICAL.Property('attendee');
    prop.setValue(attendee);
    prop.setParameter('partstat','NEEDS-ACTION');
    prop.setParameter('rsvp','TRUE');
    event.addProperty(prop);
  }
  return cal.toString();
}
export function reply(ics:string,actor:string,participation:Participation,stamp:string)
{
  if(!['ACCEPTED','TENTATIVE','DECLINED'].includes(participation))throw Error('Invalid participation');
  const
  {
    cal,event
  }
  =eventOf(ics);
  if(cal.getFirstPropertyValue('method')!=='REQUEST')throw Error('Expected REQUEST');
  sequence(event);
  const attendee=event.getAllProperties('attendee').find(p=>String(p.getFirstValue()).toLowerCase()===address(actor).toLowerCase());
  if(!attendee)throw Error('Actor is not invited');
  event.removeAllProperties('attendee');
  attendee.setParameter('partstat',participation);
  attendee.removeParameter('rsvp');
  event.addProperty(attendee);
  event.updatePropertyWithValue('dtstamp',utc(stamp));
  cal.updatePropertyWithValue('method','REPLY');
  return cal.toString();
}
export function cancel(ics:string,actor:string,stamp:string)
{
  const
  {
    cal,event
  }
  =eventOf(ics);
  if(cal.getFirstPropertyValue('method')!=='REQUEST')throw Error('Expected organizer REQUEST');
  actorIs(event.getFirstPropertyValue('organizer'),actor);
  event.updatePropertyWithValue('sequence',sequence(event)+1);
  event.updatePropertyWithValue('dtstamp',utc(stamp));
  event.updatePropertyWithValue('status','CANCELLED');
  cal.updatePropertyWithValue('method','CANCEL');
  return cal.toString();
}
export function updateInvitation(ics:string,actor:string,change:
{
  summary?:string;start?:string;end?:string
},stamp:string)
{
  const
  {
    cal,event
  }
  =eventOf(ics);
  if(cal.getFirstPropertyValue('method')!=='REQUEST')throw Error('Expected organizer REQUEST');
  actorIs(event.getFirstPropertyValue('organizer'),actor);
  if(change.summary!==undefined)event.updatePropertyWithValue('summary',change.summary);
  if(change.start)event.updatePropertyWithValue('dtstart',utc(change.start));
  if(change.end)event.updatePropertyWithValue('dtend',utc(change.end));
  if((event.getFirstPropertyValue('dtstart') as ICAL.Time).compare(event.getFirstPropertyValue('dtend') as ICAL.Time)>=0)throw Error('Invalid event interval');
  event.updatePropertyWithValue('sequence',sequence(event)+1);
  event.updatePropertyWithValue('dtstamp',utc(stamp));
  return cal.toString();
}
export const CALENDAR_SERVER = 'http://calendarserver.org/ns/';
/** Legacy Apple CalendarServer contract only, not evidence of current iCloud support. */
export function sharingChange(input:
{
  dav:string;allowedModesXml:string;owner:boolean;sharee:string;access:'read'|'read-write'|'remove';summary?:string
})
{
  if(!input.owner)throw Error('Only the calendar owner may share');
  if(!input.dav.split(',').map(value=>value.trim()).includes('calendarserver-sharing'))throw Error('CalendarServer sharing capability absent');
  const root=parseXml(input.allowedModesXml);
  if(root.name!==`{${CALENDAR_SERVER}}allowed-sharing-modes`||!root.children.some(child=>child.name===`{${CALENDAR_SERVER}}can-be-shared`))throw Error('Calendar sharing is not allowed');
  if(!['read','read-write','remove'].includes(input.access))throw Error('Unsupported sharing access');
  const href=`<d:href>${escapeXml(address(input.sharee))}</d:href>`;
  const change=input.access==='remove'?`<cs:remove>${href}</cs:remove>`:`<cs:set>${href}<cs:summary>${escapeXml(input.summary??'Calendar experiment')}</cs:summary><cs:${input.access}/></cs:set>`;
  return {
    method:'POST' as const,headers:xmlHeaders,body:`<cs:share xmlns:d="DAV:" xmlns:cs="${CALENDAR_SERVER}">${change}</cs:share>`,mayNotifyRecipient:true as const
  };
}
