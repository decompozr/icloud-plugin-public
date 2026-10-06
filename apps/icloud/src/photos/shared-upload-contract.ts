import {z} from 'zod';

// Clean interoperability schemas derived from Apple's public Photos 2636Build18
// bundles (resource model 944, shared upload and job polling). These are internal;
// no upload is dispatched until transport custody and durable stages are integrated.
const id=z.string().min(1).max(512).refine(value=>!/[\x00-\x1f\x7f]/.test(value));
const receipt=z.object({
 fileChecksum:id,
 size:z.number().int().positive().safe(),
 wrappingKey:z.string().max(8192).nullable().optional(),
 referenceChecksum:id,
 receipt:z.string().min(1).max(16384),
});

// Receipts may contain bearer material. Keep this return value server-side; never
// include it in MCP plans, operation status, errors, or diagnostic logging.
export function parseSharedUploadReceipt(raw:unknown,expectedBytes:number){
 const parsed=z.object({singleFile:receipt,isDuplicate:z.boolean().optional()}).safeParse(raw);
 if(!parsed.success||!Number.isSafeInteger(expectedBytes)||expectedBytes<=0)throw Error('shared_upload_receipt_invalid');
 if(parsed.data.isDuplicate)throw Error('shared_upload_duplicate');
 if(parsed.data.singleFile.size!==expectedBytes)throw Error('shared_upload_size_mismatch');
 return parsed.data.singleFile;
}

export function parseSharedUploadAcknowledgement(raw:unknown,expected:{albumGuid:string;assetGuid:string}){
 const schema=z.object({albumguid:z.string().uuid(),assetguid:z.string().uuid(),uploadjobid:id});
 const parsed=schema.safeParse(raw);
 if(!parsed.success)throw Error('shared_upload_acknowledgement_invalid');
 if(parsed.data.albumguid.toUpperCase()!==expected.albumGuid.toUpperCase()||parsed.data.assetguid.toUpperCase()!==expected.assetGuid.toUpperCase())throw Error('shared_upload_identity_mismatch');
 return {albumGuid:parsed.data.albumguid,assetGuid:parsed.data.assetguid,jobId:parsed.data.uploadjobid};
}

export function sharedUploadStatusRequest(jobId:string){
 return {endpoint:'webuploadstatus',payload:{uploadjobids:[id.parse(jobId)]}} as const;
}

export function parseSharedUploadStatus(raw:unknown,jobId:string){
 const parsed=z.array(z.object({uploadjobid:id,status:id,progress:z.number().min(0).max(1).optional()})).max(100).safeParse(raw);
 if(!parsed.success||parsed.data.length!==1||parsed.data[0]!.uploadjobid!==jobId)throw Error('shared_upload_status_invalid');
 const result=parsed.data[0]!;
 const status=result.status==='IN_PROGRESS'?'pending':result.status==='COMPLETED'?'completed':result.status==='ERROR'?'failed':'unknown';
 // Completion acknowledges processing only, not verified destination membership.
 return {jobId,status,progress:result.progress,serverMembershipVerified:false,automaticRetry:false} as const;
}

// Identifiers and submission time come from the durable prepared plan. This
// builder never generates them, so a lost response cannot silently create a new
// asset identity. The receipt is server-only, supplied after binary transfer.
export function sharedUploadPublicationRequest(raw:unknown,rawReceipt:unknown,expectedBytes:number){
 const plan=z.object({
  albumGuid:z.string().uuid(),assetGuid:z.string().uuid(),batchGuid:z.string().uuid(),
  filename:z.string().min(1).max(255).refine(value=>!/[\x00-\x1f\x7f/\\]/.test(value)),
  submittedAt:z.string().datetime(),
  timeZone:id.refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}),
 }).strict().safeParse(raw);
 if(!plan.success)throw Error('shared_upload_plan_invalid');
 const file=parseSharedUploadReceipt({singleFile:rawReceipt},expectedBytes),p=plan.data;
 return {endpoint:'webputasset',payload:{albumguid:p.albumGuid,assetguid:p.assetGuid,
  filename:p.filename,collectionmetadata:{batchDateCreated:p.submittedAt,dateCreated:p.submittedAt,batchGUID:p.batchGuid},
  singlefileupload:file,localtimezoneid:p.timeZone},automaticRetry:false} as const;
}
