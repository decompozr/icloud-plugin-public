import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {personReferences,compareReferences,matchingPersonLabels} from './local-cloud-reference';
import {parsePage} from './photos';
import {pair,library} from './fixture';
test('name discovery returns only substring matching active labels and treats SQL metacharacters literally',()=>{
 const db=new Database(':memory:');
 try{db.exec("CREATE TABLE ZPERSON(ZFULLNAME TEXT,ZCLOUDDELETESTATE INTEGER,ZMERGETARGETPERSON INTEGER);INSERT INTO ZPERSON VALUES('Example Example',0,0),('Other',0,0),('Example Old',0,1),('Example Deleted',1,0);");
  expect(matchingPersonLabels(db,'example')).toEqual(['Example Example']);
  expect(matchingPersonLabels(db,'%')).toEqual([]);
  db.exec("INSERT INTO ZPERSON VALUES('Example Second',0,0);");
  expect(matchingPersonLabels(db,'Example')).toEqual(['Example Example','Example Second']);
  db.exec("INSERT INTO ZPERSON VALUES('Example Example',0,0);");
  expect(matchingPersonLabels(db,'Example Example')).toHaveLength(2);
 }finally{db.close();}
});
test('existing exact person annotation joins supported FKs and excludes merged/hidden assets',()=>{
 const db=new Database(':memory:');
 try{
  db.exec('CREATE TABLE ZASSET(Z_PK INTEGER,ZUUID TEXT,ZCLOUDASSETGUID TEXT,ZFILENAME TEXT,ZDATECREATED REAL,ZHIDDEN INTEGER,ZTRASHEDSTATE INTEGER); CREATE TABLE ZPERSON(Z_PK INTEGER,ZFULLNAME TEXT,ZCLOUDDELETESTATE INTEGER,ZMERGETARGETPERSON INTEGER); CREATE TABLE ZDETECTEDFACE(ZASSETFORFACE INTEGER,ZPERSONFORFACE INTEGER,ZHIDDEN INTEGER);');
  db.exec("INSERT INTO ZPERSON VALUES(1,'Synthetic Person',0,0),(2,'Synthetic Person',0,1),(3,'Other',0,0);INSERT INTO ZASSET VALUES(1,'local-only','asset-one','IMG_0001.HEIC',0,0,0),(2,'hidden','asset-two','other',0,1,0),(3,'merged','asset-three','other',0,0,0);INSERT INTO ZDETECTEDFACE VALUES(1,1,0),(1,1,0),(2,1,0),(3,2,0);");
  expect(personReferences(db,'Synthetic Person')).toEqual([{localUuid:'local-only',cloudAssetGuid:'asset-one',filename:'IMG_0001.HEIC',assetDate:Date.UTC(2001,0,1)}]);
  expect(personReferences(db,"Synthetic Person' OR 1=1 --")).toEqual([]);
 }finally{db.close();}
});
test('cloud asset GUID plus corroboration required; local UUID/master/name alone never proves match',()=>{
 const photos=parsePage({records:pair('one')},library);photos[0].assetDate=1000;
 const base={localUuid:'asset-one',cloudAssetGuid:'asset-one',filename:'IMG_0001.HEIC',assetDate:1000};
 expect(compareReferences([base],photos)[0].corroborated).toBe(true);
 for(const changed of [{cloudAssetGuid:null},{cloudAssetGuid:'master-one'},{cloudAssetGuid:'other'},{filename:'different'},{assetDate:2000}])expect(compareReferences([{...base,...changed}],photos)[0].corroborated).toBe(false);
 expect(()=>compareReferences([base],[...photos,...photos])).toThrow('Ambiguous');
 expect(()=>compareReferences([base],[{...photos[0],library:{...library,database:'shared'}}])).toThrow('scope');
});
