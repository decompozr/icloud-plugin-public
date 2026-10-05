import type {MailExtensionOperations} from './extensions.js';
import {z} from 'zod';
export const messageIdSchema=z.string().max(254).regex(/^<[^\s<>@\x00-\x1f\x7f]+@[^\s<>@\x00-\x1f\x7f]+>$/).refine(value=>/^[\x21-\x7e]+$/.test(value));
export const normalizedAddress=(address:string)=>{const at=address.lastIndexOf('@');return address.slice(0,at)+'@'+address.slice(at+1).toLowerCase();};
const address=z.string().max(254).email().refine(value=>!/[\r\n<>]/.test(value)&&Buffer.byteLength(value,'utf8')<=254);
export const attachmentSchema=z.object({filename:z.string().min(1).max(255).refine(v=>!/[\r\n\0\\/]/.test(v)),contentType:z.string().max(127).regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/),contentBase64:z.string().max(1398104).refine(v=>Buffer.from(v,'base64').toString('base64')===v&&Buffer.from(v,'base64').length<=1048576,'Canonical base64 up to 1 MiB required')}).strict();
export const attachmentsSchema=z.array(attachmentSchema).max(10).refine(v=>v.reduce((n,a)=>n+Buffer.from(a.contentBase64,'base64').length,0)<=1048576,'Total attachments exceed 1 MiB');
export type OutboundAttachment=z.infer<typeof attachmentSchema>;
export const outboundRequestSchema=z.object({operationId:z.string().uuid().describe('UUID operation identifier, for example 550e8400-e29b-41d4-a716-446655440000. Reuse the same UUID only to retrieve the same operation receipt; never use a new UUID to retry an unknown outcome.'),to:z.array(address).min(1).max(20).refine(values=>new Set(values.map(normalizedAddress)).size===values.length,'Duplicate recipients'),subject:z.string().max(998).refine(value=>!/[\r\n\0]/.test(value)&&Buffer.byteLength(value,'utf8')<=998),attachments:attachmentsSchema.optional(),text:z.string().max(100000).refine(value=>!value.includes('\0')&&Buffer.byteLength(value,'utf8')<=100000)}).strict();
export const replyRequestSchema=outboundRequestSchema.extend({target:z.object({accountId:z.string().min(1).max(256).optional(),mailbox:z.string().min(1).max(512).refine(value=>!/[\r\n\0]/.test(value)),uid:z.number().int().positive().max(4294967295),uidValidity:z.string().regex(/^[0-9]+$/)}).strict()});
export type OutboundRequest=z.infer<typeof outboundRequestSchema>;
export type ReplyRequest=z.infer<typeof replyRequestSchema>;
export interface OutboundMessage {to:string[];subject:string;text:string;messageId:string;attachments?:OutboundAttachment[];html?:string;inReplyTo?:string;references?:string[]}
export interface OutboundGateway {
 send(input:OutboundMessage):Promise<{messageId:string;accepted:string[];rejected:string[]}>;
 compose?(input:OutboundMessage):Promise<Uint8Array>;
 draft(input:OutboundMessage,mailbox:string):Promise<{mailbox:string;uid:number;uidValidity:string;messageId:string}>;
}
export const outboundResultSchema=z.object({operationId:z.string().uuid(),messageId:z.string(),status:z.enum(['submitted','partial','rejected','draft_saved','unknown']),replayed:z.boolean(),accepted:z.array(z.string()).optional(),rejected:z.array(z.string()).optional(),errorCode:z.string().optional(),replyTarget:z.object({accountId:z.string().min(1).max(256).optional(),mailbox:z.string(),uid:z.number(),uidValidity:z.string()}).optional(),sourceRetained:z.boolean().optional(),replacementTarget:z.object({accountId:z.string().min(1).max(256).optional(),mailbox:z.string(),uid:z.number().int().positive(),uidValidity:z.string()}).optional(),draftTarget:z.object({accountId:z.string().min(1).max(256).optional(),mailbox:z.string(),uid:z.number().int().positive(),uidValidity:z.string()}).optional()}).strict();
export type OutboundResult=z.infer<typeof outboundResultSchema>;
export interface OutboundLedger {
 claim(operationId:string,digest:string,messageId:string):{fresh:true}|{fresh:false;result:OutboundResult};
 finish(operationId:string,result:OutboundResult):void;
}
export interface OutboundOperations {extensions?:MailExtensionOperations;send(input:OutboundRequest):Promise<OutboundResult>;reply(input:ReplyRequest):Promise<OutboundResult>;draft(input:OutboundRequest):Promise<OutboundResult>}

export const outboundMessageSchema=outboundRequestSchema.omit({operationId:true}).extend({messageId:messageIdSchema,inReplyTo:messageIdSchema.optional(),references:z.array(messageIdSchema).max(31).optional(),html:z.string().max(100000).optional()});
