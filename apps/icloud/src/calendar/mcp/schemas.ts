import {z} from 'zod';
const text=z.string().max(8192), href=z.string().url().max(2048), etag=z.string().min(1).max(512);
export const operationId=z.string().uuid();
const date=z.object({value:z.string().min(10).max(40),tzid:z.string().max(128).optional()}).strict();
const timePolicy=z.object({date:z.literal('utc').optional(),floating:z.literal('utc').optional()}).strict();
const fields=z.object({summary:z.string().max(1000).optional(),description:text.nullable().optional(),location:text.nullable().optional(),url:href.nullable().optional(),categories:z.array(z.string().max(128)).max(100).optional(),status:z.enum(['TENTATIVE','CONFIRMED','CANCELLED']).optional(),transparency:z.enum(['OPAQUE','TRANSPARENT']).optional(),start:date.optional(),end:date.optional(),alarms:z.array(z.object({minutesBefore:z.number().int().min(0).max(525600),description:z.string().max(1000)}).strict()).max(10).optional()}).strict();
const identity=z.object({accountId:z.string().min(1).max(256).optional().describe('Account identity returned with the event; preserve it when reusing an event reference.'),calendarHref:href,href,uid:z.string().min(1).max(512),etag,scheduleTag:z.string().max(512).optional()}).strict();
const create={timezone:z.string().min(1).max(32768).optional(),calendarHref:href,uid:z.string().min(1).max(512).optional(),fields:fields.extend({start:date,end:date}),recurrence:z.object({frequency:z.enum(['DAILY','WEEKLY','MONTHLY']),count:z.number().int().min(1).max(1000),byDay:z.array(z.string().regex(/^[+-]?[0-9]{0,2}(MO|TU|WE|TH|FR|SA|SU)$/)).max(31).optional()}).strict().optional(),timePolicy:timePolicy.optional()};
// Adapter accepts only a bounded standalone VTIMEZONE; arbitrary event components are rejected.
export const commandSchemas={
 availability:z.object({calendarHref:href,start:z.string().max(40),end:z.string().max(40),timePolicy:timePolicy.optional()}).strict(),
 list_calendars:z.object({}).strict(),
 create_calendar:z.object({operationId,name:z.string().min(1).max(255)}).strict(),
 update_calendar:z.object({operationId,calendarHref:href,name:z.string().min(1).max(255),etag}).strict(),
 delete_calendar:z.object({operationId,calendarHref:href,etag,confirmDeleteAllEvents:z.literal(true).describe('Delete all current contents, including concurrently added events; collection revision checks are not atomic on iCloud.')}).strict(),
 query_events:z.object({calendarHref:href,start:z.string().max(40),end:z.string().max(40),text:z.string().max(1000).optional()}).strict(),
 get_event:z.object({calendarHref:href,href}).strict(),
 create_event:z.object({operationId,...create}).strict(),
 update_event:z.object({operationId,identity,fields,recurrenceId:date.optional(),timePolicy:timePolicy.optional()}).strict(),
 delete_event:z.object({operationId,identity,recurrenceId:date.optional(),timePolicy:timePolicy.optional()}).strict(),
 sync:z.object({calendarHref:href}).strict(),
 invite:z.object({operationId,...create,attendees:z.array(z.string().email().max(320)).min(1).max(50)}).strict(),
 respond:z.object({operationId,identity,participation:z.enum(['ACCEPTED','TENTATIVE','DECLINED'])}).strict(),
 inspect_sharing:z.object({calendarHref:href}).strict(),
 share:z.object({operationId,calendarHref:href,sharee:z.string().email().max(320),access:z.enum(['read','read-write','remove'])}).strict(),
};
