// Read-only Shared Streams subset. Source: timlaing/pyicloud
// 86c4bc90d5632bcaf7507e5335e127f7450a177a photos_legacy.py.
import type { CloudSession } from './cloud-client';
export const SHARED_LIMITS = {maxAlbums:100,maxPages:2,pageSize:10,maxBytes:2*1024*1024,timeoutMs:30000} as const;
export type SharedAlbum = {guid:string;ctag:string;location:string;name:string};
export type SharedAsset = {assetRecordName:string;masterRecordName:string;originalCreationDate:number|null;checksums:string[]};
const obj=(v:any)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid shared response');return v;};
const str=(v:any)=>{if(typeof v!=='string'||!v.length||v.length>4096||/[\x00-\x1f]/.test(v))throw new Error('Invalid shared field');return v;};
export function sharedService(session:CloudSession):URL {
  if(!/^\d+$/.test(session.dsid))throw new Error('Invalid shared account');
  const url=new URL(session.webservices.sharedstreams?.url ?? '');
  if(url.protocol!=='https:'||! /^(?:p\d+-)?sharedstreams\.icloud\.com$/.test(url.hostname)||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Untrusted shared service');
  return url;
}
function albumURL(album:SharedAlbum,root:URL,operation:string):URL {
  const url=new URL(str(album.location));
  if(url.origin!==root.origin||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/')||/%(?:2e|2f|5c)/i.test(url.pathname)||url.pathname.includes('\\'))throw new Error('Untrusted shared album location');
  url.pathname+=operation;return url;
}
function transport(session:CloudSession){
  const root=sharedService(session),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),SHARED_LIMITS.timeoutMs);let bytes=0;
  return {root,get bytes(){return bytes;},close(){clearTimeout(timer);controller.abort();},async post(url:URL,body:unknown){
    url.search=new URLSearchParams({dsid:session.dsid,clientId:session.clientId??crypto.randomUUID(),remapEnums:'true',getCurrentSyncToken:'true'}).toString();
    const response=await session.request(url,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)});
    if(!response.ok||response.redirected){await response.body?.cancel();throw new Error('Shared HTTP rejected');}
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing shared response');
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;size+=part.value.length;if(bytes>SHARED_LIMITS.maxBytes)throw new Error('Shared response byte cap');chunks.push(part.value);}}finally{await reader.cancel();reader.releaseLock();}
    const data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
    const payload=obj(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)));
    if(['error','errors','serverErrorCode'].some(key=>key in payload))throw new Error('Shared server error');
    return payload;
  }};
}
export async function readSharedAlbums(session:CloudSession,targetName='Family Photo'){
  str(targetName);const t=transport(session);
  try{
    const url=new URL(`/${session.dsid}/sharedstreams/webgetalbumslist`,t.root);
    const payload=await t.post(url,{});
    if(!Array.isArray(payload.albums)||payload.albums.length>SHARED_LIMITS.maxAlbums)throw new Error('Invalid shared albums');
    const seen=new Set<string>();
    const albums:SharedAlbum[]=payload.albums.map((value:any)=>{const a=obj(value);const album={guid:str(a.albumguid),ctag:str(a.albumctag),location:str(a.albumlocation),name:str(obj(a.attributes).name)};albumURL(album,t.root,'webgetassets');if(seen.has(album.guid))throw new Error('Duplicate shared album');seen.add(album.guid);return album;});
    const matches=albums.filter(a=>a.name===targetName);
    return {albums,matches,responseBytes:t.bytes,inventoryPaginationVerified:false as const};
  }finally{t.close();}
}
export function parseSharedAssets(payload:any):SharedAsset[]{
  const records=obj(payload).records;if(!Array.isArray(records)||records.length>SHARED_LIMITS.pageSize*2)throw new Error('Invalid shared records');
  const masters=new Map<string,any>(),assets=new Map<string,any>();
  for(const value of records){const r=obj(value),name=str(r.recordName);if(['error','errors','serverErrorCode'].some(key=>key in r))throw new Error('Shared record error');const map=r.recordType==='CPLMaster'?masters:r.recordType==='CPLAsset'?assets:null;if(!map||map.has(name))throw new Error('Invalid shared record identity');map.set(name,obj(r.fields));}
  const used=new Set<string>();const result:SharedAsset[]=[];
  for(const [assetRecordName,fields] of assets){const masterRecordName=str(obj(obj(fields.masterRef).value).recordName),master=masters.get(masterRecordName);if(!master||used.has(masterRecordName))throw new Error('Invalid shared master pairing');used.add(masterRecordName);
    const date=master.originalCreationDate?.value;
    const checksums:string[]=[];for(const source of [master,fields])for(const [key,value]of Object.entries(source)){if(/^res.*Res$/.test(key)){const checksum=obj(obj(value).value).fileChecksum;if(checksum!==undefined)checksums.push(str(checksum));}}
    result.push({assetRecordName,masterRecordName,originalCreationDate:Number.isSafeInteger(date)&&Math.abs(date)<=8640000000000000?date:null,checksums:[...new Set(checksums)]});
  }
  if(used.size!==masters.size)throw new Error('Unpaired shared master');return result;
}
export async function readSharedAlbumAssets(session:CloudSession,album:SharedAlbum){
  str(album.guid);str(album.ctag);const t=transport(session);const assets:SharedAsset[]=[];let pages=0;const seen=new Set<string>();
  try{
    const count=await t.post(albumURL(album,t.root,'webgetassetcount'),{albumguid:album.guid});
    if(!Number.isSafeInteger(count.albumassetcount)||count.albumassetcount<0)throw new Error('Invalid shared asset count');
    const total=count.albumassetcount as number;
    while(assets.length<total&&pages<SHARED_LIMITS.maxPages){
      const offset=assets.length,pageSize=Math.min(SHARED_LIMITS.pageSize,total-offset),limit=offset+pageSize*2;
      const payload=await t.post(albumURL(album,t.root,'webgetassets'),{albumguid:album.guid,albumctag:album.ctag,limit:String(limit),offset:String(offset)});pages++;
      const page=parseSharedAssets(payload);if(!page.length||page.length>pageSize)throw new Error('Shared pagination mismatch');
      for(const asset of page){if(seen.has(asset.assetRecordName))throw new Error('Repeated shared asset');seen.add(asset.assetRecordName);assets.push(asset);}
    }
    return {assets,total,pages,responseBytes:t.bytes,complete:assets.length===total,countMatched:assets.length===total,snapshotConsistencyVerified:false as const,stoppedBy:assets.length===total?'count-reached' as const:'page-cap' as const,originalLibraryMembershipVerified:false as const};
  }finally{t.close();}
}
// No names, IDs, location URLs or content values in the default evidence.
export function sharedAlbumsEvidence(result:Awaited<ReturnType<typeof readSharedAlbums>>){return {source:'direct-icloud-sharedstreams',albumsRead:result.albums.length,exactTargetMatches:result.matches.length,targetSelection:result.matches.length===1?'unique-in-response':result.matches.length===0?'not-found-in-response':'ambiguous',responseBytes:result.responseBytes,inventoryPaginationVerified:false,uploadVerified:false};}
