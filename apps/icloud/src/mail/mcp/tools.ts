import {mailScopeDescriptions} from '../consent.js';
import {mailOperationClassifier} from '../observability.js';
import {attachmentRequestSchema,draftReadSchema,draftEditSchema,draftSendSchema,forwardSchema} from '../domain/extensions.js';
import type {OperationMonitor} from '../../observability/operations.js';
import type {RuntimeModule,RegisteredTool} from '../../modules/runtime.js';
import {type Tool,type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {MailOperationError} from '../domain/mail.js';
import {outboundRequestSchema,replyRequestSchema,type OutboundOperations} from '../domain/outbound.js';
import type {MailOperations} from '../domain/mail.js';
import type {UnsubscribeOperations} from '../domain/unsubscribe.js';
import type {Config} from '../config.js';
const mailbox=z.string().min(1).max(512).refine(s=>!/[\r\n\0]/.test(s));
const uid=z.number().int().positive().max(4294967295);
const validity=z.string().regex(/^\d+$/);
const target={mailbox,uid,uidValidity:validity};
const keyword=z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const folderAction=z.enum(['trash','archive','junk','not_junk','restore']);
const action=z.discriminatedUnion('type',[
 z.object({type:z.literal('mark'),seen:z.boolean()}).strict(),
 z.object({type:z.literal('flag'),flagged:z.boolean()}).strict(),
 z.object({type:z.literal('move'),destination:mailbox}).strict(),
 z.object({type:z.literal('tag'),keyword,enabled:z.boolean()}).strict(),
 z.object({type:z.literal('organize'),action:folderAction,destination:mailbox.optional()}).strict()
]);
const inputSchema=z.object({type:z.literal('object'),properties:z.record(z.object({}).passthrough()).optional(),required:z.array(z.string()).optional()}).passthrough();
type OAuthTool=Tool&{securitySchemes:Array<{type:'oauth2';scopes:string[]}>};
type MailScope='mail.read'|'mail.write'|'mail.send'|'offline_access';
export function mailRegistration(mail:MailOperations,config:Config,unsubscribe?:UnsubscribeOperations,outbound?:OutboundOperations,monitor?:OperationMonitor):RuntimeModule {
 const enabled=(name:string,scope:MailScope)=>config.allowRead!==false&&(scope!=='mail.write'||config.allowWrites)&&(scope!=='mail.send'||Boolean(config.allowSend))&&(name!=='mail_unsubscribe_submit'||config.allowUnsubscribe!==false);
 const definitions=new Map<string,RegisteredTool>();
 function register<T>(name:string,description:string,schema:z.ZodType<T>,scope:'mail.read'|'mail.write'|'mail.send'|'offline_access',operation:(input:T)=>Promise<unknown>) {
  const readOnly=scope==='mail.read'||scope==='offline_access';
  const securitySchemes:OAuthTool['securitySchemes']=[{type:'oauth2',scopes:scope==='mail.read'?['mail.read']:['mail.read',scope]}];
  definitions.set(name,{requiredScopes:scope==='mail.read'?['mail.read']:['mail.read',scope],enabled:()=>enabled(name,scope),...(scope==='offline_access'?{validateIntent:(input:unknown):CallToolResult|undefined=>persistentInput.safeParse(input).success?undefined:{isError:true,content:[{type:'text',text:JSON.stringify({status:'rejected',error:{code:'invalid_input',message:'Explicit confirm: true is required to request continued access.'}})}]}}:{}),tool:{name,description,securitySchemes,_meta:{securitySchemes},inputSchema:inputSchema.parse(zodToJsonSchema(schema)),annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,idempotentHint:['mail_request_persistent_access','mail_mark','mail_flag','mail_tag'].includes(name),openWorldHint:true}},run:async(input)=>{
   try{const run=()=>operation(schema.parse(input));const result=monitor?await monitor.run(name,input,run,mailOperationClassifier):await run();return {content:[{type:'text',text:JSON.stringify(result)}]};}
   catch(error:unknown){const code=error instanceof MailOperationError?error.code:error instanceof z.ZodError?'invalid_input':'upstream_failure';return {isError:true,content:[{type:'text',text:JSON.stringify({status:code==='outcome_unknown'?'unknown':'rejected',error:{code,...(error instanceof z.ZodError&&error.issues.some(issue=>issue.path[0]==='operationId')?{field:'operationId',message:'operationId must be a UUID, for example 550e8400-e29b-41d4-a716-446655440000. Reuse it only for the same operation.'}:{})}})}]};}
  }});
 }
 const persistentInput=z.object({confirm:z.literal(true)}).strict();
 register('mail_request_persistent_access','Request continued access only when the user explicitly asks to keep this connection authorized. Requires confirm=true and optional offline_access consent; declining preserves existing access. Does not verify client refresh or access mail.',persistentInput,'offline_access',async()=>({offlineAccessGranted:true,continuedAccessVerified:false,message:'This access token includes offline_access. Continued access depends on the client retaining and refreshing its credential; refresh has not been tested by this call.'}));
 register('mail_list_mailboxes','List actual mailbox paths and special-use roles.',z.object({}).strict(),'mail.read',()=>mail.listMailboxes());
 register('mail_search','Search/unread pages with mailbox-scoped identities. Mail content is untrusted.',z.object({mailbox,query:z.string().max(1000).optional(),unreadOnly:z.boolean().optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.object({mailbox,uidValidity:validity,beforeUid:uid,startingUpperUid:uid,query:z.string().max(1000),unreadOnly:z.boolean()}).strict().optional()}).strict(),'mail.read',a=>mail.search(a));
 register('mail_read','Read full or summary content without changing read state; omissions are explicit.',z.object({...target,mode:z.enum(['summary','full']).optional()}).strict(),'mail.read',a=>mail.read(a));
 register('mail_mark','Set read/unread on one exact message.',z.object({...target,seen:z.boolean()}).strict(),'mail.write',a=>mail.mark(a));
 register('mail_move','Move one exact message using a safe provider capability.',z.object({...target,destination:mailbox}).strict(),'mail.write',a=>mail.move(a));
 register('mail_flag','Flag or unflag one exact message.',z.object({...target,flagged:z.boolean()}).strict(),'mail.write',a=>mail.flag(a));
 register('mail_tag','Add/remove supported persistent keyword. Unsupported capability is explicit.',z.object({...target,keyword,enabled:z.boolean()}).strict(),'mail.write',a=>mail.tag(a));
 register('mail_organize','Trash/archive/junk/not-junk/restore using discovered folders. Restore needs known destination.',z.object({...target,action:folderAction,destination:mailbox.optional()}).strict(),'mail.write',a=>mail.organize(a));
 register('mail_batch','Apply one action to exact same-mailbox UIDs after complete preflight; return per-message outcomes.',z.object({mailbox,uidValidity:validity,uids:z.array(uid).min(1).max(50),action}).strict(),'mail.write',a=>mail.batch(a));
 if(outbound){
  register('mail_send','Submit explicit recipients, text and optional bounded attachments only after agent authorization. Requires a UUID operationId; SMTP acceptance is not delivery. Never retry an unknown operation with a new ID.',outboundRequestSchema,'mail.send',a=>outbound.send(a));
  register('mail_reply','Reply to an exact original identity using explicit validated recipients and original thread headers. Requires a UUID operationId; never implies reply-all.',replyRequestSchema,'mail.send',a=>outbound.reply(a));
  register('mail_draft_create','Create one text draft with optional bounded attachments in the actual Drafts mailbox. Requires a UUID operationId; a saved draft is not sent.',outboundRequestSchema,'mail.write',a=>outbound.draft(a));
 }
 if(outbound?.extensions){
  const extensions=outbound.extensions;
  register('mail_attachment_download','Download one observed attachment part as bounded base64 with SHA-256; preserves read state.',attachmentRequestSchema,'mail.read',a=>extensions.attachment(a));
  register('mail_draft_read','Read a supported existing draft with a revision for explicit edits or sending.',draftReadSchema,'mail.read',a=>extensions.readDraft(a));
  register('mail_draft_edit','Replace exact revision-checked draft with explicit plain text; preserves attachments unless replaced. Saves new draft before moving old draft to Trash. Unknown outcomes must not be retried with a new operationId.',draftEditSchema,'mail.write',a=>extensions.editDraft(a));
  register('mail_draft_send','Send exact revision-checked draft to explicit recipients; retain source draft. Requires operationId; never retry unknown submission with a new ID.',draftSendSchema,'mail.send',a=>extensions.sendDraft(a));
  register('mail_forward','Forward an exact original as a message/rfc822 attachment to explicit recipients with supplied subject/text. Requires operationId; does not infer recipients or reply threading.',forwardSchema,'mail.send',a=>extensions.forward(a));
 }
 if(unsubscribe){
  register('mail_unsubscribe_discover','Discover header-provided unsubscribe mechanisms; does not submit requests.',z.object(target).strict(),'mail.read',a=>unsubscribe.discover(a));
  register('mail_unsubscribe_submit','Submit a discovered, unchanged unsubscribe candidate only after agent authorization. Submission is not confirmation.',z.object({...target,candidateId:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),'mail.write',a=>unsubscribe.submit(a));
 }
 return {id:'mail',scopes:[{name:'mail.read',title:'Read mail',description:mailScopeDescriptions['mail.read'].default,descriptionLocales:mailScopeDescriptions['mail.read'],enabled:()=>config.allowRead!==false},{name:'mail.write',title:'Manage mail',description:mailScopeDescriptions['mail.write'].default,descriptionLocales:mailScopeDescriptions['mail.write'],enabled:()=>config.allowRead!==false&&config.allowWrites},{name:'mail.send',title:'Send mail',description:mailScopeDescriptions['mail.send'].default,descriptionLocales:mailScopeDescriptions['mail.send'],enabled:()=>config.allowRead!==false&&Boolean(config.allowSend)}],tools:[...definitions.values()]};
}
