import {ZodError} from 'zod';
import {randomUUID} from 'node:crypto';
import {MailOperationError,type MailErrorCode} from '../domain/mail.js';
const tools=['mail_request_persistent_access','mail_list_mailboxes','mail_search','mail_read','mail_mark','mail_flag','mail_tag','mail_move','mail_organize','mail_batch','mail_unsubscribe_discover','mail_unsubscribe_submit','mail_send','mail_reply','mail_draft_create','mail_attachment_download','mail_draft_read','mail_draft_edit','mail_draft_send','mail_forward'] as const;
export type OperationTool=typeof tools[number]|'unknown';
const actions=['request_persistent_access','list_mailboxes','search','read','mark','flag','tag','move','organize','trash','archive','junk','not_junk','restore','batch','unsubscribe_discover','unsubscribe_submit','send','reply','draft','attachment_download','draft_read','draft_edit','draft_send','forward'] as const;
export type OperationAction=typeof actions[number]|'unknown';
const errorCodes=['invalid_input','stale_identity','missing','outcome_unknown','unsupported_capability','ambiguous_destination','forbidden','upstream_failure'] as const satisfies readonly MailErrorCode[];
export type OperationOutcome='succeeded'|'rejected'|'partial'|'unknown'|'failed';
export interface OperationCounts {succeeded:number;failed:number;unknown:number;notAttempted:number}
interface EventIdentity {correlationId:string;tool:OperationTool;action:OperationAction;activeCount:number}
export type OperationEvent=(EventIdentity&{event:'started'})|(EventIdentity&{event:'completed';durationMs:number;outcome:OperationOutcome;errorCode?:MailErrorCode;counts?:OperationCounts});
export type OperationSink=(event:OperationEvent)=>void|Promise<void>;
function property(value:unknown,key:string):unknown {
 try{return typeof value==='object'&&value!==null&&key in value?Reflect.get(value,key):undefined;}catch{return undefined;}
}
function errorCode(value:unknown):MailErrorCode|undefined{return errorCodes.find(code=>code===value);}
function actionFor(tool:OperationTool,input:unknown):OperationAction {
 if(tool==='unknown')return 'unknown';
 if(tool==='mail_draft_create')return 'draft';
 if(tool==='mail_organize')return actions.find(action=>['trash','archive','junk','not_junk','restore'].includes(action)&&action===property(input,'action'))??'unknown';
 if(tool==='mail_batch'){
  const action=property(input,'action'),type=property(action,'type');
  if(type==='organize')return actionFor('mail_organize',action);
  return actions.find(action=>['mark','flag','tag','move'].includes(action)&&action===type)??'unknown';
 }
 return actions.find(action=>`mail_${action}`===tool)??'unknown';
}
function describe(result:unknown):{outcome:OperationOutcome;errorCode?:MailErrorCode;counts?:OperationCounts}{
 const status=property(result,'status'),code=errorCode(property(result,'errorCode'));
 const outcome:OperationOutcome=property(result,'isError')===true?'failed':status===undefined?'succeeded'
  :status==='partial'?'partial':status==='unknown'||status==='outcome_unknown'?'unknown':status==='rejected'?'rejected'
   :status==='completed'||status==='submitted'||status==='draft_saved'||status==='succeeded'?'succeeded':'unknown';
 const items=property(result,'items');
 if(!Array.isArray(items))return{outcome,...(code?{errorCode:code}:{})};
 const counts:OperationCounts={succeeded:0,failed:0,unknown:0,notAttempted:0};
 for(const item of items){const state=property(item,'status');if(state==='succeeded')counts.succeeded++;else if(state==='failed')counts.failed++;else if(state==='not_attempted')counts.notAttempted++;else counts.unknown++;}
 return{outcome,...(code?{errorCode:code}:{}),counts};
}
/** Receives raw values only to select fixed enums/counts; never forwards or retains them. */
export class OperationMonitor {
 private active=0;private draining=false;private readonly idleWaiters=new Set<()=>void>();
 constructor(private readonly sink:OperationSink=event=>{console.info(JSON.stringify(event));}){}
 get activeCount():number{return this.active;}
 beginDrain():void{this.draining=true;}
 waitForIdle():Promise<void>{return this.active===0?Promise.resolve():new Promise(resolve=>this.idleWaiters.add(resolve));}
 private emit(event:OperationEvent):void{try{const pending=this.sink(event);if(pending)void Promise.resolve(pending).catch(()=>{});}catch{/* Logging must never change mail outcomes. */}}
 async run<T>(tool:string,input:unknown,operation:()=>Promise<T>):Promise<T>{
  if(this.draining)throw new MailOperationError('upstream_failure','Service draining');
  const identity={correlationId:randomUUID(),tool:tools.find(name=>name===tool)??'unknown',action:'unknown'} satisfies Omit<EventIdentity,'activeCount'>;
  const action=actionFor(identity.tool,input),start=performance.now();this.active++;
  this.emit({...identity,action,event:'started',activeCount:this.active});
  let summary:ReturnType<typeof describe>={outcome:'unknown'};
  try{const result=await operation();try{summary=describe(result);}catch{summary={outcome:'unknown'};}return result;}
  catch(error:unknown){const code=error instanceof ZodError?'invalid_input':errorCode(property(error,'code'))??'upstream_failure';summary={outcome:code==='outcome_unknown'?'unknown':code==='upstream_failure'?'failed':'rejected',errorCode:code};throw error;}
  finally{
   this.active--;this.emit({...identity,action,event:'completed',activeCount:this.active,durationMs:Math.max(0,Math.round(performance.now()-start)),...summary});
   if(this.active===0){for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear();}
  }
 }
}
