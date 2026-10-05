import {test,expect} from 'bun:test';
import {parseSharedUploadReceipt,parseSharedUploadAcknowledgement,sharedUploadStatusRequest,parseSharedUploadStatus} from './shared-upload-contract.js';
const albumGuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',assetGuid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('binary upload receipt binds exact byte size and does not expose unrelated response fields',()=>{
 const raw={singleFile:{fileChecksum:'checksum',size:3,referenceChecksum:'reference',receipt:'private-receipt',downloadURL:'private-url'},secret:'private'};
 expect(parseSharedUploadReceipt(raw,3)).toEqual({fileChecksum:'checksum',size:3,referenceChecksum:'reference',receipt:'private-receipt'});
 expect(()=>parseSharedUploadReceipt(raw,4)).toThrow('shared_upload_size_mismatch');
 expect(()=>parseSharedUploadReceipt({...raw,isDuplicate:true},3)).toThrow('shared_upload_duplicate');
 expect(()=>parseSharedUploadReceipt({singleFile:{receipt:'private-value'}},3)).toThrow('shared_upload_receipt_invalid');
});
test('publication acknowledgement must retain exact prepared album and asset identities',()=>{
 const raw={albumguid:albumGuid,assetguid:assetGuid,uploadjobid:'job-1'};
 expect(parseSharedUploadAcknowledgement(raw,{albumGuid,assetGuid}).jobId).toBe('job-1');
 expect(()=>parseSharedUploadAcknowledgement(raw,{albumGuid:assetGuid,assetGuid})).toThrow('shared_upload_identity_mismatch');
 expect(()=>parseSharedUploadAcknowledgement({...raw,assetguid:albumGuid},{albumGuid,assetGuid})).toThrow('shared_upload_identity_mismatch');
});
test('job polling cannot substitute jobs or equate processing completion with membership',()=>{
 expect(sharedUploadStatusRequest('job-1').payload).toEqual({uploadjobids:['job-1']});
 for(const [remote,status] of [['IN_PROGRESS','pending'],['COMPLETED','completed'],['ERROR','failed'],['UNKNOWN','unknown'],['FUTURE_STATE','unknown']] as const){
  const result=parseSharedUploadStatus([{uploadjobid:'job-1',status:remote,reason:'private-message'}],'job-1');
  expect(result.status).toBe(status);expect(result.serverMembershipVerified).toBe(false);expect(result.automaticRetry).toBe(false);expect(JSON.stringify(result)).not.toContain('private-message');
 }
 for(const raw of [[],[{uploadjobid:'other',status:'COMPLETED'}],[{uploadjobid:'job-1',status:'COMPLETED'},{uploadjobid:'job-1',status:'COMPLETED'}]])expect(()=>parseSharedUploadStatus(raw,'job-1')).toThrow('shared_upload_status_invalid');
});


test('upload recovery status reads are account-bound, bounded and never retry',async()=>{
 const {readSharedUploadJob}=await import('./shared-stream-protocol.js');let calls=0;
 const session={accountId:'owner-account',protocol:'legacy_shared_streams' as const,dsid:'123',serviceOrigin:'https://p37-sharedstreams.icloud.com',request:async(url:string,init:RequestInit)=>{
  calls++;expect(url).toEndWith('/123/sharedstreams/webuploadstatus');expect(init.redirect).toBe('error');expect(init.signal).toBeDefined();expect(JSON.parse(init.body as string)).toEqual({uploadjobids:['retained-job']});
  return Response.json([{uploadjobid:'retained-job',status:'COMPLETED'}]);
 }};
 await expect(readSharedUploadJob(session,'different-account','retained-job')).rejects.toThrow('shared_album_account_mismatch');expect(calls).toBe(0);
 expect((await readSharedUploadJob(session,'owner-account','retained-job')).status).toBe('completed');expect(calls).toBe(1);
 session.request=async()=>{calls++;throw Error('private-token');};
 await expect(readSharedUploadJob(session,'owner-account','retained-job')).rejects.toThrow('shared_upload_status_read_failed');expect(calls).toBe(2);
});

test('publication builder retains durable IDs, ISO submission time and exact binary receipt',async()=>{
 const {sharedUploadPublicationRequest}=await import('./shared-upload-contract.js');
 const plan={albumGuid,assetGuid,batchGuid:albumGuid,filename:'reviewed.jpg',submittedAt:'2026-10-05T18:00:00.000Z',timeZone:'America/Toronto'};
 const receipt={fileChecksum:'checksum',size:3,referenceChecksum:'reference',receipt:'server-only'};
 const a=sharedUploadPublicationRequest(plan,receipt,3),b=sharedUploadPublicationRequest(plan,receipt,3);
 expect(a).toEqual(b);expect(a.endpoint).toBe('webputasset');expect(a.automaticRetry).toBe(false);
 expect(a.payload.collectionmetadata).toEqual({batchDateCreated:plan.submittedAt,dateCreated:plan.submittedAt,batchGUID:plan.batchGuid});expect(a.payload.assetguid).toBe(assetGuid);
 for(const change of [{filename:'../secret.jpg'},{timeZone:'invalid-zone'},{submittedAt:'now'},{assetGuid:'new-random-value'},{clientOrgKey:'tool-supplied-key'}])expect(()=>sharedUploadPublicationRequest({...plan,...change},receipt,3)).toThrow('shared_upload_plan_invalid');
 expect(()=>sharedUploadPublicationRequest(plan,receipt,4)).toThrow('shared_upload_size_mismatch');
});
