import {createHash} from 'node:crypto';
import {simpleParser} from 'mailparser';
import {z} from 'zod';
import {MailOperationError,type MailGateway,type MailSession,type MailTarget} from '../domain/mail.js';
import {messageIdSchema,attachmentsSchema,type OutboundMessage,type OutboundGateway,type OutboundLedger,type OutboundResult} from '../domain/outbound.js';
const limit=1048576;
import {attachmentRequestSchema,draftReadSchema,draftEditSchema,draftSendSchema,forwardSchema} from '../domain/extensions.js';
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
export class MailExtensions {
 private queue:Promise<unknown>=Promise.resolve();
 private serialized<T>(run:()=>Promise<T>):Promise<T>{const pending=this.queue.then(run);this.queue=pending.catch(()=>undefined);return pending;}
 constructor(private policy:{allowRead?:boolean;allowSend:boolean;allowWrites:boolean},private mail:MailGateway,private provider:OutboundGateway,private ledger:OutboundLedger){}
 private allowed(kind:'read'|'write'|'send') {if(this.policy.allowRead===false||(kind==='write'&&!this.policy.allowWrites)||(kind==='send'&&!this.policy.allowSend))throw new MailOperationError('forbidden','Mail operation disabled');}
 private async selected<T>(target:MailTarget,draft:boolean,write:boolean,run:(session:MailSession)=>Promise<T>):Promise<T>{
  return this.mail.withSession(async session=>{
   if(draft){const boxes=(await session.list()).filter(b=>b.selectable&&b.specialUse==='\\Drafts');if(boxes.length!==1||boxes[0]!.path!==target.mailbox)throw new MailOperationError('invalid_input','Target must be the unique Drafts mailbox');}
   const lease=await session.select(target.mailbox,{readOnly:!write});
   try{if(lease.uidValidity!==target.uidValidity)throw new MailOperationError('stale_identity','Mailbox identity changed');return await run(session);}finally{lease.release();}
  });
 }
 private async source(session:MailSession,target:MailTarget):Promise<Buffer>{
  const meta=await session.metadata(target.uid);if(!meta)throw new MailOperationError('missing','Message not found');
  if(meta.size!==undefined&&meta.size>limit)throw new MailOperationError('unsupported_capability','Message exceeds 1 MiB');
  return this.collect(session,target,undefined);
 }
 private async collect(session:MailSession,target:MailTarget,part:string|undefined):Promise<Buffer>{
  const download=await session.download(target.uid,part,limit+1),chunks:Uint8Array[]=[];let size=0;
  try{for await(const chunk of download.chunks){size+=chunk.byteLength;if(size>limit)throw new MailOperationError('unsupported_capability','Download exceeds 1 MiB');chunks.push(chunk);}return Buffer.concat(chunks);}finally{download.cancel();}
 }
 async attachment(request:z.infer<typeof attachmentRequestSchema>){
  this.allowed('read');const input=attachmentRequestSchema.parse(request);
  return this.selected(input.target,false,false,async session=>{const metadata=await session.metadata(input.target.uid);if(!metadata)throw new MailOperationError('missing','Message not found');
   const part=metadata.attachments.find(a=>a.partId===input.partId);if(!part)throw new MailOperationError('missing','Attachment part not found');
   // BODYSTRUCTURE size counts transfer-encoded octets, not decoded attachment bytes.
   // Enforce the cap on the provider's decoded stream (with a one-byte overflow probe).
   const bytes=await this.collect(session,input.target,input.partId);return{target:input.target,partId:input.partId,filename:part.filename,contentType:part.contentType,size:bytes.length,sha256:hash(bytes),contentBase64:bytes.toString('base64')};});
 }
 private async content(source:Buffer){
  const parsed=await simpleParser(source,{skipHtmlToText:true,skipTextToHtml:true});
  // Signed/encrypted content cannot be faithfully rewritten as ordinary MIME.
  const type=parsed.headers.get('content-type');if(type&&typeof type==='object'&&'value' in type&&/signed|encrypted|pkcs7/i.test(String(type.value)))throw new MailOperationError('unsupported_capability','Signed or encrypted drafts cannot be rewritten');
  const refs=Array.isArray(parsed.references)?parsed.references:parsed.references?[parsed.references]:[];
  if((parsed.inReplyTo&&!messageIdSchema.safeParse(parsed.inReplyTo).success)||refs.length>31||refs.some(v=>!messageIdSchema.safeParse(v).success))throw new MailOperationError('unsupported_capability','Invalid thread headers');
  if(parsed.attachments.some(a=>a.contentDisposition==='inline'||a.cid))throw new MailOperationError('unsupported_capability','Inline-content drafts require a preserving MIME editor');
  const attachments=attachmentsSchema.parse(parsed.attachments.map(a=>({filename:a.filename??'attachment',contentType:a.contentType,contentBase64:a.content.toString('base64')})));
  const text=parsed.text??'',html=typeof parsed.html==='string'?parsed.html:undefined;
  if(Buffer.byteLength(text)>100000||(html&&Buffer.byteLength(html)>100000))throw new MailOperationError('unsupported_capability','Draft body exceeds supported limit');
  return{to:(Array.isArray(parsed.to)?parsed.to:parsed.to?[parsed.to]:[]).flatMap(g=>g.value.map(a=>a.address).filter((a):a is string=>Boolean(a))),subject:parsed.subject??'',text,html,attachments,inReplyTo:parsed.inReplyTo,references:refs};
 }
 async readDraft(request:z.infer<typeof draftReadSchema>){this.allowed('read');const input=draftReadSchema.parse(request);return this.selected(input.target,true,false,async session=>{const source=await this.source(session,input.target);return{target:input.target,revision:hash(source),...await this.content(source)};});}
 private async execute(kind:'edit'|'draft-send'|'forward',input:z.infer<typeof draftEditSchema>|z.infer<typeof draftSendSchema>|z.infer<typeof forwardSchema>):Promise<OutboundResult>{
  const permission=kind==='edit'?'write':'send';
  this.allowed(permission);
  const digest=hash(Buffer.from(JSON.stringify({kind,input}))),messageId=`<${input.operationId}@icloud-plugin.invalid>`,claim=this.ledger.claim(input.operationId,digest,messageId);
  if(!claim.fresh)return claim.result;
  let attempted=false;let replacement:MailTarget|undefined;let result:OutboundResult;
  try{result=await this.serialized(()=>{this.allowed(permission);return this.selected(input.target,kind!=='forward',kind==='edit',async session=>{
   const source=await this.source(session,input.target);
   if('revision' in input&&hash(source)!==input.revision)throw new MailOperationError('stale_identity','Draft revision changed');
   let message:OutboundMessage;
   if(kind==='forward') {const value=forwardSchema.parse(input);message={to:value.to,subject:value.subject,text:value.text,messageId,attachments:attachmentsSchema.parse([...(value.attachments??[]),{filename:'forwarded-message.eml',contentType:'message/rfc822',contentBase64:source.toString('base64')}])};}
   else{const original=await this.content(source);message={...original,to:input.to,messageId};if(kind==='edit'){const value=draftEditSchema.parse(input);message={...message,subject:value.subject,text:value.text,html:undefined,attachments:value.attachments??original.attachments};}}
   if(kind==='edit'){
    if(!session.append||!session.supportsMove||!this.provider.compose)throw new MailOperationError('unsupported_capability','Safe draft replacement unavailable');
    const trash=(await session.list()).filter(b=>b.selectable&&b.specialUse==='\\Trash');if(trash.length!==1||trash[0]!.path===input.target.mailbox)throw new MailOperationError('ambiguous_destination','Unique Trash mailbox required');
    const mime=await this.provider.compose(message);if(mime.byteLength>limit)throw new MailOperationError('unsupported_capability','Replacement MIME exceeds 1 MiB');
    this.allowed('write');attempted=true;const saved=await session.append(input.target.mailbox,mime);
    if(!saved?.uid||!Number.isSafeInteger(saved.uid)||saved.uid>4294967295||saved.uidValidity!==input.target.uidValidity)throw new MailOperationError('outcome_unknown','Replacement identity unconfirmed');
    replacement={mailbox:input.target.mailbox,uid:saved.uid,uidValidity:saved.uidValidity};
    this.allowed('write');const moved=await session.move(input.target.uid,trash[0]!.path);if(!moved||!moved.uid||!moved.uidValidity)throw new MailOperationError('outcome_unknown','Prior draft move unconfirmed');
    return{operationId:input.operationId,messageId,status:'draft_saved' as const,replayed:false,draftTarget:replacement,sourceRetained:false};
   }
   this.allowed('send');attempted=true;const sent=await this.provider.send(message);return{operationId:input.operationId,messageId,status:sent.accepted.length?(sent.rejected.length?'partial' as const:'submitted' as const):'rejected' as const,replayed:false,accepted:sent.accepted,rejected:sent.rejected,...(kind==='draft-send'?{sourceRetained:true}:{})};
  });});}catch(error){result={operationId:input.operationId,messageId,status:attempted?'unknown':'rejected',replayed:false,errorCode:error instanceof MailOperationError?error.code:error instanceof z.ZodError?'invalid_input':'upstream_failure',...(replacement?{replacementTarget:replacement}:{})};}
  try{this.ledger.finish(input.operationId,result);return result;}catch{return{operationId:input.operationId,messageId,status:'unknown',replayed:false,errorCode:'outcome_unknown',...(replacement?{replacementTarget:replacement}:{})};}
 }
 editDraft(input:z.infer<typeof draftEditSchema>){return this.execute('edit',draftEditSchema.parse(input));}
 sendDraft(input:z.infer<typeof draftSendSchema>){return this.execute('draft-send',draftSendSchema.parse(input));}
 forward(input:z.infer<typeof forwardSchema>){return this.execute('forward',forwardSchema.parse(input));}
}
