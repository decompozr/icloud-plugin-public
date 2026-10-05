import { ProbeError, type ProbeStage } from "./probe-diagnostics";
// icloudpd 879c561 services/photos.py _fetch_folders/albums: one response, no proven paging.
import { cloudTransport, primaryLibrary, responseLibrary, type CloudSession } from './cloud-client';
export async function readCloudAlbums(session: CloudSession, onStage?: (stage: ProbeStage) => void) {
  onStage?.('service-discovery');
  const transport = cloudTransport(session);
  try {
    onStage?.('photos-indexing');
    const indexing = await transport.post({query:{recordType:'CheckIndexingState'},zoneID:primaryLibrary.zoneID});
    if(indexing?.records?.[0]?.fields?.state?.value!=='FINISHED') throw new ProbeError('photos_indexing_not_ready');
    onStage?.('albums-read');
    const payload = await transport.post({query:{recordType:'CPLAlbumByPositionLive'},zoneID:primaryLibrary.zoneID});
    if(!Array.isArray(payload?.records))throw new Error('Invalid album response');
    const library=responseLibrary(payload,primaryLibrary,true);
    const albums: {id:string;recordName:string;library:typeof primaryLibrary;name:string}[]=[];
    const seen=new Set<string>();
    let capped=false;
    for(const record of payload.records){
      if(!record || typeof record.recordName!=='string' || !record.recordName || record.recordName.length>512 || !record.fields || typeof record.fields!=='object')throw new Error('Invalid album record');
      if(['----Root-Folder----','----Project-Root-Folder----'].includes(record.recordName)||record.fields.isDeleted?.value)continue;
      if(record.zoneID!==undefined)responseLibrary({records:[record]},library,false);
      if(seen.has(record.recordName))throw new Error('Duplicate album record');
      seen.add(record.recordName);
      if(albums.length===20){capped=true;break;}
      const encoded=record.fields.albumNameEnc?.value;
      if(typeof encoded!=='string'||encoded.length>4096||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new Error('Invalid album name encoding');
      const bytes=Buffer.from(encoded,'base64');
      if(bytes.toString('base64')!==encoded)throw new Error('Invalid album name encoding');
      const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      albums.push({id:JSON.stringify([library.database,library.zoneID,record.recordName]),recordName:record.recordName,library,name});
    }
    return {albums,pages:1,responseBytes:transport.responseBytes,complete:false as const,stoppedBy:capped?'item-cap' as const:'pagination-unverified' as const};
  } finally {transport.close();}
}
export function albumEvidence(result:Awaited<ReturnType<typeof readCloudAlbums>>, showAlbums = false){
  return {source:'direct-icloud-http',albumsRead:result.albums.length,pages:result.pages,responseBytes:result.responseBytes,complete:result.complete,stoppedBy:result.stoppedBy,peopleSearchVerified:false,...(showAlbums?{albums:result.albums.map(album=>({recordName:album.recordName,name:album.name,library:album.library}))}:{})};
}
