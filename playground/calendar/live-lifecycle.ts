import {randomUUID} from 'node:crypto';
import {mkdtempSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, lstatSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import ICAL from 'ical.js';
import {createCalDavClient, parseMultiStatus, parseXml, escapeXml, DAV, CAL, type DavRow} from './caldav-client';
import {createEvent, editSeries, editOccurrence, cancelOccurrence, expand, type Policy} from './advanced-events';
import {readOwnerCredential, validateDiagnostic, type DiagnosticOptions, type Credential} from './live-diagnostic';

const CS = 'http://calendarserver.org/ns/';
export type LifecycleClient = Pick<ReturnType<typeof createCalDavClient>, 'request' | 'discover'>;
export type LifecycleOptions = DiagnosticOptions & {account: string; confirmDedicatedCalendarMutations: boolean};
export type Manifest = {version: 1; run: string; account: string; principal: string; home: string; href: string; marker: string; created201: boolean; ownerPrincipal?: string; privacyEvidence: string[]; state: string; pending: string | null; failure?: {code: string; kind: string; source?: string}; observations?: {case: string; outcome: string}[]; resources: {href: string; uid: string; etag: string | null; deleted: boolean}[]};
export class LifecycleError extends Error {constructor(readonly code: string, readonly manifestPath?: string) {super(code);}}
function safeFailure(error: unknown) {
  const kind = error instanceof TypeError ? 'TypeError' : error instanceof SyntaxError ? 'SyntaxError' : error instanceof LifecycleError ? 'LifecycleError' : 'Error';
  const frame = error instanceof Error ? /(?:live-lifecycle|advanced-events|caldav-client)\.ts:\d+:\d+/.exec(error.stack ?? '')?.[0] : undefined;
  return {code: error instanceof LifecycleError ? error.code : 'LIFECYCLE_STOPPED', kind, ...(frame ? {source: frame} : {})};
}
const ensure = (ok: unknown, code: string): asserts ok => {if (!ok) throw new LifecycleError(code);};
const strong = (tag: string | null): tag is string => !!tag && /^"[^"\x00-\x20\x7f]*"$/.test(tag);
const props = '<d:displayname/><d:resourcetype/><d:owner/><d:acl/><d:getetag/><c:calendar-description/><cs:invite/>';
const body = `<d:propfind xmlns:d="DAV:" xmlns:c="${CAL}" xmlns:cs="${CS}"><d:prop>${props}</d:prop></d:propfind>`;
const nodes = (node: any): any[] => [node, ...(node.children ?? []).flatMap(nodes)];
function canonical(href: string, base: string) {const url = new URL(href, base); ensure(!url.search && !url.hash && !url.username && !url.password, 'UNSAFE_HREF'); return url.href;}
function verifiedRows(xml: string, href: string) {
  const rows = parseMultiStatus(xml), seen = new Set<string>();
  for (const row of rows) {row.href = canonical(row.href, href); ensure(!seen.has(row.href) && row.errors.every(code => code === 404) && (!row.status || row.status === 200), 'INCOMPLETE_INVENTORY'); seen.add(row.href);}
  return rows;
}
/** Fresh creation and marker establish isolation; missing ACL/sharing evidence is recorded, never called proof. */
function ownCalendar(row: DavRow, manifest: Manifest) {
  ensure(row.href === manifest.href && row.props[`{${CAL}}calendar-description`] === manifest.marker, 'OWNERSHIP_MARKER_MISMATCH');
  const types = row.nodes[`{${DAV}}resourcetype`]?.children ?? [];
  ensure(types.some(n => n.name === `{${CAL}}calendar`) && types.every(n => [`{${DAV}}collection`, `{${CAL}}calendar`].includes(n.name)), 'SHARED_OR_UNKNOWN_COLLECTION_TYPE');
  const owner = row.nodes[`{${DAV}}owner`]?.children;
  ensure(owner?.length === 1 && owner[0]!.name === `{${DAV}}href` && canonical(owner[0]!.text, manifest.href) === (manifest.ownerPrincipal ?? manifest.principal), 'CALENDAR_OWNER_MISMATCH');
  const invites = row.nodes[`{${CS}}invite`];
  if (invites) ensure(invites.children.length === 0 && !invites.text.trim(), 'SHARING_PRESENT');
  else if (!manifest.privacyEvidence.includes('sharing-property-unavailable')) manifest.privacyEvidence.push('sharing-property-unavailable');
  const acl = row.nodes[`{${DAV}}acl`];
  if (!acl && !manifest.privacyEvidence.includes('acl-property-unavailable')) manifest.privacyEvidence.push('acl-property-unavailable');
  for (const ace of acl?.children ?? []) {
    ensure(ace.name === `{${DAV}}ace`, 'UNKNOWN_ACL_ENTRY');
    const principal = ace.children.find(n => n.name === `{${DAV}}principal`);
    ensure(principal?.children.length === 1 && principal.children[0]!.name === `{${DAV}}href` && canonical(principal.children[0]!.text, manifest.href) === (manifest.ownerPrincipal ?? manifest.principal), 'NONOWNER_ACL_PRESENT');
    ensure(!nodes(ace).some(n => n.name === `{${DAV}}inherited`), 'INHERITED_ACL_UNVERIFIED');
  }
}
/** Authenticated alias witness: same principal path, explicit origins, current principal and exact home. */
async function establishOwner(client: LifecycleClient, manifest: Manifest, origins: string[]) {
  const propertyRead = async (href: string, properties: string) => {
    const response = await client.request('PROPFIND', href, {headers: {depth: '0', 'content-type': 'application/xml'}, body: `<d:propfind xmlns:d="DAV:" xmlns:c="${CAL}"><d:prop>${properties}</d:prop></d:propfind>`});
    ensure(response.status === 207, 'OWNER_IDENTITY_WITNESS_FAILED');
    const rows = verifiedRows(response.body, href); ensure(rows.length === 1 && rows[0]!.href === href, 'OWNER_IDENTITY_WITNESS_FAILED'); return rows[0]!;
  };
  const hrefProperty = (row: DavRow, name: string, base: string) => {const children = row.nodes[name]?.children; ensure(children?.length === 1 && children[0]!.name === `{${DAV}}href`, 'OWNER_IDENTITY_WITNESS_FAILED'); return canonical(children[0]!.text, base);};
  const row = await propertyRead(manifest.href, '<d:owner/>');
  const owner = hrefProperty(row, `{${DAV}}owner`, manifest.href);
  if (owner === manifest.principal) {manifest.ownerPrincipal = owner; return;}
  ensure(origins.includes(new URL(owner).origin) && new URL(owner).pathname === new URL(manifest.principal).pathname, 'OWNER_ALIAS_NOT_ALLOWED');
  const rootHref = new URL('/', owner).href;
  const root = await propertyRead(rootHref, '<d:current-user-principal/>');
  ensure(hrefProperty(root, `{${DAV}}current-user-principal`, rootHref) === owner, 'OWNER_IDENTITY_WITNESS_FAILED');
  const principal = await propertyRead(owner, '<c:calendar-home-set/>');
  ensure(hrefProperty(principal, `{${CAL}}calendar-home-set`, owner) === manifest.home, 'OWNER_HOME_WITNESS_FAILED');
  ensure(!manifest.ownerPrincipal || manifest.ownerPrincipal === owner, 'OWNER_ALIAS_CHANGED');
  manifest.ownerPrincipal = owner;
  if (!manifest.privacyEvidence.includes('authenticated-shard-principal-home-witness')) manifest.privacyEvidence.push('authenticated-shard-principal-home-witness');
}
function privateJournal(manifest: Manifest, existingPath?: string) {
  const directory = existingPath ? dirname(existingPath) : mkdtempSync(join(tmpdir(), 'icloud-calendar-ledger-'));
  const path = existingPath ?? join(directory, 'manifest.json');
  const save = () => {
    const next = join(directory, `.${randomUUID()}.json`), fd = openSync(next, 'wx', 0o600);
    try {writeFileSync(fd, JSON.stringify(manifest, null, 2)); fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(next, path);
    const directoryFd = openSync(directory, 'r'); try {fsyncSync(directoryFd);} finally {closeSync(directoryFd);}
  };
  save(); return {path, save};
}
function semantic(text: string) {
  const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const component = (value: any): any => [value[0], value[1].filter((p: any) => !['dtstamp', 'created', 'last-modified'].includes(p[0])).map(stable).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b))), value[2].map(component).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)))];
  return JSON.stringify(component(ICAL.parse(text)));
}
class RepresentationNotPreserved extends Error {}
function equivalentExtended(actual: string, expected: string, window: {start: string; end: string}, policy: Policy) {
  const signature = (text: string) => {
    const occurrences = expand(text, window, policy), cal = new ICAL.Component(ICAL.parse(text));
    const kinds = cal.getAllSubcomponents('vevent').map(c => {const event = new ICAL.Event(c); return event.startDate.isDate ? 'date' : event.startDate.zone.tzid === 'floating' ? 'floating' : 'absolute';});
    cal.removeAllSubcomponents('vtimezone');
    for (const event of cal.getAllSubcomponents('vevent')) for (const name of ['dtstart', 'dtend', 'duration']) event.removeAllProperties(name);
    return JSON.stringify({metadata: semantic(cal.toString()), kinds, occurrences});
  };
  try {return signature(actual) === signature(expected);} catch {return false;}
}
function personal(text: string, uid: string) {
  const cal = new ICAL.Component(ICAL.parse(text));
  ensure(cal.name === 'vcalendar' && !cal.hasProperty('method'), 'SCHEDULING_NOT_ALLOWED');
  const events = cal.getAllSubcomponents('vevent');
  ensure(cal.getAllSubcomponents().every(c => ['vevent', 'vtimezone'].includes(c.name)), 'UNKNOWN_COMPONENT');
  ensure(events.length > 0 && events.every(e => e.getFirstPropertyValue('uid') === uid && !e.hasProperty('attendee') && !e.hasProperty('organizer')), 'EVENT_IDENTITY_MISMATCH');
}
function extendedCases() {
  const window = {start: '2026-03-01T00:00:00Z', end: '2026-06-01T00:00:00Z'};
  ensure(Date.parse(window.end) < Date.now(), 'PAST_EXPERIMENT_WINDOW_REQUIRED');
  const zone = `BEGIN:VTIMEZONE
TZID:America/New_York
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
  const definitions = [
    {name: 'all-day-date', start: {value: '2026-03-07'}, end: {value: '2026-03-08'}, policy: {date: 'utc'} as Policy, count: 1},
    {name: 'floating', start: {value: '2026-03-07T09:00:00'}, end: {value: '2026-03-07T10:00:00'}, policy: {floating: 'utc'} as Policy, count: 1},
    {name: 'embedded-dst', start: {value: '2026-03-07T09:00:00', tzid: 'America/New_York'}, end: {value: '2026-03-07T10:00:00', tzid: 'America/New_York'}, policy: {} as Policy, count: 3, recurrence: {frequency: 'DAILY' as const, count: 3}, zone},
    {name: 'embedded-fall-dst', start: {value: '2025-11-01T09:00:00', tzid: 'America/New_York'}, end: {value: '2025-11-01T10:00:00', tzid: 'America/New_York'}, policy: {} as Policy, count: 3, recurrence: {frequency: 'DAILY' as const, count: 3}, zone, window: {start: '2025-11-01T00:00:00Z', end: '2025-11-05T00:00:00Z'}},
    {name: 'weekly-byday', start: {value: '2026-03-02T09:00:00Z'}, end: {value: '2026-03-02T10:00:00Z'}, policy: {} as Policy, count: 3, recurrence: {frequency: 'WEEKLY' as const, count: 3, byDay: ['MO', 'WE']}},
    {name: 'monthly-byday', start: {value: '2026-03-02T09:00:00Z'}, end: {value: '2026-03-02T10:00:00Z'}, policy: {} as Policy, count: 3, recurrence: {frequency: 'MONTHLY' as const, count: 3, byDay: ['1MO']}}
  ];
  return definitions.map(d => ({name: d.name, window: d.window ?? window, policy: d.policy, count: d.count,
    create: (uid: string) => createEvent(uid, {summary: 'Extended calendar experiment', description: 'Synthetic past fixture', location: 'Room A', categories: ['Experiment'], status: 'CONFIRMED', transparency: 'OPAQUE', start: d.start, end: d.end, alarms: [{minutesBefore: 15, description: 'Past display alarm'}]}, d.recurrence, d.zone, d.policy),
    update: (text: string) => {
      // Shift the complete bounded pattern one hour (DATE case one day), retaining its date type/TZID.
      const shift = (v: typeof d.start) => ({...v, value: v.value.replace('T09:', 'T11:').replace('T10:', 'T12:')});
      const changed = editSeries(text, {summary: 'Updated extended experiment', description: 'Updated past fixture', location: 'Room B', categories: ['Updated'], status: 'TENTATIVE', transparency: 'TRANSPARENT', start: d.name === 'all-day-date' ? {value: '2026-03-08'} : shift(d.start), end: d.name === 'all-day-date' ? {value: '2026-03-09'} : shift(d.end)}, d.policy);
      const rows = expand(changed, d.window ?? window, d.policy); ensure(rows.length === d.count, 'FIXTURE_COUNT_MISMATCH');
      if (d.name === 'embedded-dst') ensure(rows.map(r => r.start.slice(11, 13)).join(',') === '16,15,15', 'FIXTURE_DST_MISMATCH');
      if (d.name === 'embedded-fall-dst') ensure(rows.map(r => r.start.slice(11, 13)).join(',') === '15,16,16', 'FIXTURE_DST_MISMATCH');
      return changed;
    }}));
}
export const runExtendedLifecycle = (options: LifecycleOptions, factory?: (credential: Credential, origins: string[]) => LifecycleClient, loader: (options: DiagnosticOptions) => Credential | Promise<Credential> = readOwnerCredential) => runLifecycle(options, factory, loader, true);

/** No retry/recovery mode: any uncertain outcome retains its exact ledger for manual reconciliation.
 * Collection cleanup has a residual inventory/delete race; only this newly-created private collection is eligible.
 */
export async function runLifecycle(options: LifecycleOptions, factory?: (credential: Credential, origins: string[]) => LifecycleClient,
  loader: (options: DiagnosticOptions) => Credential | Promise<Credential> = readOwnerCredential, extended = false) {
  validateDiagnostic(options);
  ensure(Date.parse(options.start) + 4 * 86400000 < Date.now(), 'PAST_EXPERIMENT_WINDOW_REQUIRED');
  ensure(options.confirmDedicatedCalendarMutations === true && !!options.account, 'DEDICATED_MUTATION_CONFIRMATION_REQUIRED');
  let credential: Credential | undefined, journal: ReturnType<typeof privateJournal> | undefined, manifest: Manifest | undefined;
  try {
    credential = await loader(options);
    ensure(credential.user.toLowerCase() === options.account.toLowerCase(), 'ACCOUNT_MISMATCH');
    ensure(!/[:\r\n]/.test(credential.user) && !/[\r\n]/.test(credential.appPassword), 'INVALID_CREDENTIAL');
    const client = factory ? factory(credential, options.origins) : createCalDavClient({baseUrl: options.origins[0] + '/', allowedOrigins: options.origins, authorization: `Basic ${Buffer.from(`${credential.user}:${credential.appPassword}`).toString('base64')}`});
    const discovery = await client.discover(), run = randomUUID();
    const home = canonical(discovery.home, options.origins[0]);
    ensure(new URL(home).pathname.endsWith('/'), 'INVALID_HOME');
    manifest = {version: 1, run, account: options.account, principal: canonical(discovery.principal, home), home, href: new URL(`experiment-${run}/`, home).href, marker: `icloud-plugin experiment ${run}`, created201: false, privacyEvidence: ['fresh-uuid-create201-marker-owner-no-share-writes'], state: 'prepared', pending: null, resources: []};
    journal = privateJournal(manifest);
    const mutate = async (label: string, method: string, href: string, init: {headers?: Record<string,string>; body?: string} = {}) => {
      manifest!.pending = label; journal!.save();
      // Deliberately use the single request primitive: no mutation retries or hidden recovery.
      return client.request(method, href, init);
    };
    const settled = (state: string) => {manifest!.state = state; manifest!.pending = null; journal!.save();};
    const inventory = async (depth: '0' | '1') => {
      const result = await client.request('PROPFIND', manifest!.href, {headers: {depth, 'content-type': 'application/xml'}, body});
      ensure(result.status === 207, 'INVENTORY_FAILED');
      const rows = verifiedRows(result.body, manifest!.href), own = rows.find(r => r.href === manifest!.href);
      ensure(own, 'COLLECTION_MISSING'); ownCalendar(own, manifest!);
      if (depth === '0') ensure(rows.length === 1, 'UNEXPECTED_DEPTH_ZERO_ROWS');
      else {
        const expected = manifest!.resources.filter(r => !r.deleted);
        ensure(rows.length === expected.length + 1 && rows.every(row => row.href === manifest!.href || expected.some(r => r.href === row.href && row.props[`{${DAV}}getetag`] === r.etag)), 'UNKNOWN_OR_CHANGED_RESOURCE');
      }
      return rows;
    };
    const preflight = await client.request('PROPFIND', manifest.href, {headers: {depth: '0'}, body});
    ensure(preflight.status === 404, 'NEW_CALENDAR_PATH_NOT_ABSENT');
    const created = await mutate('create-calendar', 'MKCALENDAR', manifest.href, {headers: {'if-none-match': '*', 'content-type': 'application/xml'}, body: `<c:mkcalendar xmlns:d="DAV:" xmlns:c="${CAL}"><d:set><d:prop><d:displayname>${escapeXml(manifest.marker)}</d:displayname><c:calendar-description>${escapeXml(manifest.marker)}</c:calendar-description><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`});
    ensure(created.status === 201, 'CREATE_CALENDAR_NOT_CONFIRMED'); manifest.created201 = true; journal.save();
    await establishOwner(client, manifest, options.origins); journal.save();
    await inventory('1'); settled('calendar-created-private');
    const start = new Date(options.start), end = new Date(start.getTime() + 3600000);
    const date = (d: Date) => d.toISOString().replace('.000Z', 'Z');
    type Case = {name: string; policy: Policy; create(uid: string): string; update(text: string): string; window: {start: string; end: string}; count: number};
    const core: Case = {name: 'core-daily-exceptions', policy: {}, window: {start: start.toISOString(), end: new Date(start.getTime() + 4 * 86400000).toISOString()}, count: 2,
      create: uid => createEvent(uid, {summary: 'Calendar experiment', description: manifest!.marker, location: 'Synthetic room', url: 'https://example.invalid/calendar', categories: ['Experiment'], status: 'CONFIRMED', transparency: 'OPAQUE', start: {value: date(start)}, end: {value: date(end)}, alarms: []}, {frequency: 'DAILY', count: 3}),
      update: text => {
        let updated = editSeries(text, {summary: 'Updated calendar experiment', location: 'Changed synthetic room', description: manifest!.marker + ' updated', url: null, categories: ['Updated'], transparency: 'TRANSPARENT', alarms: []});
        const second = new Date(start.getTime() + 86400000), third = new Date(start.getTime() + 2 * 86400000);
        updated = editOccurrence(updated, {value: date(second)}, {start: {value: date(new Date(second.getTime() + 7200000))}, end: {value: date(new Date(second.getTime() + 10800000))}});
        return cancelOccurrence(updated, {value: date(third)});
      }};
    const cases = extended ? extendedCases() : [core];
    manifest.observations = [];
    const observe = (name: string, outcome: string) => {manifest!.observations!.push({case: name, outcome}); journal!.save();};
    const report = async (xml: string) => client.request('REPORT', manifest!.href, {headers: {depth: '1', 'content-type': 'application/xml'}, body: xml});
    let syncSupported = false;
    if (extended) {
      const capabilities = await client.request('PROPFIND', manifest.href, {headers: {depth: '0', 'content-type': 'application/xml'}, body: '<d:propfind xmlns:d="DAV:"><d:prop><d:supported-report-set/></d:prop></d:propfind>'});
      if (capabilities.status === 207) {
        const rows = verifiedRows(capabilities.body, manifest.href); ensure(rows.length === 1 && rows[0]!.href === manifest.href, 'CAPABILITY_IDENTITY_MISMATCH');
        syncSupported = !!rows[0]!.nodes[`{${DAV}}supported-report-set`] && nodes(rows[0]!.nodes[`{${DAV}}supported-report-set`]).some(n => n.name === `{${DAV}}sync-collection`);
      }
      observe('incremental-sync', syncSupported ? 'advertised' : `not-advertised-http-${capabilities.status}`);
    }
    const sync = async (token: string) => {
      if (!syncSupported) return null;
      const res = await report(`<d:sync-collection xmlns:d="DAV:" xmlns:c="${CAL}"><d:sync-token>${escapeXml(token)}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/><c:calendar-data/></d:prop></d:sync-collection>`);
      if ([403, 405, 409, 501].includes(res.status)) {observe('incremental-sync', `unavailable-http-${res.status}`); syncSupported = false; return null;}
      ensure(res.status === 207, 'SYNC_FAILED');
      const root = parseXml(res.body), next = root.children.find(n => n.name === `{${DAV}}sync-token`)?.text;
      if (!next) {observe('incremental-sync', 'no-token-returned'); syncSupported = false; return null;}
      const rows = parseMultiStatus(res.body), seen = new Set<string>();
      const events: DavRow[] = [];
      for (const row of rows) {
        row.href = canonical(row.href, manifest!.href); ensure(!seen.has(row.href), 'DUPLICATE_SYNC_RESOURCE'); seen.add(row.href);
        if (row.href === manifest!.href) {
          // iCloud includes the exact collection's ETag metadata even in an initial empty sync.
          ensure(row.errors.length === 0 && (!row.status || row.status === 200) && Object.keys(row.props).length === 1 && strong(row.props[`{${DAV}}getetag`] ?? null), 'INVALID_SYNC_COLLECTION_METADATA');
          continue;
        }
        const resource = manifest!.resources.find(r => r.href === row.href);
        ensure(resource && row.errors.length === 0 && (!row.status || [200, 404].includes(row.status)), 'UNEXPECTED_SYNC_RESOURCE');
        if (row.status !== 404) {
          ensure(!resource.deleted && strong(resource.etag) && row.props[`{${DAV}}getetag`] === resource.etag, 'SYNC_ETAG_MISMATCH');
          if (!Object.hasOwn(row.props, `{${CAL}}calendar-data`)) {
            const hydrated = await client.request('GET', row.href);
            ensure(hydrated.status === 200 && hydrated.headers.get('etag') === row.props[`{${DAV}}getetag`], 'SYNC_HYDRATION_RACE_OR_FAILURE');
            personal(hydrated.body, resource.uid); row.props[`{${CAL}}calendar-data`] = hydrated.body;
            if (!manifest!.observations!.some(o => o.outcome === 'etag-only-rows-hydrated-with-matching-get')) observe('incremental-sync', 'etag-only-rows-hydrated-with-matching-get');
          }
          ensure(typeof row.props[`{${CAL}}calendar-data`] === 'string' && row.props[`{${CAL}}calendar-data`].length > 0, 'SYNC_RESOURCE_DATA_MISSING');
        }
        events.push(row);
      }
      return {token: next, rows: events};
    };
    for (const scenario of cases) {
      const uid = `${randomUUID()}@calendar-experiment.invalid`, href = new URL(`${randomUUID()}.ics`, manifest.href).href;
      const resource = {href, uid, etag: null as string | null, deleted: false}; manifest.resources.push(resource); journal.save();
      const absent = await client.request('GET', href); ensure(absent.status === 404, 'NEW_EVENT_PATH_NOT_ABSENT');
      let lastBody = '', updated = '', representationPreserved = true;
      let updatedSync: Awaited<ReturnType<typeof sync>> = null;
      const readback = async (expected?: string) => {
        const result = await client.request('GET', href); ensure(result.status === 200 && strong(result.headers.get('etag')), 'EVENT_READBACK_FAILED');
        personal(result.body, uid);
        if (resource.etag) ensure(result.headers.get('etag') === resource.etag, 'EVENT_CHANGED');
        lastBody = result.body;
        if (expected !== undefined && semantic(result.body) !== semantic(expected)) {
          if (extended && equivalentExtended(result.body, expected, scenario.window, scenario.policy)) {
            if (!manifest!.observations!.some(o => o.case === scenario.name && o.outcome === 'provider-timezone-normalized-equivalent')) observe(scenario.name, 'provider-timezone-normalized-equivalent');
          } else {
            if (!extended) throw new LifecycleError('EVENT_READBACK_MISMATCH');
            resource.etag = result.headers.get('etag'); journal!.save(); throw new RepresentationNotPreserved();
          }
        }
        return result;
      };
      const original = scenario.create(uid);
      try {
      const initialSync = extended ? await sync('') : null;
      const put = await mutate('create-event', 'PUT', href, {headers: {'if-none-match': '*', 'content-type': 'text/calendar'}, body: original});
      if (extended && [400, 403, 409, 415, 422].includes(put.status)) {
        ensure((await client.request('GET', href)).status === 404, 'REJECTED_CREATE_OUTCOME_UNKNOWN'); resource.deleted = true; observe(scenario.name, `create-rejected-http-${put.status}`); settled('case-rejected-no-resource'); continue;
      }
      ensure(put.status === 201, 'CREATE_EVENT_NOT_CONFIRMED');
      let actual = await readback(original); resource.etag = actual.headers.get('etag'); settled('event-created');
      const createdEtag = resource.etag!;
      const createdSync = initialSync ? await sync(initialSync.token) : null;
      if (createdSync) ensure(createdSync.rows.some(row => row.href === href && row.props[`{${DAV}}getetag`] === resource.etag && semantic(row.props[`{${CAL}}calendar-data`] ?? '') === semantic(actual.body)), 'SYNC_CREATE_MISMATCH');
      await readback(original);
      updated = scenario.update(actual.body);
      const changed = await mutate('update-event', 'PUT', href, {headers: {'if-match': resource.etag!, 'content-type': 'text/calendar'}, body: updated}); ensure([200, 204].includes(changed.status), 'UPDATE_EVENT_NOT_CONFIRMED');
      resource.etag = null; actual = await readback(updated); resource.etag = actual.headers.get('etag');
      ensure(expand(actual.body, scenario.window, scenario.policy).length === scenario.count, 'RECURRENCE_READBACK_MISMATCH'); settled('event-updated');
      updatedSync = createdSync ? await sync(createdSync.token) : null;
      if (updatedSync) ensure(updatedSync.rows.some(row => row.href === href && row.props[`{${DAV}}getetag`] === resource.etag && semantic(row.props[`{${CAL}}calendar-data`] ?? '') === semantic(actual.body)), 'SYNC_UPDATE_MISMATCH');
      if (extended) {
        ensure(createdEtag !== resource.etag, 'ETAG_DID_NOT_CHANGE');
        for (const method of ['PUT', 'DELETE']) {
          const conflict = await mutate(`stale-${method.toLowerCase()}`, method, href, {headers: {'if-match': createdEtag, 'content-type': 'text/calendar'}, ...(method === 'PUT' ? {body: original} : {})});
          ensure(conflict.status >= 400 && conflict.status < 500, 'STALE_WRITE_OUTCOME_UNKNOWN');
          await readback(updated); observe(`${scenario.name}-stale-${method.toLowerCase()}`, conflict.status === 412 ? 'rejected-412' : `not-412-http-${conflict.status}`); settled('stale-write-rejected');
        }
        const compact = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        const target = new URL(href), collection = new URL(manifest.href);
        ensure(!target.search && !target.hash && target.origin === collection.origin && target.pathname.startsWith(collection.pathname) && !target.pathname.slice(collection.pathname.length).includes('/'), 'MULTIGET_HREF_OUTSIDE_COLLECTION');
        const dataProps = '<d:prop><d:getetag/><c:calendar-data/></d:prop>';
        const queries = [
          ['query', `<c:calendar-query xmlns:d="DAV:" xmlns:c="${CAL}">${dataProps}<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${compact(scenario.window.start)}" end="${compact(scenario.window.end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`],
          ['multiget', `<c:calendar-multiget xmlns:d="DAV:" xmlns:c="${CAL}">${dataProps}<d:href>${escapeXml(target.pathname)}</d:href></c:calendar-multiget>`]
        ];
        let boundedRows: DavRow[] | undefined;
        for (const [label, xml] of queries) {
          const result = await report(xml!);
          if ([403, 405, 409, 501].includes(result.status)) {observe(`${scenario.name}-${label}`, `unavailable-http-${result.status}`); continue;}
          ensure(result.status === 207, 'QUERY_FAILED'); const rows = verifiedRows(result.body, manifest.href);
          ensure(rows.length === 1 && rows[0]!.href === href && rows[0]!.props[`{${DAV}}getetag`] === resource.etag && semantic(rows[0]!.props[`{${CAL}}calendar-data`] ?? '') === semantic(actual.body), 'QUERY_READBACK_MISMATCH');
          if (label === 'query') boundedRows = rows;
          observe(`${scenario.name}-${label}`, 'matched-exact-resource');
        }
        const positive = 'Updated', negative = `no-match-${run}`;
        const probe = async (term: string) => {
          const response = await report(`<c:calendar-query xmlns:d="DAV:" xmlns:c="${CAL}">${dataProps}<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${compact(scenario.window.start)}" end="${compact(scenario.window.end)}"/><c:prop-filter name="SUMMARY"><c:text-match collation="i;ascii-casemap">${escapeXml(term)}</c:text-match></c:prop-filter></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`);
          if ([403, 405, 409, 501].includes(response.status)) {observe(`${scenario.name}-provider-text-filter`, `provider-summary-filter-unavailable-http-${response.status}`); return null;}
          ensure(response.status === 207, 'TEXT_QUERY_FAILED'); const rows = verifiedRows(response.body, manifest.href);
          ensure(rows.length <= 1 && rows.every(row => row.href === href && row.props[`{DAV:}getetag`] === resource.etag && typeof row.props[`{${CAL}}calendar-data`] === 'string' && semantic(row.props[`{${CAL}}calendar-data`]) === semantic(actual.body)), 'TEXT_QUERY_INCOMPLETE_OR_UNKNOWN');
          return rows.length;
        };
        const positiveCount = await probe(positive), negativeCount = await probe(negative);
        observe(`${scenario.name}-provider-text-filter`, positiveCount === 1 && negativeCount === 0 ? 'provider-summary-filter-verified' : positiveCount === 1 && negativeCount === 1 ? 'provider-summary-filter-ignored' : 'provider-summary-filter-unverified');
        if (boundedRows) {
          const localSearch = (term: string) => boundedRows!.filter(row => new ICAL.Component(ICAL.parse(row.props[`{${CAL}}calendar-data`])).getAllSubcomponents('vevent').some(event => String(event.getFirstPropertyValue('summary') ?? '').toLowerCase().includes(term.toLowerCase())));
          ensure(localSearch(positive).length === 1 && localSearch(negative).length === 0, 'LOCAL_SUMMARY_SEARCH_MISMATCH');
          observe(`${scenario.name}-local-text-search`, 'local-summary-search-verified');
        } else observe(`${scenario.name}-local-text-search`, 'local-summary-search-unverified');
        // Add then remove URL/alarm metadata using current provider representation and conditional writes.
        updated = editSeries(actual.body, {url: 'https://example.invalid/updated', status: 'CONFIRMED', alarms: [{minutesBefore: 5, description: 'Past experiment display alarm'}]}, scenario.policy);
        for (let pass = 0; pass < 2; pass++) {
          const next = pass === 0 ? updated : editSeries(actual.body, {url: null, alarms: []}, scenario.policy);
          await readback(); const result = await mutate('update-fields', 'PUT', href, {headers: {'if-match': resource.etag!, 'content-type': 'text/calendar'}, body: next}); ensure([200, 204].includes(result.status), 'UPDATE_FIELDS_NOT_CONFIRMED'); resource.etag = null; actual = await readback(next); resource.etag = actual.headers.get('etag'); updated = actual.body; settled('fields-updated');
        }
      }
      } catch (error) {
        if (!(error instanceof RepresentationNotPreserved)) throw error;
        representationPreserved = false; updated = lastBody; observe(scenario.name, 'provider-representation-not-preserved'); settled('representation-observed-cleanup-only');
      }
      await inventory('1'); await readback(updated);
      const deleted = await mutate('delete-event', 'DELETE', href, {headers: {'if-match': resource.etag!}}); ensure(deleted.status === 204 || deleted.status === 200, 'DELETE_EVENT_NOT_CONFIRMED');
      ensure((await client.request('GET', href)).status === 404, 'EVENT_DELETE_READBACK_FAILED'); resource.deleted = true; settled('event-deleted');
      const deletedSync = updatedSync ? await sync(updatedSync.token) : null;
      if (deletedSync) {ensure(deletedSync.rows.some(row => row.href === href && row.status === 404), 'SYNC_DELETE_MISMATCH'); observe(`${scenario.name}-sync`, 'create-update-delete-observed');}
      observe(scenario.name, representationPreserved ? 'created-updated-deleted' : 'normalized-resource-cleaned'); await inventory('1');
    }
    const renamed = await mutate('rename-calendar', 'PROPPATCH', manifest.href, {headers: {'content-type': 'application/xml'}, body: `<d:propertyupdate xmlns:d="DAV:"><d:set><d:prop><d:displayname>${escapeXml(manifest.marker + ' complete')}</d:displayname></d:prop></d:set></d:propertyupdate>`});
    ensure(renamed.status === 207, 'RENAME_NOT_CONFIRMED');
    const patchRows = verifiedRows(renamed.body, manifest.href);
    ensure(patchRows.length === 1 && patchRows[0]!.href === manifest.href && Object.hasOwn(patchRows[0]!.props, `{${DAV}}displayname`), 'RENAME_NOT_CONFIRMED');
    const renamedRows = await inventory('0'); ensure(renamedRows[0]!.props[`{${DAV}}displayname`] === manifest.marker + ' complete', 'RENAME_READBACK_FAILED'); settled('calendar-renamed');
    await inventory('1'); // Same marker/owner, no sharing, exact empty immediately before DELETE.
    ensure(manifest.created201, 'OWNERSHIP_NOT_ESTABLISHED');
    const removed = await mutate('delete-calendar', 'DELETE', manifest.href); ensure([200, 204].includes(removed.status), 'DELETE_CALENDAR_NOT_CONFIRMED');
    ensure([404, 410].includes((await client.request('PROPFIND', manifest.href, {headers: {depth: '0'}, body})).status), 'CALENDAR_DELETE_READBACK_FAILED'); settled('complete');
    return {mode: extended ? 'extended-dedicated-live-lifecycle' : 'dedicated-live-lifecycle', complete: true, lifecycleComplete: true, allCasesVerified: manifest.observations.filter(o => o.outcome === 'created-updated-deleted').length === cases.length && !manifest.observations.some(o => !o.case.endsWith('-provider-text-filter') && /not-412|unavailable|unverified|not-advertised|no-token|not-preserved|rejected-http/.test(o.outcome)), providerTextFilterIgnored: manifest.observations.some(o => o.outcome === 'provider-summary-filter-ignored'), localTextSearchVerified: extended && manifest.observations.filter(o => o.outcome === 'local-summary-search-verified').length === cases.length, observations: manifest.observations, manifestPath: journal.path, invitationsSent: 0, existingResourcesChanged: 0};
  } catch (error) {
    if (manifest && journal) {manifest.state = 'stopped-needs-reconciliation'; manifest.failure = safeFailure(error); journal.save();}
    throw new LifecycleError(error instanceof LifecycleError ? error.code : 'LIFECYCLE_STOPPED', journal?.path);
  } finally {if (credential) {credential.user = ''; credential.appPassword = '';}}
}
// Intentionally no CLI auto-run. The owner must review readiness and explicitly invoke runLifecycle.

/** Exact201 calendar only: initial empty/planned404 recovery, or one confirmed ETag/UID resource with no pending write. */
export async function cleanupCreatedCalendar(path: string, options: LifecycleOptions,
  factory?: (credential: Credential, origins: string[]) => LifecycleClient,
  loader: (options: DiagnosticOptions) => Credential | Promise<Credential> = readOwnerCredential) {
  validateDiagnostic(options); ensure(options.confirmDedicatedCalendarMutations === true, 'DEDICATED_MUTATION_CONFIRMATION_REQUIRED');
  for (const [entry, directory] of [[path, false], [dirname(path), true]] as const) {const stat = lstatSync(entry); ensure(!stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()) && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0, 'UNTRUSTED_LEDGER_CUSTODY');}
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  ensure(manifest.version === 1 && /^[0-9a-f-]{36}$/.test(manifest.run) && manifest.created201 === true && manifest.state === 'stopped-needs-reconciliation' && Array.isArray(manifest.resources) && ((manifest.pending === 'create-calendar' && manifest.resources.length === 0) || (manifest.pending === null && manifest.resources.length > 0 && manifest.resources.every(r => r.deleted === false && (r.etag === null || (manifest.resources.length === 1 && strong(r.etag)))))), 'LEDGER_NOT_ELIGIBLE_FOR_EMPTY_CLEANUP');
  ensure(manifest.account.toLowerCase() === options.account.toLowerCase() && manifest.marker === `icloud-plugin experiment ${manifest.run}` && manifest.href === new URL(`experiment-${manifest.run}/`, manifest.home).href, 'LEDGER_IDENTITY_MISMATCH');
  ensure([manifest.home, manifest.href, manifest.principal].every(href => options.origins.includes(new URL(href).origin)), 'LEDGER_ORIGIN_NOT_ALLOWED');
  let credential: Credential | undefined;
  const journal = privateJournal(manifest, path);
  try {
    credential = await loader(options); ensure(credential.user.toLowerCase() === options.account.toLowerCase(), 'ACCOUNT_MISMATCH');
    ensure(!/[:\r\n]/.test(credential.user) && !/[\r\n]/.test(credential.appPassword), 'INVALID_CREDENTIAL');
    const client = factory ? factory(credential, options.origins) : createCalDavClient({baseUrl: options.origins[0] + '/', allowedOrigins: options.origins, authorization: `Basic ${Buffer.from(`${credential.user}:${credential.appPassword}`).toString('base64')}`});
    const discovery = await client.discover(); ensure(canonical(discovery.home, manifest.home) === manifest.home && canonical(discovery.principal, manifest.home) === manifest.principal, 'DISCOVERY_IDENTITY_CHANGED');
    await establishOwner(client, manifest, options.origins); journal.save();
    for (const resource of manifest.resources) {
      ensure(canonical(resource.href, manifest.href) === resource.href && new URL(resource.href).origin === new URL(manifest.href).origin && new URL(resource.href).pathname.startsWith(new URL(manifest.href).pathname) && !new URL(resource.href).pathname.slice(new URL(manifest.href).pathname.length).includes('/'), 'UNTRUSTED_PLANNED_RESOURCE');
      const read = await client.request('GET', resource.href);
      if (resource.etag === null) ensure(read.status === 404, 'PLANNED_RESOURCE_NOT_ABSENT');
      else {ensure(read.status === 200 && read.headers.get('etag') === resource.etag, 'RECOVERY_RESOURCE_CHANGED'); personal(read.body, resource.uid);}
    }
    const check = await client.request('PROPFIND', manifest.href, {headers: {depth: '1', 'content-type': 'application/xml'}, body});
    ensure(check.status === 207, 'INVENTORY_FAILED'); const rows = verifiedRows(check.body, manifest.href), active = manifest.resources.filter(r => r.etag !== null);
    ensure(rows.length === active.length + 1 && rows.every(row => row.href === manifest.href || active.some(r => r.href === row.href && row.props[`{${DAV}}getetag`] === r.etag)), 'UNKNOWN_OR_CHANGED_RESOURCE');
    ownCalendar(rows.find(r => r.href === manifest.href)!, manifest);
    for (const resource of active) {
      const read = await client.request('GET', resource.href); ensure(read.status === 200 && read.headers.get('etag') === resource.etag, 'RECOVERY_RESOURCE_CHANGED'); personal(read.body, resource.uid);
      manifest.pending = 'delete-event'; journal.save();
      const removed = await client.request('DELETE', resource.href, {headers: {'if-match': resource.etag!}}); ensure([200, 204].includes(removed.status), 'DELETE_EVENT_NOT_CONFIRMED');
      ensure((await client.request('GET', resource.href)).status === 404, 'EVENT_DELETE_READBACK_FAILED'); resource.deleted = true; manifest.pending = null; journal.save();
    }
    const empty = await client.request('PROPFIND', manifest.href, {headers: {depth: '1', 'content-type': 'application/xml'}, body});
    ensure(empty.status === 207, 'INVENTORY_FAILED'); const emptyRows = verifiedRows(empty.body, manifest.href); ensure(emptyRows.length === 1, 'UNKNOWN_OR_CHANGED_RESOURCE'); ownCalendar(emptyRows[0]!, manifest);
    manifest.pending = 'delete-calendar'; journal.save();
    const removed = await client.request('DELETE', manifest.href); ensure([200, 204].includes(removed.status), 'DELETE_CALENDAR_NOT_CONFIRMED');
    ensure([404, 410].includes((await client.request('PROPFIND', manifest.href, {headers: {depth: '0'}, body})).status), 'CALENDAR_DELETE_READBACK_FAILED');
    manifest.state = 'recovered-empty-calendar-removed'; manifest.pending = null; journal.save();
    return {complete: true, manifestPath: path, outcome: manifest.state};
  } catch (error) {manifest.state = 'stopped-needs-reconciliation'; manifest.failure = safeFailure(error); journal.save(); throw new LifecycleError(error instanceof LifecycleError ? error.code : 'CLEANUP_STOPPED', path);}
  finally {if (credential) {credential.user = ''; credential.appPassword = '';}}
}

/** Shared only by isolated experiment runners; defaults remain fail-closed for personal calendars. */
export const calendarSafety = {canonical, verifiedRows, establishOwner, ownCalendar, privateJournal, safeFailure};
