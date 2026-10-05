import {test,expect} from 'bun:test';
import {mkdtemp,realpath,rm,stat,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SessionStore} from './session-store';
import {resumePersonSchema,checkedCursor} from './schema-cursor';
test('validated page cursor persists privately and resumes without replay; malformed page preserves last checkpoint',async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'schema-cursor-test-')));
 try{
 await new SessionStore(dir).save({version:1,dsid:'123',accountName:'synthetic',clientId:'auth-12345678-1234-1234-1234-123456789012',cookies:{cookies:[]},headers:{}});
 let call=0;
 const session={dsid:'123',webservices:{ckdatabasews:{url:'https://p01-ckdatabasews.icloud.com'}},request:async(_u:any,i:any)=>{
  const body=JSON.parse(i.body);call++;
  expect(body.zones[0].syncToken).toBe(call===1?undefined:'synthetic-first');
  return Response.json({zones:[{zoneID:{zoneName:'PrimarySync'},syncToken:call===1?'synthetic-first':'synthetic-second',moreComing:true,records:call===1?[{deleted:true}]:[{fields:null}]}]});
 }};
 const one=await resumePersonSchema(session,dir,{maxPages:1,maxRecords:100});
 expect(one.resumed).toBe(false);expect(one.totalRecordsSeen).toBe(1);
 expect((await stat(join(dir,'people-schema-cursor.json'))).mode&0o777).toBe(0o600);
 const before=await readFile(join(dir,'people-schema-cursor.json'),'utf8');
 await expect(resumePersonSchema(session,dir,{maxPages:1,maxRecords:100})).rejects.toThrow();
 expect(await readFile(join(dir,'people-schema-cursor.json'),'utf8')).toBe(before);
 await writeFile(join(dir,'.people-schema.lock'),'owned',{mode:0o600});
 await expect(resumePersonSchema(session,dir)).rejects.toThrow('session_cache_unsafe');expect(call).toBe(2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('cursor rejects wrong account, malformed zone and oversized token',()=>{
 const good={version:1,dsid:'123',syncToken:'synthetic',zoneID:{zoneName:'PrimarySync'},recordsSeen:1};
 expect(checkedCursor(good,'123')).toEqual(good);
 for(const value of [{...good,dsid:'456'},{...good,zoneID:undefined},{...good,zoneID:{zoneName:'Other'}},{...good,syncToken:'x'.repeat(16385)}])expect(()=>checkedCursor(value,'123')).toThrow();
});
