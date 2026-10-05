import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {diagnosePerson} from './local-person-diagnostics';
test('diagnoses name absence, filter exclusion and asset exclusion without leaking IDs or other names',()=>{
 const db=new Database(':memory:');try{
  db.exec('CREATE TABLE ZPERSON(Z_PK INTEGER,ZFULLNAME TEXT,ZCLOUDDELETESTATE INTEGER,ZMERGETARGETPERSON INTEGER);CREATE TABLE ZDETECTEDFACE(ZPERSONFORFACE INTEGER,ZASSETFORFACE INTEGER,ZHIDDEN INTEGER);CREATE TABLE ZASSET(Z_PK INTEGER,ZFILENAME TEXT,ZHIDDEN INTEGER,ZTRASHEDSTATE INTEGER);');
  db.exec("INSERT INTO ZPERSON VALUES(98991,'Example Chu',0,98991),(42,'Other Secret Person',0,0);INSERT INTO ZASSET VALUES(56789,'IMG_2151.HEIC',0,0);INSERT INTO ZDETECTEDFACE VALUES(98991,56789,0);");
  const d:any=diagnosePerson(db,'Example Chu');expect(d.nameRows).toBe(1);expect(d.currentFilterPersonRows).toBe(0);expect(d.states.mergeTargetIsSelf).toBe(1);expect(d.joinedAssetsUnfiltered).toBe(1);expect(d.afterPersonFilters).toBe(0);expect(d.targets[0].assetRows).toBe(1);
  for(const secret of ['98991','56789','Other Secret Person'])expect(JSON.stringify(d)).not.toContain(secret);
  expect((diagnosePerson(db,'Absent') as any).nameRows).toBe(0);
  db.exec('UPDATE ZPERSON SET ZMERGETARGETPERSON=0 WHERE Z_PK=98991;UPDATE ZASSET SET ZHIDDEN=1;');
  const hidden:any=diagnosePerson(db,'Example Chu');expect(hidden.afterFaceFilters).toBe(1);expect(hidden.afterAssetFilters).toBe(0);
  db.exec('DELETE FROM ZDETECTEDFACE;');expect((diagnosePerson(db,'Example Chu') as any).joinedAssetsUnfiltered).toBe(0);
 }finally{db.close();}
});
