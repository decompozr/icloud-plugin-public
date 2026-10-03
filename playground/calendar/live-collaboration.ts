import ICAL from 'ical.js';
import {randomUUID} from 'node:crypto';
import {lstatSync, readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createCalDavClient, escapeXml, DAV, CAL, type DavRow, type XmlNode} from './caldav-client';
import {calendarSafety as safe, type Manifest, type LifecycleClient, LifecycleError} from './live-lifecycle';
import {readOwnerCredential, validateDiagnostic, type Credential, type DiagnosticOptions} from './live-diagnostic';
import {invitation, sharingChange, CALENDAR_SERVER as CS} from './calendar-operations';

const RECIPIENT = 'mailto:chuhsinheng@gmail.com', SENDER = 'mailto:Scottchu@icloud.com';
export type CollaborationOptions = DiagnosticOptions & {account: string; confirmCollaboration: boolean; kind: 'invitation' | 'read-only-share'; eventStart: string; eventEnd: string};
type Ledger = Manifest & {collaboration: {kind: CollaborationOptions['kind']; recipient: string; organizer: string; subject: string; start: string; end: string; scheduleTag: string | null; sharePosted: boolean; organizerAliases?: string[]; observedOrganizer?: string}};
const check = (ok: unknown, code: string): asserts ok => {if (!ok) throw new LifecycleError(code);};
const strong = (etag: string | null): etag is string => !!etag && /^"[^"\x00-\x20\x7f]*"$/.test(etag);
const xml = (props: string) => `<d:propfind xmlns:d="DAV:" xmlns:c="${CAL}" xmlns:cs="${CS}"><d:prop>${props}</d:prop></d:propfind>`;
const metadata = '<d:displayname/><d:resourcetype/><d:owner/><d:acl/><d:getetag/><c:calendar-description/><cs:invite/><cs:allowed-sharing-modes/>';
const serialize = (node: XmlNode): string => {const end = node.name.indexOf('}'), namespace = node.name.slice(1, end), local = node.name.slice(end + 1); return `<n:${local} xmlns:n="${escapeXml(namespace)}">${escapeXml(node.text)}${node.children.map(serialize).join('')}</n:${local}>`;};
function validate(options: CollaborationOptions) {
  validateDiagnostic(options); check(options.confirmCollaboration === true && `mailto:${options.account}`.toLowerCase() === SENDER.toLowerCase(), 'COLLABORATION_ACCOUNT_CONFIRMATION_REQUIRED');
  check(['invitation', 'read-only-share'].includes(options.kind), 'INVALID_COLLABORATION_KIND');
}
function readLedger(path: string, options: CollaborationOptions) {
  for (const [entry, directory] of [[path, false], [dirname(path), true]] as const) {const st = lstatSync(entry); check(!st.isSymbolicLink() && (directory ? st.isDirectory() : st.isFile()) && st.uid === process.getuid?.() && !(st.mode & 0o077), 'UNTRUSTED_LEDGER_CUSTODY');}
  const m = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
  check(m.version === 1 && /^[0-9a-f-]{36}$/.test(m.run) && m.account.toLowerCase() === options.account.toLowerCase() && m.collaboration?.recipient === RECIPIENT && m.collaboration.organizer === SENDER && m.collaboration.kind === options.kind, 'COLLABORATION_LEDGER_MISMATCH');
  check(m.marker === `icloud-plugin experiment ${m.run}` && m.href === new URL(`experiment-${m.run}/`, m.home).href && [m.href, m.home, m.principal].every(h => options.origins.includes(new URL(h).origin)), 'COLLABORATION_LEDGER_TARGET_MISMATCH');
  check(m.resources.length <= 1 && m.resources.every(r => r.href === new URL(`${r.uid}.ics`, m.href).href && r.uid === m.run), 'COLLABORATION_RESOURCE_MISMATCH'); return m;
}
function identity(row: DavRow, m: Ledger) {
  check(row.href === m.href && row.props[`{${CAL}}calendar-description`] === m.marker, 'COLLABORATION_MARKER_MISMATCH');
  const owner = row.nodes[`{${DAV}}owner`]?.children;
  check(owner?.length === 1 && owner[0]!.name === `{${DAV}}href` && safe.canonical(owner[0]!.text, m.href) === m.ownerPrincipal, 'COLLABORATION_OWNER_MISMATCH');
  const types = row.nodes[`{${DAV}}resourcetype`]?.children ?? [];
  check(types.some(n => n.name === `{${CAL}}calendar`) && types.every(n => [`{${DAV}}collection`, `{${CAL}}calendar`, `{${CS}}shared-owner`].includes(n.name)), 'COLLABORATION_UNKNOWN_COLLECTION_TYPE');
}
function sharingState(row: DavRow, ledger: Ledger, allowUnshared404 = false) {
  const invite = row.nodes[`{${CS}}invite`]; if (!invite) {
    const types = row.nodes[`{${DAV}}resourcetype`]?.children ?? [];
    if (allowUnshared404 && row.propertyStatus[`{${CS}}invite`] === 404 && ledger.created201 && (!ledger.pending || ledger.pending === 'revoke-read-only-share') && types.length === 2 && types.some(n => n.name === `{${DAV}}collection`) && types.some(n => n.name === `{${CAL}}calendar`))
      return {available: true, recipientPresent: false, status: 'unshared-property-absent'};
    return {available: false, recipientPresent: false, status: 'unavailable'};
  }
  check(!invite.text.trim() && invite.children.every(n => [`{${CS}}user`, `{${CS}}organizer`].includes(n.name)), 'UNKNOWN_SHARING_ENTRY');
  const organizers = invite.children.filter(n => n.name === `{${CS}}organizer`);
  check(organizers.length <= 1, 'AMBIGUOUS_SHARE_ORGANIZER');
  for (const organizer of organizers) {
    const hrefs = organizer.children.filter(n => n.name === `{${DAV}}href`);
    const raw = hrefs[0]?.text ?? '', address = /^[^\s@:<>]+@[^\s@:<>]+$/.test(raw) ? `mailto:${raw}` : raw;
    check(hrefs.length === 1 && (ledger.collaboration.organizerAliases ?? []).some(alias => alias.startsWith('mailto:') ? alias.toLowerCase() === address.toLowerCase() : alias === address), 'UNVERIFIED_SHARE_ORGANIZER');
  }
  const users = invite.children.filter(n => n.name === `{${CS}}user`);
  check(users.length <= 1, 'UNEXPECTED_SHAREE');
  for (const user of users) {
    const hrefs = user.children.filter(n => n.name === `{${DAV}}href`); check(hrefs.length === 1 && hrefs[0]!.text.toLowerCase() === RECIPIENT.toLowerCase(), 'UNEXPECTED_SHAREE');
    const accesses = user.children.filter(n => n.name === `{${CS}}access`); check(accesses.length === 1, 'AMBIGUOUS_SHARE_ACCESS'); const access = accesses[0]; check(access?.children.length === 1 && access.children[0]!.name === `{${CS}}read`, 'SHARE_ACCESS_NOT_READ_ONLY');
    const states = user.children.filter(n => [`{${CS}}invite-noresponse`, `{${CS}}invite-accepted`, `{${CS}}invite-declined`, `{${CS}}invite-invalid`].includes(n.name)); check(states.length === 1, 'UNKNOWN_SHARE_STATUS');
    return {available: true, recipientPresent: true, status: states[0]!.name.slice(states[0]!.name.indexOf('}') + 1)};
  }
  return {available: true, recipientPresent: false, status: 'absent'};
}
function eventState(text: string, m: Ledger) {
  const cal = new ICAL.Component(ICAL.parse(text)), events = cal.getAllSubcomponents('vevent');
  check(cal.name === 'vcalendar' && !cal.hasProperty('method') && events.length === 1 && cal.getAllSubcomponents().length === 1, 'UNEXPECTED_SCHEDULING_COMPONENT');
  const e = events[0]!;
  check(['uid', 'organizer', 'dtstart', 'dtend', 'summary'].every(name => e.getAllProperties(name).length === 1), 'AMBIGUOUS_SCHEDULING_IDENTITY');
  const attendees = e.getAllProperties('attendee'), event = new ICAL.Event(e);
  const organizer = String(e.getFirstPropertyValue('organizer')), aliases = m.collaboration.organizerAliases ?? [];
  const matches = (left: string, right: string) => left.toLowerCase().startsWith('mailto:') && right.toLowerCase().startsWith('mailto:') ? left.toLowerCase() === right.toLowerCase() : left === right;
  const organizerEmail = e.getFirstProperty('organizer')!.getParameter('email');
  check(aliases.some(a => matches(a, SENDER)) && aliases.some(a => matches(a, organizer)) && (!organizerEmail || (typeof organizerEmail === 'string' && aliases.some(a => matches(a, `mailto:${organizerEmail}`)))), 'UNVERIFIED_ORGANIZER_ALIAS');
  check(event.uid === m.run && attendees.length === 1 && String(attendees[0]!.getFirstValue()).toLowerCase() === RECIPIENT.toLowerCase(), 'SCHEDULING_IDENTITY_MISMATCH');
  check(!e.hasProperty('rrule') && !e.hasProperty('recurrence-id') && !e.getAllSubcomponents().length && event.summary === m.collaboration.subject && event.startDate.toString() === m.collaboration.start && event.endDate.toString() === m.collaboration.end, 'SCHEDULING_EVENT_CHANGED');
  return {observedOrganizer: organizer, organizerAliasUsed: organizer !== SENDER, partstat: attendees[0]!.getParameter('partstat') ?? 'NEEDS-ACTION', scheduleStatus: attendees[0]!.getParameter('schedule-status') ?? null};
}
/** start may notify; inspect is read-only; cleanup is a separate explicit invocation that may notify cancellation/revocation. */
export async function runCollaboration(phase: 'start' | 'inspect' | 'reconcile' | 'cleanup', options: CollaborationOptions, manifestPath?: string,
  factory?: (credential: Credential, origins: string[]) => LifecycleClient, loader: (options: DiagnosticOptions) => Credential | Promise<Credential> = readOwnerCredential) {
  validate(options); check(['start', 'inspect', 'reconcile', 'cleanup'].includes(phase), 'INVALID_PHASE');
  check(phase === 'start' ? !manifestPath : !!manifestPath, 'EXACT_PHASE_LEDGER_REQUIRED');
  let credential: Credential | undefined, m: Ledger | undefined, journal: ReturnType<typeof safe.privateJournal> | undefined;
  try {
    credential = await loader(options); check(credential.user.toLowerCase() === options.account.toLowerCase() && !/[:\r\n]/.test(credential.user) && !/[\r\n]/.test(credential.appPassword), 'ACCOUNT_MISMATCH');
    const client = factory ? factory(credential, options.origins) : createCalDavClient({baseUrl: options.origins[0] + '/', allowedOrigins: options.origins, authorization: `Basic ${Buffer.from(`${credential.user}:${credential.appPassword}`).toString('base64')}`});
    const discovery = await client.discover();
    if (phase === 'start') {
      const from = Date.parse(options.eventStart), to = Date.parse(options.eventEnd);
      check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(options.eventStart) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(options.eventEnd) && from > Date.now() + 3600000 && from < Date.now() + 30 * 86400000 && to > from && to - from <= 3600000, 'BOUNDED_FUTURE_EVENT_REQUIRED');
      const run = randomUUID(), home = safe.canonical(discovery.home, options.origins[0]);
      m = {version: 1, run, account: options.account, principal: safe.canonical(discovery.principal, home), home, href: new URL(`experiment-${run}/`, home).href, marker: `icloud-plugin experiment ${run}`, created201: false, privacyEvidence: [], state: 'prepared', pending: null, resources: [], collaboration: {kind: options.kind, recipient: RECIPIENT, organizer: SENDER, subject: options.kind === 'invitation' ? `iCloud Plugin invitation test ${run.slice(0, 8)}` : `iCloud Plugin sharing test ${run.slice(0, 8)}`, start: options.eventStart, end: options.eventEnd, scheduleTag: null, sharePosted: false}};
      journal = safe.privateJournal(m);
    } else {
      m = readLedger(manifestPath!, options);
      check(safe.canonical(discovery.home, m.home) === m.home && safe.canonical(discovery.principal, m.home) === m.principal && m.created201, 'COLLABORATION_DISCOVERY_CHANGED');
      if (phase === 'reconcile') {check((m.collaboration.kind === 'invitation' && m.pending === 'create-invitation-auto-schedule' && m.resources.length === 1 && m.resources[0]!.etag === null && !m.resources[0]!.deleted) || (m.collaboration.kind === 'read-only-share' && m.pending === 'invite-read-only-share' && m.collaboration.sharePosted && m.resources.length === 0), 'COLLABORATION_RECONCILE_NOT_READY'); journal = safe.privateJournal(m, manifestPath);}
      if (phase === 'cleanup') {check(m.pending === null && ['awaiting-recipient', 'sharing-unavailable'].includes(m.state), 'COLLABORATION_CLEANUP_NOT_READY'); journal = safe.privateJournal(m, manifestPath);}
    }
    const ledger = m;
    const requestMetadata = async (depth: '0' | '1') => {
      const res = await client.request('PROPFIND', ledger.href, {headers: {depth, 'content-type': 'application/xml'}, body: xml(metadata)}); check(res.status === 207, 'COLLABORATION_METADATA_FAILED');
      const rows = safe.verifiedRows(res.body, ledger.href), own = rows.find(r => r.href === ledger.href); check(own, 'COLLABORATION_COLLECTION_MISSING'); identity(own, ledger); return {rows, own};
    };
    const mutate = async (name: string, method: string, href: string, init: {headers?: Record<string,string>; body?: string} = {}) => {ledger.pending = name; journal!.save(); return client.request(method, href, init);};
    const settle = (state: string) => {ledger.state = state; ledger.pending = null; journal!.save();};
    const verifyAddresses = async () => {
      const principal = await client.request('PROPFIND', ledger.principal, {headers: {depth: '0', 'content-type': 'application/xml'}, body: xml('<c:calendar-user-address-set/>')});
      check(principal.status === 207, 'SENDER_ADDRESS_UNVERIFIED'); const addresses = safe.verifiedRows(principal.body, ledger.principal);
      check(addresses.length === 1 && addresses[0]!.href === ledger.principal, 'SENDER_ADDRESS_UNVERIFIED');
      const values = addresses[0]!.nodes[`{${CAL}}calendar-user-address-set`]?.children.filter(n => n.name === `{${DAV}}href`).map(n => n.text) ?? [];
      check(values.some(value => value.toLowerCase() === SENDER.toLowerCase()), 'SENDER_ADDRESS_UNVERIFIED'); ledger.collaboration.organizerAliases = values;
    };
    if (phase === 'start') {
      await verifyAddresses();
      check((await client.request('PROPFIND', ledger.href, {headers: {depth: '0'}, body: xml(metadata)})).status === 404, 'COLLABORATION_PATH_NOT_ABSENT');
      const created = await mutate('create-calendar', 'MKCALENDAR', ledger.href, {headers: {'if-none-match': '*', 'content-type': 'application/xml'}, body: `<c:mkcalendar xmlns:c="${CAL}" xmlns:d="DAV:"><d:set><d:prop><d:displayname>${escapeXml(ledger.collaboration.subject)}</d:displayname><c:calendar-description>${escapeXml(ledger.marker)}</c:calendar-description><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`});
      check(created.status === 201, 'COLLABORATION_CREATE_NOT_CONFIRMED'); ledger.created201 = true; journal!.save();
      await safe.establishOwner(client, ledger, options.origins); const {rows, own} = await requestMetadata('1'); check(rows.length === 1, 'COLLABORATION_NOT_EMPTY'); safe.ownCalendar(own, ledger); settle('calendar-ready');
    } else {await safe.establishOwner(client, ledger, options.origins); await verifyAddresses();}
    const getEvent = async () => {
      const resource = ledger.resources[0]; check(resource, 'SCHEDULING_RESOURCE_MISSING'); const res = await client.request('GET', resource.href);
      check(res.status === 200 && strong(res.headers.get('etag')), 'SCHEDULING_READ_FAILED'); const state = eventState(res.body, ledger), tag = res.headers.get('schedule-tag');
      check(tag === null || strong(tag), 'INVALID_SCHEDULE_TAG'); const {observedOrganizer, ...publicState} = state; ledger.collaboration.observedOrganizer = observedOrganizer; return {...publicState, etag: res.headers.get('etag')!, scheduleTag: tag};
    };
    if (ledger.collaboration.kind === 'invitation') {
      if (phase === 'start') {
        const capabilities = await client.request('OPTIONS', ledger.href); check([200, 204].includes(capabilities.status) && (capabilities.headers.get('dav') ?? '').split(',').map(s => s.trim()).includes('calendar-auto-schedule'), 'AUTO_SCHEDULING_UNVERIFIED');
        const href = new URL(`${ledger.run}.ics`, ledger.href).href; ledger.resources.push({href, uid: ledger.run, etag: null, deleted: false}); journal!.save();
        check((await client.request('GET', href)).status === 404, 'SCHEDULING_RESOURCE_NOT_ABSENT');
        const compact = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        const cal = new ICAL.Component(ICAL.parse(invitation({uid: ledger.run, organizer: SENDER, attendees: [RECIPIENT], summary: ledger.collaboration.subject, start: compact(ledger.collaboration.start), end: compact(ledger.collaboration.end), stamp: compact(new Date().toISOString())})));
        cal.removeAllProperties('method'); cal.getFirstSubcomponent('vevent')!.updatePropertyWithValue('description', 'Calendar integration test only; no meeting. Accept to test RSVP. This test event will be cancelled after verification.');
        eventState(cal.toString(), ledger);
        const created = await mutate('create-invitation-auto-schedule', 'PUT', href, {headers: {'if-none-match': '*', 'content-type': 'text/calendar'}, body: cal.toString()}); check(created.status === 201, 'INVITATION_CREATE_NOT_CONFIRMED');
        const state = await getEvent(); ledger.resources[0]!.etag = state.etag; ledger.collaboration.scheduleTag = state.scheduleTag; settle('awaiting-recipient');
        return {phase, kind: ledger.collaboration.kind, manifestPath: journal!.path, subject: ledger.collaboration.subject, uid: ledger.run, ...state, senderStored: true, deliveryVerified: false, recipientAcceptanceVerified: false};
      }
      const state = await getEvent();
      if (phase === 'reconcile') {
        const {rows, own} = await requestMetadata('1'); safe.ownCalendar(own, ledger);
        check(rows.length === 2 && rows.some(row => row.href === ledger.resources[0]!.href && row.props[`{${DAV}}getetag`] === state.etag), 'COLLABORATION_UNKNOWN_RESOURCE');
        ledger.resources[0]!.etag = state.etag; ledger.collaboration.scheduleTag = state.scheduleTag; settle('awaiting-recipient');
        return {phase, kind: ledger.collaboration.kind, manifestPath, subject: ledger.collaboration.subject, uid: ledger.run, ...state, senderStored: true, deliveryVerified: false, recipientAcceptanceVerified: false, networkMutations: 0};
      }
      if (phase === 'inspect') return {phase, kind: ledger.collaboration.kind, manifestPath, subject: ledger.collaboration.subject, uid: ledger.run, ...state, deliveryVerified: false, organizerReportsAccepted: state.partstat === 'ACCEPTED', recipientAcceptanceVerified: false, pendingOperation: ledger.pending};
      const {rows, own} = await requestMetadata('1'); safe.ownCalendar(own, ledger);
      check(rows.length === 2 && rows.some(r => r.href === ledger.resources[0]!.href && r.props[`{${DAV}}getetag`] === state.etag), 'COLLABORATION_UNKNOWN_RESOURCE');
      ledger.resources[0]!.etag = state.etag; ledger.collaboration.scheduleTag = state.scheduleTag; journal!.save();
      const removed = await mutate('cancel-invitation-auto-schedule', 'DELETE', ledger.resources[0]!.href, {headers: {'if-match': state.etag, ...(state.scheduleTag ? {'if-schedule-tag-match': state.scheduleTag} : {})}});
      check([200, 204].includes(removed.status) && (await client.request('GET', ledger.resources[0]!.href)).status === 404, 'INVITATION_DELETE_NOT_CONFIRMED'); ledger.resources[0]!.deleted = true; settle('invitation-removed');
    } else {
      const {rows, own} = await requestMetadata('1'); check(rows.length === 1, 'SHARED_CALENDAR_NOT_EMPTY'); const sharing = sharingState(own, ledger, phase === 'start' && !ledger.collaboration.sharePosted);
      if (phase === 'inspect') return {phase, kind: ledger.collaboration.kind, manifestPath, ...sharing, pendingOperation: ledger.pending};
      if (phase === 'reconcile') {
        check(sharing.available && sharing.recipientPresent, 'SHARE_READBACK_NOT_CONFIRMED'); settle('awaiting-recipient');
        return {phase, kind: ledger.collaboration.kind, manifestPath, ...sharing, networkMutations: 0, ownerReportsShareAccepted: sharing.status === 'invite-accepted', recipientAccessVerified: false};
      }
      if (phase === 'start') {
        const capabilities = await client.request('OPTIONS', ledger.href), modes = own.nodes[`{${CS}}allowed-sharing-modes`], dav = capabilities.headers.get('dav') ?? '';
        if (![200, 204].includes(capabilities.status) || !sharing.available || !modes || !dav.split(',').map(s => s.trim()).includes('calendarserver-sharing')) {settle('sharing-unavailable'); return {phase, kind: ledger.collaboration.kind, manifestPath: journal!.path, sharingVerified: false, reason: 'Fresh collection sharing capability or roster unavailable'};}
        check(!sharing.recipientPresent, 'PREEXISTING_SHAREE');
        const change = sharingChange({dav, allowedModesXml: serialize(modes), owner: true, sharee: RECIPIENT, access: 'read', summary: ledger.collaboration.subject});
        const posted = await mutate('invite-read-only-share', change.method, ledger.href, {headers: change.headers, body: change.body}); check([200, 201, 204].includes(posted.status), 'SHARE_POST_NOT_CONFIRMED'); ledger.collaboration.sharePosted = true; journal!.save();
        const after = await requestMetadata('0'), state = sharingState(after.own, ledger); check(state.available && state.recipientPresent, 'SHARE_READBACK_NOT_CONFIRMED'); settle('awaiting-recipient');
        return {phase, kind: ledger.collaboration.kind, manifestPath: journal!.path, ...state, access: 'read', ownerReportsShareAccepted: state.status === 'invite-accepted', recipientAccessVerified: false};
      }
      if (ledger.collaboration.sharePosted) {
        check(sharing.available && sharing.recipientPresent, 'SHARE_REVOCATION_PRECONDITION_FAILED');
        const change = sharingChange({dav: 'calendarserver-sharing', allowedModesXml: `<cs:allowed-sharing-modes xmlns:cs="${CS}"><cs:can-be-shared/></cs:allowed-sharing-modes>`, owner: true, sharee: RECIPIENT, access: 'remove'});
        const removed = await mutate('revoke-read-only-share', change.method, ledger.href, {headers: change.headers, body: change.body}); check([200, 201, 204].includes(removed.status), 'SHARE_REVOKE_NOT_CONFIRMED');
        const after = sharingState((await requestMetadata('0')).own, ledger, true); check(after.available && !after.recipientPresent, 'SHARE_REVOKE_READBACK_FAILED'); settle('share-revoked');
      }
    }
    const empty = await requestMetadata('1'); check(empty.rows.length === 1, 'COLLABORATION_NOT_EMPTY');
    if (ledger.collaboration.kind === 'invitation') safe.ownCalendar(empty.own, ledger); else {const state = sharingState(empty.own, ledger, !ledger.collaboration.sharePosted || ledger.state === 'share-revoked'); check(state.available ? !state.recipientPresent : !ledger.collaboration.sharePosted, 'SHARING_REMAINS');}
    const removed = await mutate('delete-calendar', 'DELETE', ledger.href); check([200, 204].includes(removed.status), 'COLLABORATION_CALENDAR_DELETE_FAILED');
    check([404, 410].includes((await client.request('PROPFIND', ledger.href, {headers: {depth: '0'}, body: xml(metadata)})).status), 'COLLABORATION_CALENDAR_DELETE_READBACK_FAILED'); settle('complete');
    return {phase, kind: ledger.collaboration.kind, manifestPath, senderArtifactsAbsent: true, cancellationMayNotify: ledger.collaboration.kind === 'invitation', recipientArtifactsAbsent: 'not-verified'};
  } catch (error) {
    if (m && journal) {m.state = 'stopped-needs-reconciliation'; m.failure = safe.safeFailure(error); journal.save();}
    throw new LifecycleError(error instanceof LifecycleError ? error.code : 'COLLABORATION_STOPPED', journal?.path ?? manifestPath);
  } finally {if (credential) {credential.user = ''; credential.appPassword = '';}}
}
