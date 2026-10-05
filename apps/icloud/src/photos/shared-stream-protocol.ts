import {z} from 'zod';

// Undocumented Shared Streams protocol observed in Apple's public Photos client.
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
 if(!['createalbum','updatealbum','deletealbum'].includes(endpoint))throw new Error('invalid_shared_album_endpoint');
 const url=new URL(session.serviceOrigin);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||
  !/^p[0-9]+-sharedstreams\.icloud\.com(?:\.cn)?$/.test(url.hostname))throw new Error('invalid_shared_album_service');
 return `${url.origin}/${session.dsid}/sharedstreams/${endpoint}`;
}

async function boundedBody(response:Response):Promise<string>{
 const reader=response.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>65536)throw new Error('response_limit');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder().decode(bytes);
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
