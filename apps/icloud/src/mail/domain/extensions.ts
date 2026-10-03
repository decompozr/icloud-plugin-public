import {z} from 'zod';
import {outboundRequestSchema} from './outbound.js';
export const targetSchema=z.object({mailbox:z.string().min(1).max(512).refine(v=>!/[\r\n\0]/.test(v)),uid:z.number().int().positive().max(4294967295),uidValidity:z.string().regex(/^[0-9]+$/)}).strict();
export const attachmentRequestSchema=z.object({target:targetSchema,partId:z.string().regex(/^[1-9][0-9]*(\.[1-9][0-9]*)*$/).max(128)}).strict();
export const draftReadSchema=z.object({target:targetSchema}).strict();
export const draftEditSchema=outboundRequestSchema.extend({target:targetSchema,revision:z.string().regex(/^[a-f0-9]{64}$/)});
export const draftSendSchema=outboundRequestSchema.pick({operationId:true,to:true}).extend({target:targetSchema,revision:z.string().regex(/^[a-f0-9]{64}$/)});
export const forwardSchema=outboundRequestSchema.extend({target:targetSchema});
export interface MailExtensionOperations {
 attachment(input:z.infer<typeof attachmentRequestSchema>):Promise<unknown>;
 readDraft(input:z.infer<typeof draftReadSchema>):Promise<unknown>;
 editDraft(input:z.infer<typeof draftEditSchema>):Promise<unknown>;
 sendDraft(input:z.infer<typeof draftSendSchema>):Promise<unknown>;
 forward(input:z.infer<typeof forwardSchema>):Promise<unknown>;
}
