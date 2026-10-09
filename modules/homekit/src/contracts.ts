import {z} from 'zod';

// M1 provider boundary only. No module registration, principal inference or controls.
const id=z.string().uuid();
const count=z.number().int().nonnegative().max(1000000);
const text=z.string().max(4096);
const jsonValue:z.ZodType<unknown>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number().finite(),z.string().max(65536),z.array(jsonValue).max(256),z.record(jsonValue)]));
const components=z.record(z.union([z.number().int(),z.boolean(),text,z.null()]));
const target=z.discriminatedUnion('resolved',[
 z.object({homeId:id,accessoryId:id,serviceId:id,characteristicId:id,resolved:z.literal(true),format:text.nullable()}).strict(),
 z.object({homeId:id,characteristicId:id,resolved:z.literal(false),reason:text}).strict()
]);
const base={id,providerType:text};
const action=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('characteristicWrite'),opaque:z.literal(false),target,targetValue:jsonValue}).strict(),
 z.object({...base,kind:z.literal('opaque'),opaque:z.literal(true),reason:text}).strict()
]);
const event=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('characteristic'),opaque:z.literal(false),target,triggerValue:jsonValue}).strict(),
 z.object({...base,kind:z.literal('threshold'),opaque:z.literal(false),target,minimum:z.number().nullable(),maximum:z.number().nullable()}).strict(),
 z.object({...base,kind:z.literal('calendar'),opaque:z.literal(false),components}).strict(),
 z.object({...base,kind:z.literal('significantTime'),opaque:z.literal(false),significantEvent:text,offset:components.nullable()}).strict(),
 z.object({...base,kind:z.literal('duration'),opaque:z.literal(false),duration:z.number().finite().nonnegative()}).strict(),
 z.object({...base,kind:z.literal('presence'),opaque:z.literal(false),presenceEventType:z.number().int(),presenceUserType:z.number().int(),identityLimit:text}).strict(),
 z.object({...base,kind:z.enum(['location','opaque']),opaque:z.literal(true),reason:text}).strict()
]);
const capabilityLimit=z.literal('SDK_SURFACE_ONLY_PERMISSION_AND_CALLBACK_ACCEPTANCE_REQUIRED');
export const sceneSchema=z.object({id,homeId:id,name:text,actionSetType:text,listedInHome:z.boolean(),referencedByTriggerIds:z.array(id).max(1000000),executing:z.boolean(),lastExecutionDate:text.nullable(),actions:z.array(action).max(256),actionCount:count,actionsTruncated:z.boolean(),publicAPICapabilities:z.object({execute:z.boolean(),rename:z.boolean(),removeFromHome:z.boolean(),associateWithAnotherTrigger:z.boolean(),editCharacteristicActions:z.boolean()}).strict(),capabilityLimit,definitionCompleteness:z.literal('PUBLIC_API_ONLY_SHORTCUT_INTERNALS_UNAVAILABLE')}).strict();
const triggerBase={...base,homeId:id,name:text,enabled:z.boolean(),sceneIds:z.array(id).max(1000000),definitionCompleteness:z.literal('PUBLIC_API_ONLY'),publicAPICapabilities:z.object({rename:z.boolean(),enable:z.boolean(),remove:z.boolean()}).strict(),capabilityLimit};
export const automationSchema=z.discriminatedUnion('kind',[
 z.object({...triggerBase,kind:z.literal('timer'),fireDate:text,timeZone:text.nullable(),recurrence:components.nullable(),recurrenceCalendar:text.nullable(),deprecatedFields:z.array(text).max(5)}).strict(),
 z.object({...triggerBase,kind:z.literal('event'),activationState:z.number().int(),executeOnce:z.boolean(),events:z.array(event).max(256),endEvents:z.array(event).max(256),eventCount:count,endEventCount:count,eventsTruncated:z.boolean(),recurrences:z.array(components).max(256).nullable(),recurrencesTruncated:z.boolean(),condition:z.discriminatedUnion('kind',[z.object({kind:z.literal('none')}).strict(),z.object({kind:z.literal('opaque'),reason:text}).strict()])}).strict(),
 z.object({...triggerBase,kind:z.literal('opaque'),reason:text}).strict()
]);
export const inventoryRequestSchema=z.object({homeId:id,offset:count.default(0),limit:z.number().int().min(1).max(25).default(25)}).strict();
export const inventoryPageSchema=z.object({schemaVersion:z.literal(1),homeId:id,valueSource:z.literal('provider-object-snapshot'),valuesAreFresh:z.literal(false),offset:count,limit:z.number().int().min(1).max(25),nextOffset:count.nullable(),sceneCount:count,automationCount:count,scenes:z.array(sceneSchema).max(25),automations:z.array(automationSchema).max(25),consistency:z.literal('PAGES_NOT_ATOMIC_RESTART_IF_PROVIDER_CHANGES'),controlsAvailable:z.literal(false)}).strict();
export type AutomationInventoryPage=z.infer<typeof inventoryPageSchema>;
export type HomeScene=z.infer<typeof sceneSchema>;
export type HomeAutomation=z.infer<typeof automationSchema>;
export interface HomeKitReadProvider {automationInventory(request:z.input<typeof inventoryRequestSchema>,signal?:AbortSignal):Promise<AutomationInventoryPage>}

/** Caller supplies the enrolled home, never a principal from tool arguments. */
export function parseInventoryPage(value:unknown,request:z.input<typeof inventoryRequestSchema>):AutomationInventoryPage {
 const expected=inventoryRequestSchema.parse(request);
 const page=inventoryPageSchema.parse(value);
 if(page.homeId!==expected.homeId||page.offset!==expected.offset||page.limit!==expected.limit)throw Error('HOMEKIT_RESPONSE_BINDING_MISMATCH');
 const total=Math.max(page.sceneCount,page.automationCount);
 const next=page.offset+page.limit<total?page.offset+page.limit:null;
 if(page.nextOffset!==next||page.scenes.length!==Math.min(page.limit,Math.max(0,page.sceneCount-page.offset))||page.automations.length!==Math.min(page.limit,Math.max(0,page.automationCount-page.offset)))throw Error('HOMEKIT_PAGE_INCONSISTENT');
 const ids=new Set<string>();
 for(const resource of [...page.scenes,...page.automations]){
  if(resource.homeId!==expected.homeId||ids.has(resource.id))throw Error('HOMEKIT_RESOURCE_BINDING_MISMATCH');
  ids.add(resource.id);
 }
 function validateTargets(entries:Array<{id:string;target?:z.infer<typeof target>}>) {
  for(const entry of entries)if(entry.target&&entry.target.homeId!==expected.homeId)throw Error('HOMEKIT_REFERENCE_HOME_MISMATCH');
 }
 for(const scene of page.scenes){
  if(scene.actions.length!==Math.min(256,scene.actionCount)||scene.actionsTruncated!==(scene.actionCount>256))throw Error('HOMEKIT_ACTION_COUNT_MISMATCH');
  validateTargets(scene.actions);
 }
 for(const trigger of page.automations)if(trigger.kind==='event'){
  if(trigger.events.length!==Math.min(256,trigger.eventCount)||trigger.endEvents.length!==Math.min(256,trigger.endEventCount)||trigger.eventsTruncated!==(trigger.eventCount>256||trigger.endEventCount>256))throw Error('HOMEKIT_EVENT_COUNT_MISMATCH');
  validateTargets([...trigger.events,...trigger.endEvents]);
 }
 return page;
}

/** Conservative prerequisite for later editing; not provider permission or ownership proof. */
export function definitionReadBlockers(resource:HomeScene|HomeAutomation):string[]{
 const reasons:string[]=[];
 if('actions' in resource){
  if(resource.actionsTruncated)reasons.push('TRUNCATED_ACTIONS');
  for(const action of resource.actions){if(action.opaque)reasons.push('OPAQUE_ACTION');else if(!action.target.resolved)reasons.push('UNRESOLVED_REFERENCE');}
 }else if(resource.kind==='opaque')reasons.push('OPAQUE_TRIGGER');
 else if(resource.kind==='event'){
  if(resource.eventsTruncated||resource.recurrencesTruncated)reasons.push('TRUNCATED_EVENTS_OR_RECURRENCES');
  if(resource.condition.kind==='opaque')reasons.push('OPAQUE_CONDITION');
  for(const event of [...resource.events,...resource.endEvents]){if(event.opaque)reasons.push('OPAQUE_EVENT');else if('target' in event&&!event.target.resolved)reasons.push('UNRESOLVED_REFERENCE');}
 }
 return [...new Set(reasons)];
}
