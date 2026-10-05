import {readCloudPhotos,type CloudSession} from './cloud-client';
import type {ProbeStage} from './probe-diagnostics';

export function monthBounds(month:string,timeZone='America/Toronto') {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4))<1000)throw new Error('Invalid UTC month');
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const localMidnight=(utc:number)=>{let candidate=utc;for(let i=0;i<4;i++){const parts=Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value]));const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));const difference=utc-represented;if(!difference)return candidate;candidate+=difference;}throw new Error('Unresolvable month timezone boundary');};
  const nominal=Date.parse(`${month}-01T00:00:00.000Z`);
  const end=new Date(nominal);end.setUTCMonth(end.getUTCMonth()+1);
  return {from:localMidnight(nominal),to:localMidnight(end.getTime())};
}
// Source-backed assetDate is UTC epoch milliseconds. Filtering is local to the
// bounded direct-cloud sample; no undocumented server-side filter is implied.
export async function readCloudMonth(session:CloudSession,month:string,onStage?:(stage:ProbeStage)=>void,startRank=0) {
  const {from,to}=monthBounds(month);
  const result=await readCloudPhotos(session,undefined,onStage,startRank);
  const photos=result.photos.filter(p=>p.assetDate!==null&&p.assetDate>=from&&p.assetDate<to);
  const dates=result.photos.flatMap(p=>p.assetDate===null?[]:[p.assetDate]);
  return {photos,evidence:{source:'direct-icloud-http',month,timeZone:'America/Toronto',
    startRank,nextRank:startRank+result.photos.length,
    earliestScanned:dates.length?new Date(Math.min(...dates)).toISOString():null,
    latestScanned:dates.length?new Date(Math.max(...dates)).toISOString():null,
    scanned:result.photos.length,matched:photos.length,unknownDates:result.photos.filter(p=>p.assetDate===null).length,
    pages:result.pages,responseBytes:result.responseBytes,complete:result.complete&&startRank===0&&dates.length===result.photos.length,exhausted:result.complete,stoppedBy:result.stoppedBy,
    selectionScope:'month filter over bounded cloud sample',personFilterApplied:false,personSearchVerified:false}};
}

export async function scanCloudMonth(session:CloudSession,month:string,options:{startRank?:number;maxWindows?:number}={}) {
  monthBounds(month);
  const maxWindows=options.maxWindows??10;
  if(!Number.isSafeInteger(maxWindows)||maxWindows<1||maxWindows>100)throw new Error('Invalid window cap');
  let rank=options.startRank??0,scanned=0,unknownDates=0,pages=0,responseBytes=0;
  const started=Date.now();
  const photos:Awaited<ReturnType<typeof readCloudMonth>>['photos']=[];
  const ids=new Set<string>();
  let exhausted=false,stoppedBy='window-cap';
  for(let window=0;window<maxWindows;window++){
    // Each window already has a 2 MiB / 30s bound. Reserve one whole window
    // before starting, keeping aggregate below 32 MiB and about 75 seconds.
    if(responseBytes>30*1024*1024){stoppedBy='byte-cap';break;}
    if(Date.now()-started>45000){stoppedBy='time-cap';break;}
    const result=await readCloudMonth(session,month,undefined,rank);
    responseBytes+=result.evidence.responseBytes;
    scanned+=result.evidence.scanned;unknownDates+=result.evidence.unknownDates;pages+=result.evidence.pages;
    for(const photo of result.photos){if(ids.has(photo.id))throw new Error('Repeated asset during month scan');ids.add(photo.id);photos.push(photo);}
    rank=result.evidence.nextRank;
    if(result.evidence.exhausted){exhausted=true;stoppedBy='empty-page';break;}
  }
  const complete=exhausted&&(options.startRank??0)===0&&unknownDates===0;
  return {photos,evidence:{source:'direct-icloud-http',month,timeZone:'America/Toronto',startRank:options.startRank??0,nextRank:rank,scanned,matched:photos.length,unknownDates,pages,responseBytes,complete,exhausted,
    stoppedBy,personFilterApplied:false,personSearchVerified:false,
    consistency:'rank scan; concurrent library changes may shift results'}};
}
