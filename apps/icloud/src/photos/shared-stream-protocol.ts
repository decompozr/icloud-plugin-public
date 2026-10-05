import {parseSharedUploadReceipt,parseSharedUploadAcknowledgement,sharedUploadPublicationRequest,parseSharedUploadStatus,sharedUploadStatusRequest} from './shared-upload-contract.js';
import {z} from 'zod';
import {sharedManagementRequest} from './shared-management-contract.js';

export const SHARED_READ_TIMEOUT_MS=60000;
export const SHARED_INVENTORY_PROBE_TIMEOUT_MS=180000;
export const SHARED_WRITE_TIMEOUT_MS=30000;
export const SHARED_MEMBERSHIP_TIMEOUT_MS=300000;
// One write plus inventory, exact metadata and count readback, with recovery margin.
export const SHARED_RECOVERY_GRACE_MS=SHARED_WRITE_TIMEOUT_MS+SHARED_INVENTORY_PROBE_TIMEOUT_MS+2*SHARED_READ_TIMEOUT_MS+SHARED_MEMBERSHIP_TIMEOUT_MS+240000+SHARED_READ_TIMEOUT_MS+30000;

// Undocumented Shared Streams endpoint catalog and read contracts observed in
// Apple's public Photos client. Lifecycle write payloads are experimental
// candidates derived from album models, not verified request builders.
// Internal only: session setup, ledger integration and live acceptance are required
// before these requests can become an owner-facing MCP capability.
const guid=z.string().uuid();
const title=z.string().trim().min(1).max(200);
export const sharedStreamMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_shared_album'),albumGuid:guid,title}).strict(),
 z.object({action:z.literal('rename_shared_album'),albumGuid:guid,title}).strict(),
 z.object({action:z.literal('delete_shared_album'),albumGuid:guid}).strict(),
 z.object({action:z.literal('set_shared_contributions'),albumGuid:guid,currentName:title,enabled:z.boolean()}).strict(),
 z.object({action:z.literal('set_shared_public_access'),albumGuid:guid,enabled:z.boolean()}).strict(),
 z.object({action:z.literal('invite_shared_participants'),albumGuid:guid,invitations:z.array(z.object({invitationGuid:guid,email:z.string().email()})).min(1).max(20)}).strict(),
 z.object({action:z.literal('remove_shared_participant'),albumGuid:guid,invitationGuid:z.string().min(1).max(512)}).strict(),
 z.object({action:z.literal('remove_shared_assets'),albumGuid:guid,assetGuids:z.array(z.string().min(1).max(512)).min(1).max(100)}).strict(),
]);
export type SharedStreamMutation=z.infer<typeof sharedStreamMutationSchema>;
export interface SharedStreamSession {
 // Private staged source and receipt; never pass these through MCP output.
 uploadBytes?:(source:{albumGuid:string;privatePath:string;bytes:number;sha256:string})=>Promise<ReturnType<typeof parseSharedUploadReceipt>>;
 photosServiceState?:()=>Promise<{status:'zones_observed'|'http_error'|'unrecognized';httpStatus:number;zoneCount?:number}>;
 webAccessState?:()=>Promise<{isICDRSDisabled:boolean|null;isDeviceConsentedForPCS:boolean|null;responseKind:'flags'|'provider_error'|'unrecognized';recognizedFields:string[]}>;
 accountId:string;
 protocol:'legacy_shared_streams';
 dsid:string;
 serviceOrigin:string;
 // Authenticated account-bound transport; never reuse Mail app passwords or an
 // arbitrary browser's cookies. It must honor redirect and abort options.
 request:(url:string,init:RequestInit)=>Promise<Response>;
}
export type SharedStreamResult=
 | {status:'acknowledged_readback_required';albumGuid:string;serverSyncVerified:false}
 | {status:'outcome_unknown';error:'shared_album_write_outcome_unknown';albumGuid:string};

export function sharedStreamRequest(mutation:SharedStreamMutation){
 const m=sharedStreamMutationSchema.parse(mutation);
 // The GUID is saved by the caller before execution, never generated on retry.
 const albumguid=m.albumGuid.toUpperCase();
 switch(m.action){
  case 'create_shared_album':return {endpoint:'createalbum',payload:{albumguid,attributes:{name:m.title,allowcontributions:'1'}},expectsGuid:true};
  case 'rename_shared_album':return {endpoint:'updatealbum',payload:{albumguid,attributes:{name:m.title}},expectsGuid:false};
  case 'set_shared_contributions':{const request=sharedManagementRequest({action:'set_contributions',albumGuid:albumguid,currentName:m.currentName,enabled:m.enabled});return {endpoint:request.endpoint,payload:request.payload,expectsGuid:false};}
  case 'set_shared_public_access':{const request=sharedManagementRequest({action:'set_public_access',albumGuid:albumguid,enabled:m.enabled});return {endpoint:request.endpoint,payload:request.payload,expectsGuid:false};}
  case 'invite_shared_participants':{const request=sharedManagementRequest({action:'invite_participants',albumGuid:albumguid,invitations:m.invitations});return {endpoint:request.endpoint,payload:request.payload,expectsGuid:false};}
  case 'remove_shared_participant':{const request=sharedManagementRequest({action:'remove_participant',albumGuid:albumguid,invitationGuid:m.invitationGuid});return {endpoint:request.endpoint,payload:request.payload,expectsGuid:false};}
  case 'remove_shared_assets':{const request=sharedManagementRequest({action:m.action,albumGuid:albumguid,assetGuids:m.assetGuids});return {endpoint:request.endpoint,payload:request.payload,expectsGuid:false};}
  case 'delete_shared_album':return {endpoint:'deletealbum',payload:{albumguid},expectsGuid:false};
 }
}

export function sharedStreamURL(session:SharedStreamSession,accountId:string,endpoint:string){
 if(!accountId||session.accountId!==accountId)throw new Error('shared_album_account_mismatch');
 // Modern collections may require CloudKit sharing and encrypted payloads. A
 // similar album name/UUID is not evidence that the legacy protocol applies.
 if(session.protocol!=='legacy_shared_streams')throw new Error('unsupported_shared_album_protocol');
 if(!/^[0-9]{1,30}$/.test(session.dsid))throw new Error('invalid_shared_album_session');
 if(!['createalbum','updatealbum','deletealbum','setalbumpublic','share','unshare','deleteassets','webgetalbumslist','webgetalbumview','webgetassetcount','webgetassets','webuploadstatus','webputasset'].includes(endpoint))throw new Error('invalid_shared_album_endpoint');
 const url=new URL(session.serviceOrigin);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||
  !/^p[0-9]+-sharedstreams\.icloud\.com(?:\.cn)?$/.test(url.hostname))throw new Error('invalid_shared_album_service');
 return `${url.origin}/${session.dsid}/sharedstreams/${endpoint}`;
}

async function boundedBody(response:Response,limit=65536):Promise<string>{
 const reader=response.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>limit)throw new Error('response_limit');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder().decode(bytes);
}

const serverAlbum=z.object({
 albumguid:z.string().min(1).max(512),ownerdsid:z.string().regex(/^[0-9]{1,30}$/),
 albumctag:z.string().max(4096).optional(),
 attributes:z.object({name:z.string().max(200),ispublic:z.enum(['0','1']).optional(),allowcontributions:z.enum(['0','1']).optional()}).optional(),
 requiresminimumos:z.boolean().optional(),sharedCollectionZoneIdentifier:z.string().max(4096).optional(),
 sharedCollectionMigrationState:z.string().max(100).optional(),
 _deleted:z.boolean().optional(),
 sharinginfo:z.array(z.object({personid:z.string().max(200).optional(),invitationguid:z.string().max(200).optional(),sharingtype:z.string().max(100).optional(),email:z.string().max(320).optional(),fullname:z.string().max(1000).optional()})).max(1000).optional(),
});
const inventory=z.object({albums:z.array(serverAlbum).max(10000),rootctag:z.string().max(4096).optional(),callerId:z.string().max(200).optional()});

/** Fixed diagnostics only: never include response text, identifiers or cookies. */
export class SharedStreamReadError extends Error {
 constructor(readonly diagnostic:{stage:'transport'|'http'|'decode'|'schema'|'identity';httpStatus?:number;httpVersion?:string;cause?:string;schemaIssues?:Array<{path:string;code:string;expected?:string;received?:string}>}){super('shared_album_readback_failed');}
}

/** Bounded structural diagnostics; never include values, URLs, identifiers or messages. */
export function sharedReadDiagnostic(error:unknown){
 if(error instanceof SharedStreamReadError)return error.diagnostic;
 if(error instanceof z.ZodError)return {stage:'schema',issues:error.issues.slice(0,12).map(issue=>({code:issue.code,path:issue.path.map(part=>typeof part==='number'?'[]':['records','recordName','recordType','fields','masterRef','value','albumassetcount'].includes(part)?part:'?').join('.'),...(issue.code==='invalid_type'?{expected:issue.expected,received:issue.received}:{})}))};
 const message=error instanceof Error?error.message:'';
 const allowed=['shared_album_assets_read_failed','shared_album_asset_record_error','shared_album_asset_identity_mismatch','shared_album_asset_page_mismatch','shared_album_count_failed','shared_album_membership_unsupported','shared_album_membership_limit','shared_album_membership_incomplete','shared_album_membership_duplicate','shared_album_membership_changed'];
 return {stage:'read',cause:allowed.includes(message)?message:'unclassified_read_failure'};
}

/** Remote observations only; legacy_candidate never grants mutation authority. */
export async function readSharedStreamAlbums(session:SharedStreamSession,accountId:string,albumGuid?:string,longProbe=false){
 const exact=albumGuid===undefined?undefined:guid.parse(albumGuid).toUpperCase();
 const url=sharedStreamURL(session,accountId,exact?'webgetalbumview':'webgetalbumslist');
 let stage:SharedStreamReadError['diagnostic']['stage']='transport',httpStatus:number|undefined,httpVersion:string|undefined;
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(longProbe?SHARED_INVENTORY_PROBE_TIMEOUT_MS:SHARED_READ_TIMEOUT_MS),headers:{'Content-Type':'text/plain;charset=UTF-8',...(longProbe?{'x-photos-inventory-probe':'true'}:{})},body:JSON.stringify(exact?{albumguids:[exact]}:{})});
  stage='http';httpStatus=response.status;
  const observedVersion=response.headers.get('x-photos-transport-http-version');
  if(observedVersion&&['1.0','1.1','2','3'].includes(observedVersion))httpVersion=observedVersion;
  if(!response.ok)throw new Error('read_failed');
  stage='decode';const decoded=JSON.parse(await boundedBody(response,1024*1024));
  stage='schema';const parsed=inventory.parse(decoded);
  stage='identity';
  const seen=new Set<string>();
  const visible=parsed.albums.filter(album=>!album._deleted||exact);
  const unsupportedAlbums=visible.filter(album=>!guid.safeParse(album.albumguid).success).map(album=>({albumIdentifier:album.albumguid,reason:'unsupported_identifier_format' as const,writable:false as const}));
  if(exact&&unsupportedAlbums.length)throw new Error('identity_mismatch');
  const albums=visible.filter(album=>guid.safeParse(album.albumguid).success).map(album=>{
   const id=album.albumguid.toUpperCase();
   if(seen.has(id)||(exact&&id!==exact))throw new Error('identity_mismatch');seen.add(id);
   if(exact&&album._deleted)throw new Error('deleted_album_returned');
   return {albumGuid:id,ownerDsid:album.ownerdsid,title:album.attributes?.name??null,changeTag:album.albumctag??null,
    rights:album.ownerdsid===session.dsid?'owner' as const:'participant' as const,
    protocol:album.requiresminimumos||album.sharedCollectionZoneIdentifier||album.sharedCollectionMigrationState?'modern_or_encrypted' as const:'legacy_candidate' as const,
    isPublic:album.attributes?.ispublic===undefined?null:album.attributes.ispublic==='1',
    allowsContributions:album.attributes?.allowcontributions===undefined?null:album.attributes.allowcontributions==='1',
    participants:album.sharinginfo??null};
  });
  if(exact&&albums.length!==1)throw new Error('exact_album_missing');
  const version=response.headers.get('x-photos-transport-http-version');
  return {source:'remote_shared_streams' as const,albums,unsupportedAlbums,inventoryFullySupported:unsupportedAlbums.length===0,rootChangeTag:parsed.rootctag??null,serverResponseObserved:true as const,operationCausedChangeVerified:false as const,crossDeviceObserved:false as const,...(version&&['1.0','1.1','2','3'].includes(version)?{serverHTTPVersion:version}:{})};
 }catch(error){
  const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  const safeCause=typeof code==='string'&&['shared_album_connection_timeout','shared_album_read_timeout','shared_album_tls_failed','shared_album_connection_failed','shared_album_transport_failed','provider_timeout','provider_unavailable','request_too_large','invalid_provider_response'].includes(code)?code:undefined;
  const schemaIssues=stage==='schema'&&error instanceof z.ZodError?error.issues.slice(0,12).map(issue=>({path:issue.path.join('.').slice(0,200),code:issue.code,...(issue.code==='invalid_type'?{expected:issue.expected,received:issue.received}:{})})):undefined;
  throw new SharedStreamReadError({stage,...(schemaIssues?{schemaIssues}:{}),...(httpStatus===undefined?{}:{httpStatus}),...(httpVersion?{httpVersion}:{}),...(safeCause?{cause:safeCause}:{})});
 }
}

/** A bounded page of shared-copy identities, never original-library identities. */
export async function readSharedStreamAssetPage(session:SharedStreamSession,accountId:string,input:{albumGuid:string;changeTag:string;offset:number;limit:number}){
 const page=z.object({albumGuid:guid,changeTag:z.string().min(1).max(4096),offset:z.number().int().min(0).max(100000),limit:z.number().int().min(1).max(100)}).strict().parse(input);
 const response=await session.request(sharedStreamURL(session,accountId,'webgetassets'),{method:'POST',redirect:'error',signal:AbortSignal.timeout(SHARED_READ_TIMEOUT_MS),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({albumguid:page.albumGuid.toUpperCase(),albumctag:page.changeTag,offset:String(page.offset),limit:String(page.offset+page.limit*2)})});
 if(!response.ok)throw new Error('shared_album_assets_read_failed');
 const name=z.string().min(1).max(512).refine(v=>!/[\x00-\x1f\x7f]/.test(v));
 const record=z.object({recordName:name,recordType:z.enum(['CPLMaster','CPLAsset']),fields:z.record(z.unknown())}).passthrough();
 const parsed=z.object({records:z.array(record).max(200)}).parse(JSON.parse(await boundedBody(response)));
 const masters=new Set<string>(),assets=new Map<string,string>();
 for(const item of parsed.records){
  if(['error','errors','serverErrorCode'].some(key=>key in item&&item[key]!==null))throw new SharedStreamReadError({stage:'schema',cause:'shared_album_asset_record_error:'+['error','errors','serverErrorCode'].filter(key=>key in item).map(key=>key+'='+ (item[key]===null?'null':Array.isArray(item[key])?'array_'+(item[key] as unknown[]).length:typeof item[key]==='string'?(item[key]===''?'empty_string':'nonempty_string'):typeof item[key])).join(',')});
  if(item.recordType==='CPLMaster'){
   if(masters.has(item.recordName))throw new Error('shared_album_asset_identity_mismatch');
   masters.add(item.recordName);
  }else{
   const reference=z.object({value:z.object({recordName:name})}).parse(item.fields.masterRef).value.recordName;
   if(assets.has(item.recordName))throw new Error('shared_album_asset_identity_mismatch');
   assets.set(item.recordName,reference);
  }
 }
 const used=new Set<string>();
 for(const reference of assets.values()){
  if(!masters.has(reference)||used.has(reference))throw new Error('shared_album_asset_identity_mismatch');
  used.add(reference);
 }
 if(used.size!==masters.size||assets.size>page.limit)throw new Error('shared_album_asset_page_mismatch');
 return {albumGuid:page.albumGuid.toUpperCase(),changeTag:page.changeTag,offset:page.offset,assets:[...assets].map(([assetGuid,masterGuid])=>({assetGuid,masterGuid})),source:'remote_shared_streams' as const,complete:false as const,originalLibraryIdentityVerified:false as const};
}

/** Independent count read; metadata/list presence alone cannot prove emptiness. */
export async function readSharedStreamCount(session:SharedStreamSession,accountId:string,albumGuid:string){
 const exact=guid.parse(albumGuid).toUpperCase(),url=sharedStreamURL(session,accountId,'webgetassetcount');
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(SHARED_READ_TIMEOUT_MS),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({albumguid:exact})});
  if(!response.ok)throw new Error('read_failed');
  return z.object({albumassetcount:z.number().int().nonnegative()}).parse(JSON.parse(await boundedBody(response))).albumassetcount;
 }catch{throw new Error('shared_album_count_failed');}
}

/** Read-only recovery of an already retained upload job; never starts an upload. */
export async function readSharedUploadJob(session:SharedStreamSession,accountId:string,jobId:string){
 const request=sharedUploadStatusRequest(jobId),url=sharedStreamURL(session,accountId,request.endpoint);
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(SHARED_READ_TIMEOUT_MS),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(request.payload)});
  if(!response.ok)throw new Error('read_failed');
  return parseSharedUploadStatus(JSON.parse(await boundedBody(response)),jobId);
 }catch{throw new Error('shared_upload_status_read_failed');}
}

/** Complete bounded owned-album membership, with before/after consistency checks. */
export async function readSharedStreamMembership(session:SharedStreamSession,accountId:string,albumGuid:string){
 const exact=guid.parse(albumGuid).toUpperCase(),deadline=AbortSignal.timeout(SHARED_MEMBERSHIP_TIMEOUT_MS);
 const bounded:SharedStreamSession={...session,request:(url,init)=>{
  deadline.throwIfAborted();
  return session.request(url,{...init,signal:AbortSignal.any([deadline,...(init.signal?[init.signal]:[])])});
 }};
 const before=(await readSharedStreamAlbums(bounded,accountId,exact)).albums[0]!;
 if(before.rights!=='owner'||before.protocol!=='legacy_candidate'||!before.changeTag)throw new Error('shared_album_membership_unsupported');
 const count=await readSharedStreamCount(bounded,accountId,exact);
 if(count>5000)throw new Error('shared_album_membership_limit');
 const assets:Array<{assetGuid:string;masterGuid:string}>=[],seenAssets=new Set<string>(),seenMasters=new Set<string>();
 while(assets.length<count){
  const page=await readSharedStreamAssetPage(bounded,accountId,{albumGuid:exact,changeTag:before.changeTag,offset:assets.length,limit:Math.min(100,count-assets.length)});
  if(!page.assets.length)throw new Error('shared_album_membership_incomplete');
  for(const asset of page.assets){
   if(seenAssets.has(asset.assetGuid)||seenMasters.has(asset.masterGuid))throw new Error('shared_album_membership_duplicate');
   seenAssets.add(asset.assetGuid);seenMasters.add(asset.masterGuid);assets.push(asset);
  }
 }
 const after=(await readSharedStreamAlbums(bounded,accountId,exact)).albums[0]!;
 const finalCount=await readSharedStreamCount(bounded,accountId,exact);
 if(count!==finalCount||before.changeTag!==after.changeTag||before.ownerDsid!==after.ownerDsid||after.rights!=='owner'||after.protocol!=='legacy_candidate')throw new Error('shared_album_membership_changed');
 deadline.throwIfAborted();
 return {albumGuid:exact,changeTag:after.changeTag,assets,total:count,complete:true as const,observedSnapshotStable:true as const,source:'remote_shared_streams' as const,originalLibraryIdentityVerified:false as const};
}

/** One attempt only; acknowledgement is never membership/cloud readback proof. */
export async function executeSharedStreamMutation(session:SharedStreamSession,accountId:string,mutation:SharedStreamMutation):Promise<SharedStreamResult>{
 const request=sharedStreamRequest(mutation);
 const url=sharedStreamURL(session,accountId,request.endpoint);
 const albumGuid=mutation.albumGuid.toUpperCase();
 const unknown=():SharedStreamResult=>({status:'outcome_unknown',error:'shared_album_write_outcome_unknown',albumGuid});
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(SHARED_WRITE_TIMEOUT_MS),
   headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(request.payload)});
  if(!response.ok)return unknown();
  const body=await boundedBody(response);
  if(request.expectsGuid){
   const result=z.object({albumguid:guid}).passthrough().safeParse(JSON.parse(body));
   if(!result.success||result.data.albumguid.toUpperCase()!==albumGuid)return unknown();
  }
  return {status:'acknowledged_readback_required',albumGuid,serverSyncVerified:false};
 }catch{return unknown();}
}


/** Caller must retain a publication claim before dispatch. Never retry. */
export async function publishSharedUpload(session:SharedStreamSession,accountId:string,plan:Parameters<typeof sharedUploadPublicationRequest>[0],receipt:unknown,bytes:number){
 const request=sharedUploadPublicationRequest(plan,receipt,bytes),url=sharedStreamURL(session,accountId,request.endpoint);
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(SHARED_WRITE_TIMEOUT_MS),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(request.payload)});
  if(!response.ok)throw Error('publication_failed');
  return parseSharedUploadAcknowledgement(JSON.parse(await boundedBody(response)),{albumGuid:request.payload.albumguid,assetGuid:request.payload.assetguid});
 }catch{throw Error('shared_upload_publication_outcome_unknown');}
}
