// Local Photos is an explicitly authorized research reference, never a cloud
// feature fallback. Existing person annotations only; no image/face inference.
import {Database} from 'bun:sqlite';
import {lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import type {Photo} from './photos';
import {diagnosePerson} from './local-person-diagnostics';
export interface LocalReference {localUuid:string;cloudAssetGuid:string|null;filename:string;assetDate:number;}
const epoch=Date.UTC(2001,0,1);
export function matchingPersonLabels(db:Database,search:string):string[] {
 if(!search.trim()||search.length>256)throw new Error('Invalid person search');
 const columns=new Set((db.query('PRAGMA table_info(ZPERSON)').all() as any[]).map(row=>row.name));
 if(!columns.has('ZFULLNAME'))throw new Error('Unsupported person schema');
 const filters=['ZCLOUDDELETESTATE','ZMERGETARGETPERSON'].filter(k=>columns.has(k)).map(k=>`AND COALESCE(${k},0)=0`).join(' ');
 // Keep duplicate names: two distinct active person rows with the same name are
 // ambiguous. Discovery and the subsequent exact-label join share one snapshot.
 const rows=db.query(`SELECT ZFULLNAME AS name FROM ZPERSON WHERE instr(lower(ZFULLNAME),lower(?))>0 ${filters} ORDER BY ZFULLNAME LIMIT 21`).all(search) as any[];
 if(rows.length>20)throw new Error('Too many matching person labels');
 return rows.map(row=>{if(typeof row.name!=='string'||row.name.length>256)throw new Error('Invalid person label');return row.name;});
}
export function personReferences(db:Database,person:string):LocalReference[] {
 if(!person.trim()||person.length>256)throw new Error('Invalid person label');
 const columns=(table:string)=>new Set((db.query(`PRAGMA table_info(${table})`).all() as any[]).map(row=>row.name));
 const a=columns('ZASSET'),p=columns('ZPERSON'),f=columns('ZDETECTEDFACE');
 for(const key of ['Z_PK','ZUUID','ZCLOUDASSETGUID','ZFILENAME','ZDATECREATED','ZHIDDEN','ZTRASHEDSTATE'])if(!a.has(key))throw new Error('Unsupported asset schema');
 for(const key of ['Z_PK','ZFULLNAME'])if(!p.has(key))throw new Error('Unsupported person schema');
 const foreignKey=(choices:string[])=>{const present=choices.filter(c=>f.has(c));if(present.length!==1)throw new Error('Unsupported face relation');return present[0];};
 const assetFK=foreignKey(['ZASSETFORFACE','ZASSET']),personFK=foreignKey(['ZPERSONFORFACE','ZPERSON']);
 const filters=[...['ZHIDDEN','ZISINTRASH'].filter(k=>f.has(k)).map(k=>`COALESCE(f.${k},0)=0`),...['ZCLOUDDELETESTATE','ZMERGETARGETPERSON'].filter(k=>p.has(k)).map(k=>`COALESCE(p.${k},0)=0`)];
 const rows=db.query(`SELECT DISTINCT a.ZUUID AS localUuid,a.ZCLOUDASSETGUID AS cloudAssetGuid,a.ZFILENAME AS filename,a.ZDATECREATED AS date FROM ZASSET a JOIN ZDETECTEDFACE f ON f.${assetFK}=a.Z_PK JOIN ZPERSON p ON p.Z_PK=f.${personFK} WHERE p.ZFULLNAME=? AND a.ZHIDDEN=0 AND a.ZTRASHEDSTATE=0 ${filters.map(f=>'AND '+f).join(' ')} ORDER BY a.ZDATECREATED DESC LIMIT 20`).all(person) as any[];
 return rows.map(row=>{
  if(typeof row.localUuid!=='string'||typeof row.filename!=='string'||typeof row.date!=='number'||!Number.isFinite(row.date)||(row.cloudAssetGuid!==null&&typeof row.cloudAssetGuid!=='string'))throw new Error('Invalid local reference');
  return {localUuid:row.localUuid,cloudAssetGuid:row.cloudAssetGuid,filename:row.filename,assetDate:Math.round(epoch+row.date*1000)};
 });
}
export function compareReferences(local:readonly LocalReference[],cloud:readonly Photo[]) {
 const zones=new Set(cloud.map(photo=>JSON.stringify(Object.entries(photo.library.zoneID).sort(([a],[b])=>a.localeCompare(b)))));
 if(zones.size>1||cloud.some(photo=>photo.library.database!=='private'||photo.library.zoneID.zoneName!=='PrimarySync'))throw new Error('Ambiguous cloud library scope');
 const byId=new Map(cloud.map(photo=>[photo.assetRecordName,photo]));
 if(byId.size!==cloud.length)throw new Error('Ambiguous cloud asset identifiers');
 return local.map(reference=>{const photo=reference.cloudAssetGuid?byId.get(reference.cloudAssetGuid):undefined;
  const guidMatch=!!photo,filenameMatch=!!photo&&photo.filename===reference.filename,dateMatch=!!photo&&photo.assetDate!==null&&Math.abs(photo.assetDate-reference.assetDate)<=1;
  return {reference,photo,guidMatch,filenameMatch,dateMatch,corroborated:guidMatch&&filenameMatch&&dateMatch};
 });
}
async function main(args:string[]) {
 if(args.length!==4||!['--person','--person-contains','--diagnose-person'].includes(args[0])||args[2]!=='--output')throw new Error('Invalid arguments');
 const directory=resolve(homedir(),'.icloud-photos-session');
 const output=resolve(args[3]);if(dirname(output)!==directory)throw new Error('Output must use private session directory');
 const ds=await lstat(directory);if(!ds.isDirectory()||ds.isSymbolicLink()||(ds.mode&0o777)!==0o700||ds.uid!==process.getuid?.())throw new Error('Unsafe output directory');
 const path=join(homedir(),'Pictures/Photos Library.photoslibrary/database/Photos.sqlite');
 const wal=await lstat(path+'-wal').catch(()=>null),shm=await lstat(path+'-shm').catch(()=>null);
 if(wal&&!shm)throw new Error('Missing WAL companion');
 const db=new Database(path,{readonly:true});let refs:LocalReference[]=[];let diagnostic:ReturnType<typeof diagnosePerson>|undefined;
 try{
  db.exec('PRAGMA query_only=ON');db.exec('BEGIN');
  let label=args[1];
  if(args[0]==='--person-contains'){
   const labels=matchingPersonLabels(db,args[1]);
   if(labels.length!==1){console.log(JSON.stringify({status:'person-label-selection-needed',matchingLabels:labels,outputWritten:false}));db.exec('ROLLBACK');return;}
   label=labels[0];
  }
  if(args[0]==='--diagnose-person')diagnostic=diagnosePerson(db,label);
  else refs=personReferences(db,label);
  db.exec('ROLLBACK');
 }finally{db.close();}
 const file=await open(output,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(JSON.stringify(diagnostic?{version:1,source:'local-person-diagnostic',selectedDatabase:path,diagnostic}:{version:1,source:'local-existing-person-label',references:refs}));await file.sync();}finally{await file.close();}
 console.log(JSON.stringify(diagnostic?{status:'diagnostic-saved',selectedDatabase:path,photosModified:false}:{status:'references-saved',count:refs.length,cloudGuidsPresent:refs.filter(r=>r.cloudAssetGuid).length,photosModified:false}));
}
if(import.meta.main)main(process.argv.slice(2)).catch(()=>{console.error(JSON.stringify({status:'local-reference-unavailable',nextStep:'Check Photos privacy access, supported schema, and private output path. Existing files are never overwritten.'}));process.exitCode=1;});
