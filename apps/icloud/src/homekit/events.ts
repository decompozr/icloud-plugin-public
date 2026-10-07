import {z} from 'zod';
import {HomeKitError} from './provider.js';
import type {EventAddress} from './resources.js';
const sequence=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const event=z.object({session:z.string().uuid(),sequence:sequence.min(1),at:z.string().datetime(),homeId:z.string().uuid(),accessoryId:z.string().uuid(),serviceId:z.string().uuid(),characteristicId:z.string().uuid(),accessoryName:z.string().max(4096),room:z.string().max(4096),serviceName:z.string().max(4096),characteristicType:z.string().max(256),format:z.string().max(256),eventType:z.literal('characteristic_update'),valueAvailable:z.boolean(),semanticTrust:z.literal('provider-value-only'),value:z.union([z.string().max(65536),z.number().finite(),z.boolean(),z.null()])}).strict();
const page=z.object({session:z.string().uuid(),events:z.array(event).max(256),cursor:sequence,headSequence:sequence,hasMore:z.boolean(),gap:z.boolean(),durable:z.boolean(),journalErrors:sequence,semantics:z.literal('raw-characteristic-events'),notificationDelivered:z.literal(false)}).strict();
/** Session-bound cursor: restart is explicit, never silently resets or skips events. */
export function parseEventPage(raw:unknown,address:EventAddress,expectedSession?:string){
 const result=page.parse(raw);
 if(expectedSession&&result.session!==expectedSession)throw new HomeKitError('event_session_changed');
 if(address.after>0&&!expectedSession)throw new HomeKitError('event_session_required');
 let previous=address.after;
 for(const item of result.events){if(item.session!==result.session||item.homeId!==address.homeId||item.accessoryId!==address.accessoryId||item.serviceId!==address.serviceId||item.characteristicId!==address.characteristicId)throw new HomeKitError('foreign_event_result');if(item.sequence<=previous||item.sequence>result.headSequence)throw new HomeKitError('invalid_event_sequence');previous=item.sequence;}
 if(result.cursor!==previous||result.headSequence<result.cursor||result.hasMore&&!result.events.length||result.durable&&result.journalErrors>0)throw new HomeKitError('invalid_event_page');
 return result;
}
