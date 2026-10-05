import type {Database} from 'bun:sqlite';
// Diagnostic counts only: never emit person/asset primary keys, GUIDs, or names.
export function diagnosePerson(db:Database,label:string) {
 if(!label.trim()||label.length>256)throw new Error('Invalid person label');
 const cols=(table:string)=>(db.query(`PRAGMA table_info(${table})`).all() as any[]).map(r=>r.name as string);
 const person=cols('ZPERSON'),face=cols('ZDETECTEDFACE'),asset=cols('ZASSET');
 const schema={person:person.filter(k=>['Z_PK','ZFULLNAME','ZCLOUDDELETESTATE','ZMERGETARGETPERSON'].includes(k)),face:face.filter(k=>['ZPERSON','ZPERSONFORFACE','ZASSET','ZASSETFORFACE','ZHIDDEN','ZISINTRASH'].includes(k)),asset:asset.filter(k=>['Z_PK','ZFILENAME','ZHIDDEN','ZTRASHEDSTATE','ZCLOUDASSETGUID'].includes(k))};
 if(!person.includes('Z_PK')||!person.includes('ZFULLNAME'))return {schema,status:'unsupported-person-schema'};
 const count=(sql:string,params:any[]=[])=>Number((db.query(sql).get(...params) as any).n);
 const nameRows=count('SELECT COUNT(*) n FROM ZPERSON WHERE ZFULLNAME=?',[label]);
 const normalizedNameRows=count('SELECT COUNT(*) n FROM ZPERSON WHERE lower(trim(ZFULLNAME))=lower(trim(?))',[label]);
 const states:Record<string,number>={};
 for(const key of ['ZCLOUDDELETESTATE','ZMERGETARGETPERSON'].filter(k=>person.includes(k))){
  for(const [state,predicate] of [['null',`${key} IS NULL`],['zero',`${key}=0`],['nonzero',`${key}<>0`]])states[`${key}_${state}`]=count(`SELECT COUNT(*) n FROM ZPERSON WHERE ZFULLNAME=? AND ${predicate}`,[label]);
 }
 if(person.includes('ZMERGETARGETPERSON'))states.mergeTargetIsSelf=count('SELECT COUNT(*) n FROM ZPERSON WHERE ZFULLNAME=? AND ZMERGETARGETPERSON=Z_PK',[label]);
 const pFilters=['ZCLOUDDELETESTATE','ZMERGETARGETPERSON'].filter(k=>person.includes(k)).map(k=>`COALESCE(p.${k},0)=0`);
 const currentFilterPersonRows=count(`SELECT COUNT(*) n FROM ZPERSON p WHERE p.ZFULLNAME=? ${pFilters.map(f=>'AND '+f).join(' ')}`,[label]);
 const pKeys=['ZPERSON','ZPERSONFORFACE'].filter(k=>face.includes(k)),aKeys=['ZASSET','ZASSETFORFACE'].filter(k=>face.includes(k));
 const targets=['IMG_2151.HEIC','IMG_2152.HEIC'].map(filename=>({filename,assetRows:asset.includes('ZFILENAME')?count('SELECT COUNT(*) n FROM ZASSET WHERE ZFILENAME=?',[filename]):null}));
 const result={schema,status:'counts-only',nameRows,normalizedNameRows,currentFilterPersonRows,states,targets};
 if(pKeys.length!==1||aKeys.length!==1||!asset.includes('Z_PK'))return {...result,joinStatus:'unsupported-face-relations'};
 const from=`FROM ZPERSON p JOIN ZDETECTEDFACE f ON f.${pKeys[0]}=p.Z_PK JOIN ZASSET a ON a.Z_PK=f.${aKeys[0]} WHERE p.ZFULLNAME=?`;
 const faceFilters=['ZHIDDEN','ZISINTRASH'].filter(k=>face.includes(k)).map(k=>`COALESCE(f.${k},0)=0`);
 const assetFilters=['ZHIDDEN','ZTRASHEDSTATE'].filter(k=>asset.includes(k)).map(k=>`a.${k}=0`);
 const stages=[[],pFilters,[...pFilters,...faceFilters],[...pFilters,...faceFilters,...assetFilters]].map(filters=>count(`SELECT COUNT(DISTINCT a.Z_PK) n ${from} ${filters.map(f=>'AND '+f).join(' ')}`,[label]));
 return {...result,joinStatus:'supported',joinedAssetsUnfiltered:stages[0],afterPersonFilters:stages[1],afterFaceFilters:stages[2],afterAssetFilters:stages[3],targets:targets.map(t=>({...t,personJoinedRows:asset.includes('ZFILENAME')?count(`SELECT COUNT(DISTINCT a.Z_PK) n ${from} AND a.ZFILENAME=?`,[label,t.filename]):null}))};
}
