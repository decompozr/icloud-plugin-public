import {z} from 'zod';
const id=z.string().uuid(),revision=z.string().regex(/^[a-f0-9]{64}$/);
const name=z.string().min(1).refine(value=>value.trim().length>0&&Buffer.byteLength(value)<=120);
const target=z.object({accessoryId:id,serviceId:id,characteristicId:id}).strict();
const value=z.union([z.boolean(),z.number().finite(),z.string(),z.array(z.unknown()),z.record(z.unknown())]);
export const lifecycleEventSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('calendar'),hour:z.number().int().min(0).max(23),minute:z.number().int().min(0).max(59),timeZone:z.string().min(1).max(100).nullable()}).strict(),
 z.object({kind:z.literal('characteristic'),target,value}).strict()
]);
const updateEvent=z.union([
 z.object({kind:z.literal('calendar'),eventId:id,hour:z.number().int().min(0).max(23),minute:z.number().int().min(0).max(59),timeZone:z.string().min(1).max(100).nullable()}).strict(),
 z.object({kind:z.literal('characteristic'),eventId:id,target,value}).strict()
]);
const common={homeId:id,operationId:id};
const exact={...common,kind:z.enum(['scene','automation']),resourceId:id,expectedRevision:revision};
/** All triggers stay disabled; no executable predicates, enable or scene execution. */
export const lifecycleMutationSchema=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('createScene'),name}).strict(),
 z.object({...common,action:z.literal('createAutomation'),name,events:z.array(lifecycleEventSchema).min(1).max(16)}).strict(),
 z.object({...exact,action:z.literal('rename'),name}).strict(),
 z.object({...exact,kind:z.literal('scene'),action:z.literal('addAction'),target,value}).strict(),
 z.object({...exact,kind:z.literal('scene'),action:z.literal('updateAction'),actionId:id,value}).strict(),
 z.object({...exact,kind:z.literal('scene'),action:z.literal('removeAction'),actionId:id}).strict(),
 z.object({...exact,kind:z.literal('automation'),action:z.literal('updateEvents'),events:z.array(z.union([updateEvent,lifecycleEventSchema])).min(1).max(16)}).strict(),
 z.object({...exact,kind:z.literal('automation'),action:z.literal('linkScene'),sceneId:id}).strict(),
 z.object({...exact,kind:z.literal('automation'),action:z.literal('unlinkScene'),sceneId:id}).strict(),
 z.object({...exact,action:z.literal('delete')}).strict()
]);
export type LifecycleMutation=z.infer<typeof lifecycleMutationSchema>;
