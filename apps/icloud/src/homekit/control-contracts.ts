import {z} from 'zod';
export const controlValueSchema=z.union([
 z.boolean(),z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),z.string().max(4096),
 z.object({base64:z.string().max(8192).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict(),
 z.object({decimal:z.string().regex(/^(0|[1-9][0-9]{0,19})$/).refine(v=>BigInt(v)<=18446744073709551615n)}).strict(),
]);
const common={homeId:z.string().uuid(),operationId:z.string().uuid()};
/** One exact target, bounded primitive/binary values; array/dictionary writes deferred. */
export const controlCommandSchema=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('write'),accessoryId:z.string().uuid(),serviceId:z.string().uuid(),characteristicId:z.string().uuid(),value:controlValueSchema}).strict(),
 z.object({...common,action:z.literal('executeScene'),sceneId:z.string().uuid()}).strict(),
 z.object({...common,action:z.literal('setAutomationEnabled'),automationId:z.string().uuid(),enabled:z.boolean()}).strict(),
]);
export type ControlCommand=z.infer<typeof controlCommandSchema>;
export type ControlIntent=ControlCommand & {expectedRevision:string};
export const controlReferenceSchema=z.object({homeId:z.string().uuid(),planId:z.string().uuid()}).strict();
export const controlApplySchema=controlReferenceSchema.extend({confirm:z.literal(true)}).strict();
export const controlPreviewSchema=z.object({homeId:z.string().uuid(),operationId:z.string().uuid(),revision:z.string().regex(/^[a-f0-9]{64}$/),definition:z.record(z.unknown()),physicalCompletionVerified:z.literal(false)}).strict();
export const controlResponseSchema=z.object({isError:z.boolean(),payload:z.record(z.unknown())}).strict();
/** Stable comparison for persisted JSON and native intent identities. */
export function canonicalControl(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonicalControl).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonicalControl(v)).join(',')+'}';
 return JSON.stringify(value);
}

export function parseControlPreview(raw:unknown,command:ControlCommand){
 const preview=controlPreviewSchema.parse(raw);
 if(Buffer.byteLength(JSON.stringify(preview))>65536)throw Error('Control preview size limit');
 const d=preview.definition;
 if(preview.homeId!==command.homeId||preview.operationId!==command.operationId||d.homeId!==command.homeId)throw Error('Control preview identity mismatch');
 if(command.action==='write'){
  for(const key of ['accessoryId','serviceId','characteristicId'] as const)if(d[key]!==command[key])throw Error('Control preview target mismatch');
 }else if(d.id!==(command.action==='executeScene'?command.sceneId:command.automationId))throw Error('Control preview resource mismatch');
 return preview;
}
