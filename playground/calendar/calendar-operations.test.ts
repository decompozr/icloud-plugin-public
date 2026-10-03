import
{
  expect,test
}
from 'bun:test';
import ICAL from 'ical.js';
import
{
  parseXml,content
}
from './caldav-client';
import
{
  calendarOperations,invitation,reply,cancel,updateInvitation,sharingChange,CALENDAR_SERVER
}
from './calendar-operations';
const event=(ics:string)=>new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')!;
const original=()=>invitation(
{
  uid:'fixture-meeting@example.invalid',organizer:'mailto:owner@example.invalid',attendees:['mailto:guest@example.invalid','mailto:other@example.invalid'],summary:'Meeting, planning',start:'20261005T140000Z',end:'20261005T150000Z',stamp:'20261003T120000Z'
});
test('invitation, updates and cancellation preserve UID and organizer with increasing sequence',()=>
{
  const source=original();const updated=updateInvitation(source,'mailto:owner@example.invalid',
  {
    summary:'Changed',start:'20261005T143000Z'
  },'20261003T130000Z');expect(event(updated).getFirstPropertyValue('uid')).toBe(event(source).getFirstPropertyValue('uid'));expect(event(updated).getFirstPropertyValue('sequence')).toBe(1);expect(event(updated).getFirstPropertyValue('summary')).toBe('Changed');const canceled=cancel(updated,'mailto:owner@example.invalid','20261003T140000Z');expect(event(canceled).getFirstPropertyValue('sequence')).toBe(2);expect(event(canceled).getFirstPropertyValue('status')).toBe('CANCELLED');expect(new ICAL.Component(ICAL.parse(canceled)).getFirstPropertyValue('method')).toBe('CANCEL');expect(()=>cancel(source,'mailto:guest@example.invalid','20261003T140000Z')).toThrow('role');expect(()=>updateInvitation(source,'mailto:guest@example.invalid',
  {
  },'20261003T140000Z')).toThrow('role');
});
test('RSVP retains request sequence and only responding attendee for all participation choices',()=>
{
  for(const state of ['ACCEPTED','TENTATIVE','DECLINED'] as const)
  {
    const response=reply(original(),'mailto:guest@example.invalid',state,'20261003T130000Z');const e=event(response);expect(e.getFirstPropertyValue('sequence')).toBe(0);expect(e.getAllProperties('attendee')).toHaveLength(1);expect(e.getFirstProperty('attendee')!.getParameter('partstat')).toBe(state);expect(e.getFirstPropertyValue('organizer')).toBe('mailto:owner@example.invalid');expect(new ICAL.Component(ICAL.parse(response)).getFirstPropertyValue('method')).toBe('REPLY');
  }
  expect(()=>reply(original(),'mailto:stranger@example.invalid','ACCEPTED','20261003T130000Z')).toThrow('invited');
});
test('scheduling inputs reject invalid dates, interval, header injection and recurring scope',()=>
{
  expect(()=>updateInvitation(original(),'mailto:owner@example.invalid',
  {
    end:'20261005T130000Z'
  },'20261003T130000Z')).toThrow('interval');expect(()=>reply(original(),'mailto:guest@example.invalid\r\nATTENDEE:bad','ACCEPTED','20261003T130000Z')).toThrow();expect(()=>cancel(original(),'mailto:owner@example.invalid','20261003')).toThrow('timestamp');const recurring=original().replace('END:VEVENT','RRULE:FREQ=DAILY\r\nEND:VEVENT');expect(()=>reply(recurring,'mailto:guest@example.invalid','ACCEPTED','20261003T130000Z')).toThrow('Recurring');
});
const xml=(href:string,name:string,extra='')=>`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:displayname>${name}</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>${extra}</d:multistatus>`;
test('owned calendar lifecycle sends MKCALENDAR, PROPPATCH and verifies empty DELETE with genuine DAV XML',async()=>
{
  let name='Experiment',exists=false,nonempty=false,deny=false;const calls:string[]=[];const href='https://fixture.invalid/home/experiment-abcdefgh/';const ops=calendarOperations(
  {
    async request(method,url,options)
    {
      calls.push(method);let status=207,body='';if(method==='MKCALENDAR')
      {
        expect(options?.headers?.['if-none-match']).toBe('*');expect(options?.body).toContain('supported-calendar-component-set');exists=true;status=201;
      }
      else if(method==='PROPPATCH')
      {
        if(deny)status=403;else
        {
          name='Renamed';body=xml(href,name);
        }
      }
      else if(method==='DELETE')
      {
        exists=false;status=204;
      }
      else if(method==='OPTIONS')
      {
        status=200;
      }
      else if(!exists)
      {
        status=404;
      }
      else body=xml(href,name,nonempty?'<d:response><d:href>/home/experiment-abcdefgh/event.ics</d:href><d:status>HTTP/1.1 200 OK</d:status></d:response>':'');return {
        status,body,url,headers:new Headers(
        {
          dav:'1, calendar-access',allow:'OPTIONS, PROPFIND'
        })
      };
    }
  });
  expect(await ops.create('https://fixture.invalid/home/','abcdefgh','Experiment')).toBe(href);expect((await ops.list(href)).length).toBe(1);expect((await ops.inspect(href)).sharingMutation).toBe('unsupported-unverified');await ops.rename(href,'Renamed');deny=true;await expect(ops.rename(href,'Denied')).rejects.toThrow('403');expect(name).toBe('Renamed');nonempty=true;await expect(ops.remove(href)).rejects.toThrow('not verified empty');expect(calls.filter(x=>x==='DELETE')).toHaveLength(0);nonempty=false;await ops.remove(href);expect(exists).toBe(false);await expect(ops.remove(href)).rejects.toThrow('not owned');await expect(ops.rename('https://fixture.invalid/personal/','Oops')).rejects.toThrow('not owned');expect(calls.filter(x=>x==='DELETE')).toHaveLength(1);
});
test('collection creation and property updates fail closed on read-only or partial DAV failures',async()=>
{
  let mode:'create-denied'|'patch-denied'|'create-ok'='create-denied';const href='https://fixture.invalid/home/experiment-abcdefgh/';let calls=0;const ops=calendarOperations(
  {
    async request(method,url)
    {
      calls++;if(method==='MKCALENDAR')return {
        status:mode==='create-denied'?403:201,headers:new Headers(),body:'',url
      };return {
        status:207,headers:new Headers(),url,body:`<d:multistatus xmlns:d="DAV:"><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:displayname/></d:prop><d:status>HTTP/1.1 403 Forbidden</d:status></d:propstat></d:response></d:multistatus>`
      };
    }
  });await expect(ops.create('https://fixture.invalid/home/','abcdefgh','Denied')).rejects.toThrow('403');await expect(ops.remove(href)).rejects.toThrow('not owned');expect(calls).toBe(1);mode='create-ok';await ops.create('https://fixture.invalid/home/','abcdefgh','Owned');mode='patch-denied';await expect(ops.rename(href,'Denied')).rejects.toThrow('property update failed');await expect(ops.remove(href)).rejects.toThrow('not verified empty');
});
test('legacy CalendarServer sharing add, downgrade and revoke XML with capability and ownership gates',()=>
{
  const input=
  {
    dav:'1, calendar-access, calendarserver-sharing',allowedModesXml:`<cs:allowed-sharing-modes xmlns:cs="${CALENDAR_SERVER}"><cs:can-be-shared/></cs:allowed-sharing-modes>`,owner:true,sharee:'mailto:guest@example.invalid'
  };const shares=new Map<string,string>();for(const access of ['read-write','read','remove'] as const)
  {
    const request=sharingChange(
    {
      ...input,access
    });expect(request.mayNotifyRecipient).toBe(true);expect(request.method).toBe('POST');const root=parseXml(request.body);expect(root.name).toBe(`{${CALENDAR_SERVER}}share`);const change=root.children[0]!;const who=content(change.children.find(child=>child.name==='{DAV:}href')!);if(change.name===`{${CALENDAR_SERVER}}remove`)shares.delete(who);else shares.set(who,change.children.some(child=>child.name===`{${CALENDAR_SERVER}}read-write`)?'write':'read');expect(shares.get(input.sharee)).toBe(access==='remove'?undefined:access==='read'?'read':'write');
  }
  expect(()=>sharingChange(
  {
    ...input,owner:false,access:'read'
  })).toThrow('owner');expect(()=>sharingChange(
  {
    ...input,dav:'calendar-access',access:'read'
  })).toThrow('capability');expect(()=>sharingChange(
  {
    ...input,allowedModesXml:`<cs:allowed-sharing-modes xmlns:cs="${CALENDAR_SERVER}"/>`,access:'read'
  })).toThrow('not allowed');
});
