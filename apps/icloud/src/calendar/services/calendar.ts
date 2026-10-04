import {createHash} from 'node:crypto';
import {CalendarError,isCalendarMutation,type CalendarCommand,type CalendarGateway,type CalendarResult,type CalendarSnapshot} from '../domain/calendar.js';
import type {CalendarLedger,CalendarOperation,CalendarPolicy} from '../storage/ledger.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';}
export class CalendarService {
 private get identity(){return {ownerId:this.options.ownerId,accountId:this.options.accountId};}
 constructor(private options:{ownerId:string;accountId:string;requireAccountIdentity?:boolean;gateway:CalendarGateway;ledger:CalendarLedger;access:()=>CalendarPolicy}){if(!options.ownerId||!options.accountId)throw new CalendarError('forbidden','Verified owner and account are required');this.options={...options};}
 private allowed(command:CalendarCommand,scheduled=false){const p=this.options.access();if(!p.read||(isCalendarMutation(command)&&!p.write)||((scheduled||command.operation==='invite'||command.operation==='respond')&&!p.schedule)||((command.operation==='share'||command.operation==='inspect_sharing')&&(!p.share||!p.write)))throw new CalendarError('forbidden','Calendar operation is disabled');}
 operationStatus(operationId:string):Pick<CalendarOperation,'operationId'|'state'|'error'|'updatedAt'>|undefined {this.allowed({operation:'list_calendars'});if(!uuid.test(operationId))throw new CalendarError('invalid_input','operationId must be a UUID');const row=this.options.ledger.operation(this.identity,operationId);return row?{operationId:row.operationId,state:row.state,error:row.error,updatedAt:row.updatedAt}:undefined;}
 async execute(command:CalendarCommand,operationId?:string):Promise<CalendarResult> {
  if('identity'in command&&((command.identity.accountId!==undefined&&command.identity.accountId!==this.options.accountId)||(this.options.requireAccountIdentity&&command.identity.accountId!==this.options.accountId)))throw new CalendarError('forbidden','Event reference belongs to another account or needs a fresh account-bound read');
  this.allowed(command);
  if(!isCalendarMutation(command)) {
   if(command.operation!=='sync')return this.options.gateway.execute(command,()=>this.allowed(command));
   // Always resume from durable state. The complete snapshot is persisted with its token.
   const previous=this.options.ledger.sync(this.identity,command.calendarHref);
   const result=await this.options.gateway.execute({...command,previous:previous?.snapshot as CalendarSnapshot|undefined},()=>this.allowed(command));
   this.allowed(command);
   if(!result.snapshot)throw new CalendarError('provider_error','Incomplete sync response');
   this.options.ledger.commitSync(this.identity,command.calendarHref,previous?.token,{token:result.snapshot.token,snapshot:result.snapshot,changes:[result]});
   return result;
  }
  if(!operationId||!uuid.test(operationId))throw new CalendarError('invalid_input','Mutations require a UUID operationId');
  if((command.operation==='create_event'||command.operation==='invite')&&!command.uid)command={...command,uid:operationId};
  if(command.operation==='create_calendar')command={...command,collectionId:operationId};
  const fingerprint=createHash('sha256').update(canonical(command)).digest('hex');
  let existing=this.options.ledger.operation(this.identity,operationId);
  if(existing)return this.existing(existing,fingerprint);
  // Read-only scope discovery happens before reserving the operation ID for consent retry.
   if('identity' in command){const event=(await this.options.gateway.execute({operation:'get_event',calendarHref:command.identity.calendarHref,href:command.identity.href},()=>this.allowed(command))).event;if(!event)throw new CalendarError('not_found','Event not found');if(event.uid!==command.identity.uid||event.etag!==command.identity.etag)throw new CalendarError('conflict','Event changed');this.allowed(command,event.scheduled);}
   this.allowed(command);
  const record:CalendarOperation={operationId,fingerprint,command,state:'intent',updatedAt:new Date().toISOString()};
  if(!this.options.ledger.begin(this.identity,record)){existing=this.options.ledger.operation(this.identity,operationId);if(!existing)throw new CalendarError('provider_error','Operation ledger unavailable');return this.existing(existing,fingerprint);}
  let dispatched=false;
  try {
   const result=await this.options.gateway.execute(command,context=>{this.allowed(command,context.scheduled);if(context.mutation===false)return;this.options.ledger.save(this.identity,{...record,state:'dispatched',updatedAt:new Date().toISOString()});dispatched=true;});
   // Adapters must invoke the dispatch hook. Fail closed if an implementation violates the contract.
   if(!dispatched)throw new CalendarError('outcome_unknown','Provider did not report dispatch',true);
   this.options.ledger.save(this.identity,{...record,state:'succeeded',result,updatedAt:new Date().toISOString()});
   return result;
  }catch(error){const unknown=!(error instanceof CalendarError&&error.definitive)&&(dispatched||error instanceof CalendarError&&error.dispatched);try{this.options.ledger.save(this.identity,{...record,state:unknown?'outcome_unknown':'failed',error:unknown?'outcome_unknown':error instanceof CalendarError?error.code:'provider_error',updatedAt:new Date().toISOString()});}catch{/* Durable dispatched intent remains non-replayable. */}if(unknown)throw new CalendarError('outcome_unknown','Inspect operation status before taking further action',true);throw error;}
 }
 private existing(record:CalendarOperation,fingerprint:string):CalendarResult {if(record.fingerprint!==fingerprint)throw new CalendarError('conflict','operationId belongs to a different command');if(record.state==='succeeded')return record.result as CalendarResult;throw new CalendarError(record.state==='failed'?'conflict':'outcome_unknown','Operation already recorded; it will not be replayed',record.state!=='failed');}
 /** Read-only evidence, never inference of failure from absence or provider normalization. */
 async reconcile(operationId:string):Promise<{operation:CalendarOperation;evidence?:CalendarResult}> {
  this.operationStatus(operationId);
  const operation=this.options.ledger.operation(this.identity,operationId);
  if(!operation)throw new CalendarError('not_found','Operation not found');
  const command=operation.command as CalendarCommand;this.allowed(command);
  const read=(query:CalendarCommand)=>this.options.gateway.execute(query,()=>this.allowed(command));
  let evidence:CalendarResult|undefined;
  if('identity' in command)evidence=await read({operation:'get_event',calendarHref:command.identity.calendarHref,href:command.identity.href});
  else if((command.operation==='create_event'||command.operation==='invite')&&command.uid)evidence=await read({operation:'get_event',calendarHref:command.calendarHref,href:new URL(encodeURIComponent(command.uid)+'.ics',command.calendarHref).href});
  else if(command.operation==='share')evidence=await read({operation:'inspect_sharing',calendarHref:command.calendarHref});
  else evidence=await read({operation:'list_calendars'});
  this.allowed(command);
  return {operation,evidence};
 }
}
