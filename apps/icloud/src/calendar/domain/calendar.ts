import type {DateValue, Fields, Policy} from './codec.js';
export type {DateValue, Fields, Policy} from './codec.js';
export type CalendarPolicy = {read: boolean; write: boolean; schedule: boolean; share: boolean};
export type CalendarErrorCode = 'invalid_input' | 'not_found' | 'forbidden' | 'conflict' | 'unsupported' | 'outcome_unknown' | 'provider_error';
export class CalendarError extends Error {
  constructor(public readonly code: CalendarErrorCode, message: string, public readonly dispatched = false, public readonly definitive = false) {super(message); this.name = 'CalendarError';}
}
export type EventIdentity = {accountId?:string;calendarHref: string; href: string; uid: string; etag: string; scheduleTag?: string};
export type CalendarEvent = EventIdentity & {ical: string; summary: string; scheduled: boolean};
export type CalendarCollection = {href: string; name: string; etag?: string};
export type CalendarSnapshot = {token: string; resources: Record<string, {etag: string; data: string}>};
export type CreateEventInput = {uid?: string; fields: Fields & {start: DateValue; end: DateValue}; recurrence?: {frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; count: number; byDay?: string[]}; timezone?: string; timePolicy?: Policy};
export type CalendarCommand =
 | {operation: 'list_calendars'}
 | {operation: 'create_calendar'; name: string; collectionId?: string}
 | {operation: 'update_calendar'; calendarHref: string; name: string; etag: string}
 | {operation: 'delete_calendar'; calendarHref: string; etag: string; confirmDeleteAllEvents: true}
 | {operation: 'query_events'; calendarHref: string; start: string; end: string; text?: string}
 | {operation: 'availability'; calendarHref: string; start: string; end: string; timePolicy?: Policy}
 | {operation: 'get_event'; calendarHref: string; href: string}
 | ({operation: 'create_event'; calendarHref: string} & CreateEventInput)
 | {operation: 'update_event'; identity: EventIdentity; fields: Fields; recurrenceId?: DateValue; timePolicy?: Policy}
 | {operation: 'delete_event'; identity: EventIdentity; recurrenceId?: DateValue; timePolicy?: Policy}
 | {operation: 'sync'; calendarHref: string; previous?: CalendarSnapshot}
 | ({operation: 'invite'; calendarHref: string; attendees: string[]} & CreateEventInput)
 | {operation: 'respond'; identity: EventIdentity; participation: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'}
 | {operation: 'inspect_sharing'; calendarHref: string}
 | {operation: 'share'; calendarHref: string; sharee: string; access: 'read' | 'read-write' | 'remove'};
export type CalendarResult = {operation: CalendarCommand['operation']; concurrency?: 'preflight-only'; calendars?: CalendarCollection[]; calendar?: CalendarCollection; events?: CalendarEvent[]; event?: CalendarEvent; snapshot?: CalendarSnapshot; deleted?: boolean; busy?: {start: string; end: string}[]; sharing?: {supported: boolean; members: {address: string; access: string; status: string}[]; reason?: string}};
/** The service is responsible for authorization and durable write intent. Adapter never retries writes. */
export type BeforeCalendarDispatch = (context: {scheduled: boolean; mutation?: boolean}) => void;
export interface CalendarGateway {execute(command: CalendarCommand, beforeDispatch?: BeforeCalendarDispatch): Promise<CalendarResult>}
export function isCalendarMutation(command: CalendarCommand): boolean {return !['list_calendars','query_events','get_event','sync','inspect_sharing','availability'].includes(command.operation);}
