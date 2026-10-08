import {ZodError} from 'zod';
import type {MailErrorCode} from './domain/mail.js';
import type {OperationClassifier,OperationOutcome,OperationCounts} from './ports.js';
const tools=['mail_request_persistent_access','mail_list_mailboxes','mail_search','mail_read','mail_mark','mail_flag','mail_tag','mail_move','mail_organize','mail_batch','mail_unsubscribe_discover','mail_unsubscribe_submit','mail_send','mail_reply','mail_draft_create','mail_attachment_download','mail_draft_read','mail_draft_edit','mail_draft_send','mail_forward'] as const;
type OperationTool=typeof tools[number]|'unknown';
const actions=['request_persistent_access','list_mailboxes','search','read','mark','flag','tag','move','organize','trash','archive','junk','not_junk','restore','batch','unsubscribe_discover','unsubscribe_submit','send','reply','draft','attachment_download','draft_read','draft_edit','draft_send','forward'] as const;
type OperationAction=typeof actions[number]|'unknown';
const errorCodes=['invalid_input','stale_identity','missing','outcome_unknown','unsupported_capability','ambiguous_destination','forbidden','upstream_failure'] as const satisfies readonly MailErrorCode[];
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

export const mailOperationClassifier:OperationClassifier={tools,actions,errorCodes,action:(tool,input)=>actionFor(tool as OperationTool,input),result:describe,error:(error)=>{const code=error instanceof ZodError?'invalid_input':errorCode(property(error,'code'))??'upstream_failure';return{outcome:code==='outcome_unknown'?'unknown':code==='upstream_failure'?'failed':'rejected',errorCode:code};}};
