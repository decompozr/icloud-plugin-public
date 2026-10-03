import {MailExtensions} from './extensions.js';
import {createHash} from 'node:crypto';
import {simpleParser} from 'mailparser';
import {MailOperationError,type MailGateway,type MailTarget} from '../domain/mail.js';
import {outboundRequestSchema,replyRequestSchema,messageIdSchema,normalizedAddress,type OutboundRequest,type ReplyRequest,type OutboundResult,type OutboundGateway,type OutboundLedger,type OutboundMessage,type OutboundOperations} from '../domain/outbound.js';
export class OutboundService implements OutboundOperations {
 readonly extensions:MailExtensions;
 constructor(private readonly policy:{allowRead?:boolean;allowSend:boolean;allowWrites:boolean},private readonly mail:MailGateway,private readonly provider:OutboundGateway,private readonly ledger:OutboundLedger,private readonly revisionNamespace?:()=>string){this.extensions=new MailExtensions(policy,mail,provider,ledger,revisionNamespace);}
 private permitted(kind:'send'|'reply'|'draft'){
  if(kind==='draft'?!this.policy.allowWrites:!this.policy.allowSend)throw new MailOperationError('forbidden','This outbound operation is disabled');
 }
 private async thread(target:MailTarget,to:string[]):Promise<{inReplyTo:string;references:string[]}>{
  return this.mail.withSession(async session=>{
   const lease=await session.select(target.mailbox,{readOnly:true});
   try{
    if(lease.uidValidity!==target.uidValidity)throw new MailOperationError('stale_identity','Original mailbox identity changed');
    if(!session.headers)throw new MailOperationError('unsupported_capability','Bounded original headers unavailable');
    const source=await session.headers(target.uid,65537);
    if(!source)throw new MailOperationError('missing','Original message not found');
    if(source.byteLength>65536)throw new MailOperationError('unsupported_capability','Original headers exceed reply limit');
    if(!Buffer.from(source).includes(Buffer.from('\r\n\r\n')))throw new MailOperationError('unsupported_capability','Original headers are incomplete');
    const parsed=await simpleParser(Buffer.from(source),{skipHtmlToText:true,skipTextToHtml:true});
    if(!parsed.messageId||!messageIdSchema.safeParse(parsed.messageId).success)throw new MailOperationError('unsupported_capability','Original message has no valid threading identity');
    const permitted=(parsed.replyTo??parsed.from)?.value.map(value=>value.address).filter((value):value is string=>Boolean(value))??[];
    if(!to.every(value=>permitted.some(candidate=>normalizedAddress(candidate)===normalizedAddress(value))))throw new MailOperationError('invalid_input','Reply recipients must be selected from original Reply-To or From');
    const references=Array.isArray(parsed.references)?parsed.references:parsed.references?[parsed.references]:[];
    if(references.length>30||references.some(value=>!messageIdSchema.safeParse(value).success))throw new MailOperationError('unsupported_capability','Original thread headers are invalid or too long');
    return{inReplyTo:parsed.messageId,references:[...new Set([...references,parsed.messageId])]};
   }finally{lease.release();}
  });
 }
 private async execute(kind:'send'|'reply'|'draft',request:OutboundRequest|ReplyRequest):Promise<OutboundResult>{
  this.permitted(kind);
  const parsed=kind==='reply'?replyRequestSchema.parse(request):outboundRequestSchema.parse(request);
  // Preserve local-part case and supplied content in the digest. No implicit recipient expansion.
  const digest=createHash('sha256').update(JSON.stringify({kind,input:parsed})).digest('hex');
  const namespace=this.revisionNamespace?.();const suffix=namespace?'-'+createHash('sha256').update(namespace).digest('hex').slice(0,32):'';
  const id=`<${parsed.operationId}${suffix}@icloud-plugin.invalid>`;
  const claim=this.ledger.claim(parsed.operationId,digest,id);
  if(!claim.fresh)return {...claim.result,...(kind==='reply'?{replyTarget:replyRequestSchema.parse(parsed).target}:{})};
  let output:OutboundResult;
  try{
   const message:OutboundMessage={to:parsed.to,subject:parsed.subject,text:parsed.text,attachments:parsed.attachments,messageId:id};
   if(kind==='reply')Object.assign(message,await this.thread(replyRequestSchema.parse(parsed).target,parsed.to));
   if(kind==='draft'){
    const boxes=await this.mail.withSession(session=>session.list());
    const drafts=boxes.filter(box=>box.selectable&&box.specialUse==='\\Drafts');
    if(drafts.length!==1)throw new MailOperationError(drafts.length?'ambiguous_destination':'missing','One Drafts mailbox is required');
    this.permitted(kind);
    const saved=await this.provider.draft(message,drafts[0]!.path);
    output={operationId:parsed.operationId,messageId:id,status:'draft_saved',replayed:false,draftTarget:{mailbox:saved.mailbox,uid:saved.uid,uidValidity:saved.uidValidity}};
   }else{
    this.permitted(kind);
    const sent=await this.provider.send(message);
    output={operationId:parsed.operationId,messageId:id,status:sent.accepted.length?(sent.rejected.length?'partial':'submitted'):'rejected',replayed:false,accepted:sent.accepted,rejected:sent.rejected};
   }
  }catch(error:unknown){
   output={operationId:parsed.operationId,messageId:id,status:error instanceof MailOperationError&&error.code!=='outcome_unknown'?'rejected':'unknown',replayed:false,...(error instanceof MailOperationError?{errorCode:error.code}:{})};
   if(kind==='reply')output.replyTarget=replyRequestSchema.parse(parsed).target;
   return this.record(output);
  }
  if(kind==='reply')output.replyTarget=replyRequestSchema.parse(parsed).target;
  return this.record(output);
 }
 private record(output:OutboundResult):OutboundResult {
  try{this.ledger.finish(output.operationId,output);return output;}
  catch{return{operationId:output.operationId,messageId:output.messageId,status:'unknown',replayed:false,errorCode:'outcome_unknown',...(output.replyTarget?{replyTarget:output.replyTarget}:{})};}
 }
 send(input:OutboundRequest){return this.execute('send',input);}
 reply(input:ReplyRequest){return this.execute('reply',input);}
 draft(input:OutboundRequest){return this.execute('draft',input);}
}
