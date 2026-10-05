import {z} from 'zod';

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
]);
export type SharedStreamMutation=z.infer<typeof sharedStreamMutationSchema>;
export interface SharedStreamSession {
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
  case 'delete_shared_album':return {endpoint:'deletealbum',payload:{albumguid},expectsGuid:false};
 }
}

export function sharedStreamURL(session:SharedStreamSession,accountId:string,endpoint:string){
 if(!accountId||session.accountId!==accountId)throw new Error('shared_album_account_mismatch');
 // Modern collections may require CloudKit sharing and encrypted payloads. A
 // similar album name/UUID is not evidence that the legacy protocol applies.
 if(session.protocol!=='legacy_shared_streams')throw new Error('unsupported_shared_album_protocol');
 if(!/^[0-9]{1,30}$/.test(session.dsid))throw new Error('invalid_shared_album_session');
 if(!['createalbum','updatealbum','deletealbum','webgetalbumslist','webgetalbumview','webgetassetcount'].includes(endpoint))throw new Error('invalid_shared_album_endpoint');
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
 albumguid:guid,ownerdsid:z.string().regex(/^[0-9]{1,30}$/),
 albumctag:z.string().max(4096).optional(),
 attributes:z.object({name:z.string().max(200),ispublic:z.enum(['0','1']).optional(),allowcontributions:z.enum(['0','1']).optional()}).optional(),
 requiresminimumos:z.boolean().optional(),sharedCollectionZoneIdentifier:z.string().max(4096).optional(),
 sharedCollectionMigrationState:z.string().max(100).optional(),
 _deleted:z.boolean().optional(),
 sharinginfo:z.array(z.object({personid:z.string().max(200).optional(),invitationguid:z.string().max(200).optional(),sharingtype:z.string().max(100).optional(),email:z.string().max(320).optional(),fullname:z.string().max(1000).optional()})).max(1000).optional(),
});
const inventory=z.object({albums:z.array(serverAlbum).max(10000),rootctag:z.string().max(4096).optional(),callerId:z.string().max(200).optional()});

/** Remote observations only; legacy_candidate never grants mutation authority. */
export async function readSharedStreamAlbums(session:SharedStreamSession,accountId:string,albumGuid?:string){
 const exact=albumGuid===undefined?undefined:guid.parse(albumGuid).toUpperCase();
 const url=sharedStreamURL(session,accountId,exact?'webgetalbumview':'webgetalbumslist');
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(exact?{albumguids:[exact]}:{})});
  if(!response.ok)throw new Error('read_failed');
  const parsed=inventory.parse(JSON.parse(await boundedBody(response,1024*1024)));
  const seen=new Set<string>();
  const albums=parsed.albums.filter(album=>!album._deleted||exact).map(album=>{
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
  return {source:'remote_shared_streams' as const,albums,rootChangeTag:parsed.rootctag??null,serverResponseObserved:true as const,operationCausedChangeVerified:false as const,crossDeviceObserved:false as const};
 }catch{throw new Error('shared_album_readback_failed');}
}

/** Independent count read; metadata/list presence alone cannot prove emptiness. */
export async function readSharedStreamCount(session:SharedStreamSession,accountId:string,albumGuid:string){
 const exact=guid.parse(albumGuid).toUpperCase(),url=sharedStreamURL(session,accountId,'webgetassetcount');
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({albumguid:exact})});
  if(!response.ok)throw new Error('read_failed');
  return z.object({albumassetcount:z.number().int().nonnegative()}).parse(JSON.parse(await boundedBody(response))).albumassetcount;
 }catch{throw new Error('shared_album_count_failed');}
}

/** One attempt only; acknowledgement is never membership/cloud readback proof. */
export async function executeSharedStreamMutation(session:SharedStreamSession,accountId:string,mutation:SharedStreamMutation):Promise<SharedStreamResult>{
 const request=sharedStreamRequest(mutation);
 const url=sharedStreamURL(session,accountId,request.endpoint);
 const albumGuid=mutation.albumGuid.toUpperCase();
 const unknown=():SharedStreamResult=>({status:'outcome_unknown',error:'shared_album_write_outcome_unknown',albumGuid});
 try{
  const response=await session.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
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
