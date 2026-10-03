import ICAL from 'ical.js';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {CalendarError, type CalendarGateway, type CalendarCommand, type CalendarResult, type CalendarEvent, type CalendarCollection, type EventIdentity, type BeforeCalendarDispatch} from '../domain/calendar.js';
import * as codec from '../domain/codec.js';
import {createCalDavClient, DAV, CAL, children, content, escapeXml, parseMultiStatus, DavUntrustedOriginError, type DavRow, type DavResponse} from './caldav-client.js';

const CS = 'http://calendarserver.org/ns/';
const xmlHeaders = {'content-type': 'application/xml; charset=utf-8'};
const property = (props: string) => `<d:propfind xmlns:d="DAV:" xmlns:c="${CAL}" xmlns:cs="${CS}"><d:prop>${props}</d:prop></d:propfind>`;
function check(ok: unknown, code: ConstructorParameters<typeof CalendarError>[0], message: string): asserts ok {if (!ok) throw new CalendarError(code, message);}
function strong(etag: string) {check(/^"[^"\x00-\x20\x7f]*"$/.test(etag), 'conflict', 'A strong ETag is required'); return etag;}
function mailto(value: string) {const address = value.startsWith('mailto:') ? value : `mailto:${value}`; check(/^mailto:[^\s<>:,;]+@[^\s<>:,;]+$/i.test(address), 'invalid_input', 'A single email address is required'); return address;}
function sameAddress(a: string, b: string) {return /^mailto:/i.test(a) && /^mailto:/i.test(b) ? a.toLowerCase() === b.toLowerCase() : a === b;}
function status(res: DavResponse, codes: number[], dispatched = false) {
  if (codes.includes(res.status)) return;
  const code = res.status === 412 ? 'conflict' : res.status === 404 ? 'not_found' : [401,403].includes(res.status) ? 'forbidden' : dispatched && res.status >= 500 ? 'outcome_unknown' : 'provider_error';
  throw new CalendarError(code, `Calendar provider returned HTTP ${res.status}`, dispatched, dispatched && res.status >= 400 && res.status < 500);
}
function utcWindow(start: string, end: string) {
  const parse = (value: string) => {check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(value) && Number.isFinite(Date.parse(value)), 'invalid_input', 'UTC ISO timestamps required'); return Date.parse(value);};
  const a = parse(start), b = parse(end); check(b > a && b - a <= 366 * 86400000, 'invalid_input', 'Finite interval of at most 366 days required');
  return {start: new Date(a).toISOString().replace(/[-:]/g,'').replace('.000',''), end: new Date(b).toISOString().replace(/[-:]/g,'').replace('.000','')};
}
export type ICloudCalendarOptions = {credential: {user: string; appPassword: string}; allowedOrigins?: string[]; fetch?: typeof fetch; timeoutMs?: number};
/** Credentials only reach HTTPS iCloud CalDAV hosts; redirects are never followed. */
export function createICloudCalendarGateway(options: ICloudCalendarOptions): CalendarGateway {
  const dispatchContext = new AsyncLocalStorage<BeforeCalendarDispatch | undefined>();
  const beforeRead = () => dispatchContext.getStore()?.({scheduled:false, mutation:false});
  const allowed = new Set(['https://caldav.icloud.com']);
  function approve(origin: string) {const u = new URL(origin); check(u.origin === origin && u.protocol === 'https:' && !u.port && /^(?:caldav|p\d+-caldav)\.icloud\.com$/.test(u.hostname), 'forbidden', 'Untrusted iCloud CalDAV origin'); allowed.add(origin);}
  for (const origin of options.allowedOrigins ?? []) approve(origin);
  const authorization = `Basic ${Buffer.from(`${options.credential.user}:${options.credential.appPassword}`).toString('base64')}`;
  let client = createCalDavClient({baseUrl: 'https://caldav.icloud.com/', authorization, allowedOrigins: [...allowed], fetch: options.fetch, timeoutMs: options.timeoutMs, beforeRead});
  let discovered: {principal: string; home: string; calendars: DavRow[]; actorPrincipal: string; addresses: string[]} | undefined;
  async function discover() {
    // Only authenticated discovery may add an Apple shard. Never accept a caller-supplied href here.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const result = await client.discover();
        const origin = new URL(result.home).origin;
        const rows = await client.propfind(`${origin}/`, '<d:current-user-principal/>');
        const principal = hrefProperty(rows[0], `{${DAV}}current-user-principal`, `${origin}/`);
        check(!!principal && new URL(principal).origin === origin, 'forbidden', 'Missing authenticated shard principal witness');
        const owner = await client.propfind(principal, '<c:calendar-home-set/><c:calendar-user-address-set/>');
        check(hrefProperty(owner[0], `{${CAL}}calendar-home-set`, principal) === result.home, 'forbidden', 'Calendar home identity witness mismatch');
        const addresses = owner[0]?.nodes[`{${CAL}}calendar-user-address-set`]?.children.filter(n => n.name === `{${DAV}}href`).map(content) ?? [];
        check(addresses.some(a => sameAddress(a, mailto(options.credential.user))), 'forbidden', 'Account calendar address is unverified');
        discovered = {...result, actorPrincipal: principal, addresses};
        return discovered;
      } catch (error) {
        if (!(error instanceof DavUntrustedOriginError)) throw error;
        approve(error.origin);
        client = createCalDavClient({baseUrl: 'https://caldav.icloud.com/', authorization, allowedOrigins: [...allowed], fetch: options.fetch, timeoutMs: options.timeoutMs, beforeRead});
      }
    }
    throw new CalendarError('forbidden', 'Calendar discovery exceeded origin budget');
  }
  function hrefProperty(row: DavRow | undefined, name: string, base: string) {
    const nodes = row?.nodes[name]?.children; if (!nodes || nodes.length !== 1 || nodes[0]!.name !== `{${DAV}}href`) return undefined;
    return client.resolve(content(nodes[0]!), base).href;
  }
  async function context() {return discovered ?? discover();}
  async function collection(href: string) {
    const ctx = await context(); const u = client.resolve(href, ctx.home); const base = new URL(ctx.home);
    check(u.origin === base.origin && u.pathname.startsWith(base.pathname) && u.pathname !== base.pathname && u.pathname.endsWith('/') && !decodeURIComponent(u.pathname.slice(base.pathname.length,-1)).match(/[\/\\\x00-\x1f]/), 'forbidden', 'Calendar is outside authenticated home');
    return u.href;
  }
  async function resource(href: string, calendarHref: string) {
    const parent = await collection(calendarHref), u = client.resolve(href, parent), p = new URL(parent);
    check(u.origin === p.origin && u.pathname.startsWith(p.pathname) && u.pathname.length > p.pathname.length && !/[\/\\\x00-\x1f]/.test(decodeURIComponent(u.pathname.slice(p.pathname.length))), 'forbidden', 'Event is outside calendar');
    return {href: u.href, calendarHref: parent};
  }
  async function metadata(href: string) {
    const rows = await client.propfind(await collection(href), '<d:displayname/><d:getetag/><d:resourcetype/><d:owner/><d:current-user-privilege-set/><cs:allowed-sharing-modes xmlns:cs="http://calendarserver.org/ns/"/><cs:invite xmlns:cs="http://calendarserver.org/ns/"/>');
    check(rows.length === 1 && client.resolve(rows[0]!.href, href).href === href && (!rows[0]!.status || rows[0]!.status===200), 'provider_error', 'Ambiguous collection metadata');
    return rows[0]!;
  }
  async function assertOwner(row: DavRow, href: string) {
    const ctx = await context(); check(hrefProperty(row, `{${DAV}}owner`, href) === ctx.actorPrincipal, 'forbidden', 'Calendar owner is not authenticated account');
  }
  function privilege(row: DavRow, names: string[]) {
    const node=row.nodes[`{${DAV}}current-user-privilege-set`];
    check(node && node.children.some(n=>n.name===`{${DAV}}privilege` && n.children.some(p=>['all','write',...names].some(name=>p.name===`{${DAV}}${name}`))),'forbidden','Required calendar privilege is not granted');
  }
  function event(data: string, identity: Omit<EventIdentity,'uid'>): CalendarEvent {
    const cal = new ICAL.Component(ICAL.parse(data)); const events = cal.getAllSubcomponents('vevent');
    check(cal.name === 'vcalendar' && !cal.hasProperty('method') && events.length > 0, 'unsupported', 'Unsupported stored calendar object');
    const uid = String(events[0]!.getFirstPropertyValue('uid') ?? ''); check(uid && events.every(e => e.getAllProperties('uid').length===1 && e.getFirstPropertyValue('uid') === uid), 'unsupported', 'Calendar object has mixed identities');
    return {...identity, uid, ical: data, summary: String(events.find(e=>!e.hasProperty('recurrence-id'))?.getFirstPropertyValue('summary') ?? ''), scheduled: scheduledComponent(cal)};
  }
  function scheduledComponent(component: ICAL.Component): boolean {return component.hasProperty('organizer') || component.hasProperty('attendee') || component.getAllSubcomponents().some(scheduledComponent);}
  async function read(calendarHref: string, href: string) {
    const id = await resource(href, calendarHref), res = await client.request('GET', id.href); status(res,[200]);
    return event(res.body, {...id, etag: strong(res.headers.get('etag') ?? ''), ...(res.headers.get('schedule-tag') ? {scheduleTag: strong(res.headers.get('schedule-tag')!)} : {})});
  }
  async function original(identity: EventIdentity) {
    strong(identity.etag); const actual = await read(identity.calendarHref, identity.href);
    check(actual.uid === identity.uid && actual.etag === identity.etag && actual.scheduleTag === identity.scheduleTag, 'conflict', 'Event revision or scheduling revision changed'); return actual;
  }
  async function mutate(method: string, href: string, body: string | undefined, headers: Record<string,string>, guard: BeforeCalendarDispatch | undefined, scheduled = false) {
    if(scheduled) {const capability=await client.request('OPTIONS',new URL('.',href).href);status(capability,[200,204]);check((capability.headers.get('dav')??'').split(',').map(s=>s.trim()).includes('calendar-auto-schedule'),'unsupported','Automatic scheduling unavailable');}
    guard?.({scheduled,mutation:true});
    try {const res = await client.request(method, href, {headers, body}); status(res, method === 'MKCALENDAR' ? [201] : method === 'PROPPATCH' ? [207] : [200,201,204], true); return res;}
    catch (error) {if (error instanceof CalendarError) throw error; throw new CalendarError('outcome_unknown', 'Calendar write outcome unknown; reconcile before retry', true);}
  }
  const revisionHeaders = (e: EventIdentity) => ({'if-match': strong(e.etag), ...(e.scheduleTag ? {'if-schedule-tag-match': e.scheduleTag} : {})});
  function organizer(actual: CalendarEvent, addresses: string[]) {
    const cal = new ICAL.Component(ICAL.parse(actual.ical)); check(cal.getAllSubcomponents().every(c=>['vevent','vtimezone'].includes(c.name)), 'unsupported', 'Unsupported scheduled components'); const organizers = cal.getAllSubcomponents('vevent').map(e=>String(e.getFirstPropertyValue('organizer')??''));
    check(cal.getAllSubcomponents('vevent').every(e=>e.getAllProperties('organizer').length===1 && (!e.getFirstProperty('organizer')!.getParameter('email') || addresses.some(a=>sameAddress(a,mailto(String(e.getFirstProperty('organizer')!.getParameter('email'))))))),'forbidden','Ambiguous scheduling organizer');
    check(organizers.every(a=>addresses.some(b=>sameAddress(a,b))), 'forbidden', 'Only verified organizer may modify this scheduled event');
  }
  async function rowsToEvents(href: string, rows: DavRow[]) {
    check(rows.length <= 500, 'unsupported', 'Calendar query exceeds resource limit'); const seen = new Set<string>();
    return Promise.all(rows.map(async row => {check(!row.errors.length && (!row.status || row.status===200), 'provider_error', 'Partial calendar query'); const id = await resource(row.href,href); check(!seen.has(id.href),'provider_error','Duplicate calendar query resource');seen.add(id.href); const etag = strong(row.props[`{${DAV}}getetag`] ?? ''); const data = row.props[`{${CAL}}calendar-data`]; check(data !== undefined,'provider_error','Incomplete calendar query'); return event(data,{...id,etag});}));
  }
  function sharingMembers(row: DavRow, addresses: string[]) {
    const invite=row.nodes[`{${CS}}invite`];
    check(Object.entries(row.propertyStatus).every(([name,value])=>value>=200&&value<300 || value===404 && [`{${CS}}invite`,`{${DAV}}getetag`].includes(name)),'provider_error','Incomplete sharing metadata');
    if(!invite)return undefined;
    check(!invite.text.trim() && invite.children.every(n=>[`{${CS}}user`,`{${CS}}organizer`].includes(n.name)),'unsupported','Unknown sharing entry');
    const organizers=children(invite,`{${CS}}organizer`);check(organizers.length<=1,'unsupported','Ambiguous sharing organizer');
    for(const organizer of organizers){const hrefs=children(organizer,`{${DAV}}href`);check(hrefs.length===1,'unsupported','Ambiguous sharing organizer');const raw=content(hrefs[0]!);const value=/^[^\s<>:,;]+@[^\s<>:,;]+$/.test(raw)?`mailto:${raw}`:raw;check(addresses.some(a=>sameAddress(a,value)),'forbidden','Unverified sharing organizer');}
    const seen=new Set<string>();
    return children(invite,`{${CS}}user`).map(user=>{
      const hrefs=children(user,`{${DAV}}href`),accesses=children(user,`{${CS}}access`),states=user.children.filter(n=>[`{${CS}}invite-noresponse`,`{${CS}}invite-accepted`,`{${CS}}invite-declined`,`{${CS}}invite-invalid`].includes(n.name));
      check(hrefs.length===1 && /^mailto:/i.test(content(hrefs[0]!)) && accesses.length===1 && accesses[0]!.children.length===1 && states.length===1,'unsupported','Ambiguous sharing member');
      check([`{${CS}}read`,`{${CS}}read-write`].includes(accesses[0]!.children[0]!.name),'unsupported','Untrusted sharing access namespace');const address=mailto(content(hrefs[0]!)),access=accesses[0]!.children[0]!.name.slice(CS.length+2);check(['read','read-write'].includes(access),'unsupported','Unknown sharing access');check(!seen.has(address.toLowerCase()),'unsupported','Duplicate sharing member');seen.add(address.toLowerCase());return {address,access,status:states[0]!.name.slice(CS.length+2)};
    });
  }
  async function execute(command: CalendarCommand, guard?: BeforeCalendarDispatch): Promise<CalendarResult> {
    try {
      const ctx = await context(); const operation = command.operation;
      if (operation === 'list_calendars') {
        const fresh = await discover(); const calendars: CalendarCollection[] = [];
        for (const row of fresh.calendars) {const href = await collection(row.href); const m = await metadata(href); calendars.push({href,name:m.props[`{${DAV}}displayname`] ?? '', ...(m.props[`{${DAV}}getetag`] ? {etag:m.props[`{${DAV}}getetag`]} : {})});}
        return {operation,calendars};
      }
      if (operation === 'create_calendar') {
        check(command.name.length > 0 && command.name.length <= 256,'invalid_input','Calendar name must have 1..256 characters');
        const collectionId = command.collectionId ?? randomUUID(); check(/^[a-zA-Z0-9-]{8,80}$/.test(collectionId),'invalid_input','Invalid collection identity');
        const href = new URL(`calendar-${collectionId}/`,ctx.home).href;
        await mutate('MKCALENDAR',href,`<c:mkcalendar xmlns:d="DAV:" xmlns:c="${CAL}"><d:set><d:prop><d:displayname>${escapeXml(command.name)}</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`,{...xmlHeaders,'if-none-match':'*'},guard);
        return {operation,calendar:{href,name:command.name}};
      }
      if (operation === 'update_calendar' || operation === 'delete_calendar') {
        const href = await collection(command.calendarHref), row = await metadata(href); await assertOwner(row,href);
        check(row.props[`{${DAV}}getetag`] === strong(command.etag),'conflict','Calendar revision changed or unavailable');
        if (operation === 'delete_calendar') {const parentRows=await client.propfind(ctx.home,'<d:current-user-privilege-set/>');check(parentRows.length===1 && client.resolve(parentRows[0]!.href,ctx.home).href===ctx.home,'provider_error','Parent privilege identity unavailable');privilege(parentRows[0]!,['unbind']);check(command.confirmDeleteAllEvents === true,'invalid_input','Explicit destructive collection confirmation required'); await mutate('DELETE',href,undefined,{'if-match':command.etag},guard,true);return {operation,deleted:true,concurrency:'preflight-only'};}
        privilege(row,['write-properties']);
        check(command.name.length>0 && command.name.length<=256,'invalid_input','Invalid calendar name');
        const res = await mutate('PROPPATCH',href,`<d:propertyupdate xmlns:d="DAV:"><d:set><d:prop><d:displayname>${escapeXml(command.name)}</d:displayname></d:prop></d:set></d:propertyupdate>`,{...xmlHeaders,'if-match':command.etag},guard);
        try {
          const patched = parseMultiStatus(res.body); check(patched.length===1 && client.resolve(patched[0]!.href,href).href===href && !patched[0]!.errors.length && patched[0]!.props[`{${DAV}}displayname`]!==undefined,'provider_error','Calendar rename not confirmed');
          const actual=await metadata(href);check(actual.props[`{${DAV}}displayname`]===command.name,'provider_error','Calendar rename readback mismatch');
          return {operation,concurrency:'preflight-only',calendar:{href,name:actual.props[`{${DAV}}displayname`]!,...(actual.props[`{${DAV}}getetag`]?{etag:actual.props[`{${DAV}}getetag`]}:{})}};
        }catch{throw new CalendarError('outcome_unknown','Calendar rename submitted but readback failed',true);}
      }
      if (operation === 'get_event') return {operation,event:await read(command.calendarHref,command.href)};
      if (operation === 'query_events' || operation === 'availability') {
        const href = await collection(command.calendarHref), window = utcWindow(command.start,command.end), events = await rowsToEvents(href,await client.query(href,window.start,window.end));
        if (operation === 'availability') return {operation,busy:events.flatMap(e=>codec.expand(e.ical,{start:command.start,end:command.end},command.timePolicy).filter(o=>o.busy).map(o=>({start:o.start,end:o.end})))};
        return {operation,events: command.text ? events.filter(e=>e.summary.toLocaleLowerCase().includes(command.text!.toLocaleLowerCase())) : events};
      }
      if (operation === 'sync') return {operation,snapshot:await client.sync(await collection(command.calendarHref),command.previous)};
      if (operation === 'create_event' || operation === 'invite') {
        const href = await collection(command.calendarHref), uid = command.uid ?? randomUUID(); check(uid.length>0 && uid.length<=255 && !/[\/\\\x00-\x1f\x7f]/.test(uid),'invalid_input','Invalid event UID');
        let data = codec.createEvent(uid,command.fields,command.recurrence,command.timezone,command.timePolicy);
        if (operation === 'invite') {check(command.attendees.length>0 && command.attendees.length<=100,'unsupported','Invitation requires 1..100 attendees'); const cal = new ICAL.Component(ICAL.parse(data)), e = cal.getFirstSubcomponent('vevent')!;e.addPropertyWithValue('organizer',mailto(options.credential.user)); for(const address of new Set(command.attendees.map(mailto))) {const p = new ICAL.Property('attendee');p.setValue(address);p.setParameter('partstat','NEEDS-ACTION');p.setParameter('rsvp','TRUE');e.addProperty(p);}data=cal.toString();}
        const eventHref = (await resource(new URL(`${encodeURIComponent(uid)}.ics`,href).href,href)).href;
        await mutate('PUT',eventHref,data,{'content-type':'text/calendar; charset=utf-8','if-none-match':'*'},guard,operation==='invite');
        try {return {operation,event:await read(href,eventHref)};} catch {throw new CalendarError('outcome_unknown',`Event stored but readback failed; reconcile ${eventHref}`,true);}
      }
      if (operation === 'update_event' || operation === 'delete_event' || operation === 'respond') {
        const actual = await original(command.identity); let data: string | undefined;
        if (operation === 'respond') {
          check(['ACCEPTED','TENTATIVE','DECLINED'].includes(command.participation),'invalid_input','Invalid participation');const cal=new ICAL.Component(ICAL.parse(actual.ical)), events=cal.getAllSubcomponents('vevent').filter(e=>!e.hasProperty('recurrence-id'));check(events.length===1,'unsupported','RSVP requires one series master');const e=events[0]!;check(e.hasProperty('organizer'),'unsupported','Scheduling organizer absent');const attendees=e.getAllProperties('attendee').filter(p=>ctx.addresses.some(a=>sameAddress(a,String(p.getFirstValue()))));check(attendees.length===1,'forbidden','Authenticated attendee is ambiguous or absent');attendees[0]!.setParameter('partstat',command.participation);attendees[0]!.removeParameter('rsvp');e.updatePropertyWithValue('dtstamp',ICAL.Time.fromJSDate(new Date(),true));data=cal.toString();
        } else {
          if(actual.scheduled) organizer(actual,ctx.addresses);
          if(operation==='update_event') {data=actual.scheduled?(command.recurrenceId?codec.editScheduledOccurrence(actual.ical,command.recurrenceId,command.fields,command.timePolicy):codec.editScheduledSeries(actual.ical,command.fields,command.timePolicy)):command.recurrenceId?codec.editOccurrence(actual.ical,command.recurrenceId,command.fields,command.timePolicy):codec.editSeries(actual.ical,command.fields,command.timePolicy);}
          else if(command.recurrenceId) {data=actual.scheduled?codec.editScheduledOccurrence(actual.ical,command.recurrenceId,{status:'CANCELLED'},command.timePolicy):codec.cancelOccurrence(actual.ical,command.recurrenceId,command.timePolicy);}
        }
        await mutate(data===undefined?'DELETE':'PUT',actual.href,data,{'content-type':'text/calendar; charset=utf-8',...revisionHeaders(actual)},guard,actual.scheduled);
        if(data===undefined)return {operation,deleted:true};
        try{return {operation,event:await read(actual.calendarHref,actual.href)};}catch{throw new CalendarError('outcome_unknown','Event mutation stored but readback failed',true);}
      }
      if (operation === 'inspect_sharing' || operation === 'share') {
        const href = await collection(command.calendarHref), row = await metadata(href); await assertOwner(row,href);
        const modes = row.nodes[`{${CS}}allowed-sharing-modes`];
        const opts=await client.request('OPTIONS',href);status(opts,[200,204]);
        const capability=!!modes?.children.some(n=>n.name===`{${CS}}can-be-shared`) && (opts.headers.get('dav')??'').split(',').map(s=>s.trim()).includes('calendarserver-sharing');
        let members=sharingMembers(row,ctx.addresses);
        if(!members && capability && row.propertyStatus[`{${CS}}invite`]===404 && operation==='share' && command.access!=='remove') {
          const types=row.nodes[`{${DAV}}resourcetype`]?.children ?? [];
          // Explicit target sharing is authorized independently of event contents. This exact
          // iCloud unshared representation permits set only; it never proves privacy or emptiness.
          if(types.length===2 && types.some(n=>n.name===`{${DAV}}collection`) && types.some(n=>n.name===`{${CAL}}calendar`)) members=[];
        }
        const supported=capability && members!==undefined;
        if(operation==='inspect_sharing')return {operation,sharing:{supported,members:members??[],...(!supported?{reason:'Provider sharing roster or capability unavailable'}:{})}};
        check(supported,'unsupported','Provider sharing roster unavailable; no invitation sent');
        const address = mailto(command.sharee);check(['read','read-write','remove'].includes(command.access),'invalid_input','Invalid share access');
        const change=command.access==='remove'?`<cs:remove><d:href>${escapeXml(address)}</d:href></cs:remove>`:`<cs:set><d:href>${escapeXml(address)}</d:href><cs:summary>${escapeXml(row.props[`{${DAV}}displayname`]??'Calendar')}</cs:summary><cs:${command.access}/></cs:set>`;
        await mutate('POST',href,`<cs:share xmlns:d="DAV:" xmlns:cs="${CS}">${change}</cs:share>`,xmlHeaders,guard);
        try {
          const after=await metadata(href);await assertOwner(after,href);let observed=sharingMembers(after,ctx.addresses);
          const types=after.nodes[`{${DAV}}resourcetype`]?.children??[];
          if(command.access==='remove' && !observed && after.propertyStatus[`{${CS}}invite`]===404 && types.length===2 && types.some(n=>n.name===`{${DAV}}collection`) && types.some(n=>n.name===`{${CAL}}calendar`)) observed=[];
          check(observed,'outcome_unknown','Sharing result unavailable after submission');
          const target=observed.find(m=>sameAddress(m.address,address));
          check(command.access==='remove'?!target:target?.access===command.access,'outcome_unknown','Sharing result did not match requested access');
          for(const prior of members??[]) if(!sameAddress(prior.address,address)) check(observed.some(m=>sameAddress(m.address,prior.address) && m.access===prior.access),'outcome_unknown','Unrelated sharing membership changed');
          return {operation,sharing:{supported:true,members:observed,reason:'Provider state verified; recipient acceptance is reported separately'}};
        } catch {throw new CalendarError('outcome_unknown','Share submitted but resulting provider state could not be verified',true);}
      }
      throw new CalendarError('unsupported','Unsupported calendar command');
    } catch(error) {if(error instanceof CalendarError)throw error;throw new CalendarError('provider_error','Calendar provider operation failed');}
  }
  return {execute:(command,guard)=>dispatchContext.run(guard,()=>execute(command,guard))};
}
