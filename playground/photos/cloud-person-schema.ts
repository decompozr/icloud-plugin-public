import { ProbeError, type ProbeStage } from "./probe-diagnostics";
// Source-informed schema sampling only: rhoopr/kei feed7b1781, queries.rs + album/changes.rs.
import {cloudTransport,primaryLibrary,responseLibrary,type CloudSession} from './cloud-client';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(v);
export interface SchemaCursor {version:1;dsid:string;syncToken:string;zoneID:Record<string,string>;recordsSeen:number;}
export async function readCloudPersonSchema(session:CloudSession, onStage?: (stage: ProbeStage) => void,limits={maxPages:2,maxRecords:200},resume?:{cursor?:SchemaCursor;checkpoint:(cursor:SchemaCursor)=>Promise<void>}){
 if(!Number.isSafeInteger(limits.maxPages)||limits.maxPages<1||limits.maxPages>20||!Number.isSafeInteger(limits.maxRecords)||limits.maxRecords<1||limits.maxRecords>2000)throw new Error('Invalid schema bounds');
 if(resume?.cursor&&resume.cursor.dsid!==session.dsid)throw new ProbeError('session_account_mismatch');
 onStage?.('service-discovery');
 const transport=cloudTransport(session,'changes/zone');
 let token=resume?.cursor?.syncToken;
 let library=resume?.cursor?responseLibrary({records:[{zoneID:resume.cursor.zoneID}]},primaryLibrary,true):primaryLibrary;
 const visited=new Set<string>();
 const types=new Map<string,{count:number;fields:Set<string>}>();
 let pages=0,recordsRead=0,deletedRecords=0,suppressedIdentifiers=0;
 let complete=false;
 try{
  onStage?.('people-schema-read');
  while(pages<limits.maxPages&&recordsRead<limits.maxRecords){
   const limit=Math.min(100,limits.maxRecords-recordsRead);
   const response=await transport.post({zones:[{zoneID:library.zoneID,resultsLimit:limit,...(token===undefined?{}:{syncToken:token})}]});
   pages++;
   if(!object(response)||response.serverErrorCode!=null||!Array.isArray(response.zones)||response.zones.length!==1)throw new Error('Invalid schema zone response');
   const zone=response.zones[0];
   if(!object(zone)||zone.serverErrorCode!=null||!object(zone.zoneID))throw new Error('Unexpected schema zone');
   library=responseLibrary({records:[{zoneID:zone.zoneID}]},library,pages===1&&!resume?.cursor);
   if(!Array.isArray(zone.records)||zone.records.length>limit||typeof zone.moreComing!=='boolean'||typeof zone.syncToken!=='string'||!zone.syncToken.trim()||zone.syncToken.length>16384||visited.has(zone.syncToken))throw new Error('Invalid or repeated schema continuation');
   visited.add(zone.syncToken);
   for(const record of zone.records){
    if(!object(record)||record.serverErrorCode!=null)throw new Error('Invalid schema record');
    if(record.zoneID!==undefined)responseLibrary({records:[record]},library,false);
    recordsRead++;
    if(record.deleted===true&&record.recordType==null){deletedRecords++;continue;}
    if(!object(record.fields))throw new Error('Missing schema record fields');
    if(!identifier(record.recordType)){suppressedIdentifiers++;continue;}
    if(!types.has(record.recordType)){
     if(types.size>=64)throw new Error('Schema type bound exceeded');
     types.set(record.recordType,{count:0,fields:new Set()});
    }
    const entry=types.get(record.recordType)!;entry.count++;
    const keys=Object.keys(record.fields);
    if(keys.length>256)throw new Error('Schema field bound exceeded');
    for(const key of keys){
     if(!identifier(key)){suppressedIdentifiers++;continue;}
     entry.fields.add(key);
     if(entry.fields.size>256)throw new Error('Schema field bound exceeded');
    }
   }
   if(zone.moreComing&&zone.syncToken===token)throw new Error('Nonprogressing schema continuation');
   if(resume)await resume.checkpoint({version:1,dsid:session.dsid,syncToken:zone.syncToken,zoneID:library.zoneID,recordsSeen:(resume.cursor?.recordsSeen??0)+recordsRead});
   if(!zone.moreComing){complete=true;break;}
   token=zone.syncToken;
  }
  return {source:'direct-icloud-http',scope:'PrimarySync change-record schema sample',resumed:!!resume?.cursor,totalRecordsSeen:(resume?.cursor?.recordsSeen??0)+recordsRead,pages,recordsRead,deletedRecords,responseBytes:transport.responseBytes,complete,
   stoppedBy:complete?'moreComing-false':recordsRead>=limits.maxRecords?'record-cap':'page-cap',
   recordTypes:[...types].sort(([a],[b])=>a.localeCompare(b)).map(([recordType,data])=>({recordType,count:data.count,fieldNames:[...data.fields].sort()})),
   suppressedIdentifiers,personSearchVerified:false,namesDecoded:false,personAssetMappingsDecoded:false,
   absenceInterpretation:'Missing person record types in this bounded sample is inconclusive; counts are change records, not unique people or photos'};
 }finally{transport.close();}
}
