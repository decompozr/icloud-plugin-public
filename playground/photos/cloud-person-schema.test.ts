import {expect,test} from 'bun:test';
import {readCloudPersonSchema} from './cloud-person-schema';
import type {CloudSession} from './cloud-client';
const page=(records:any[],syncToken='secret-token',moreComing=false)=>({zones:[{zoneID:{zoneName:'PrimarySync'},records,syncToken,moreComing}]});
const record=(recordType='CPLPerson')=>({recordType,recordName:'private-record-id',fields:{nameEnc:{value:'private-person-name'}}});
test('extended schema bounds remain explicit and bounded before network',async()=>{
 const f=fixture([]);
 await expect(readCloudPersonSchema(f.session,undefined,{maxPages:21,maxRecords:2000})).rejects.toThrow('bounds');
 await expect(readCloudPersonSchema(f.session,undefined,{maxPages:20,maxRecords:2001})).rejects.toThrow('bounds');
 expect(f.bodies).toHaveLength(0);
});
test('schema continuation retains full server zone and rejects zone type drift',async()=>{
 const zoneID={zoneName:'PrimarySync',ownerRecordName:'synthetic-owner',zoneType:'REGULAR_CUSTOM_ZONE'};
 const first=page([{...record(),zoneID}],'first',true);
 const second=page([{...record(),zoneID}],'second',false);
 first.zones[0].zoneID=zoneID;second.zones[0].zoneID=zoneID;
 const f=fixture([first,second]);
 expect((await readCloudPersonSchema(f.session)).recordsRead).toBe(2);
 expect(f.bodies[1].zones[0].zoneID).toEqual(zoneID);
 const changed={...second,zones:[{...second.zones[0],zoneID:{...zoneID,zoneType:'OTHER'}}]};
 await expect(readCloudPersonSchema(fixture([first,changed]).session)).rejects.toThrow('photos_zone_mismatch');
 const recordChanged={...second,zones:[{...second.zones[0],records:[{...record(),zoneID:{...zoneID,zoneType:'OTHER'}}]}]};
 await expect(readCloudPersonSchema(fixture([first,recordChanged]).session)).rejects.toThrow('photos_zone_mismatch');
});
function fixture(pages:any[]){
 const bodies:any[]=[];
 const session:CloudSession={dsid:'123',webservices:{ckdatabasews:{url:'https://p42-ckdatabasews.icloud.com'}},async request(url,init){
  expect(new URL(url).pathname).toBe('/database/1/com.apple.photos.cloud/production/private/changes/zone');expect(init?.redirect).toBe('manual');
  bodies.push(JSON.parse(String(init?.body)));return Response.json(pages[bodies.length-1]);
 }};return {session,bodies};
}
test('empty moreComing page continues with opaque token; output only schema and counts',async()=>{
 const {session,bodies}=fixture([page([],'first-secret',true),page([record(),{recordType:null,deleted:true,recordName:'deleted-id'}],'last-secret')]);
 const result=await readCloudPersonSchema(session);
 expect(bodies[0]).toEqual({zones:[{zoneID:{zoneName:'PrimarySync'},resultsLimit:100}]});
 expect(bodies[1].zones[0].syncToken).toBe('first-secret');expect(result.complete).toBe(true);expect(result.pages).toBe(2);expect(result.deletedRecords).toBe(1);
 expect(result.recordTypes).toEqual([{recordType:'CPLPerson',count:1,fieldNames:['nameEnc']}]);expect(result.personSearchVerified).toBe(false);
 for(const value of ['private-record-id','private-person-name','first-secret','last-secret','deleted-id'])expect(JSON.stringify(result)).not.toContain(value);
});
test('record/page caps report incomplete even on empty moreComing pages',async()=>{
 const records=Array.from({length:100},()=>record('CPLAsset'));
 const result=await readCloudPersonSchema(fixture([page(records,'one',true),page(records,'two',true)]).session);
 expect(result.recordsRead).toBe(200);expect(result.complete).toBe(false);expect(result.stoppedBy).toBe('record-cap');
 const empty=await readCloudPersonSchema(fixture([page([],'one',true),page([],'two',true)]).session);
 expect(empty.stoppedBy).toBe('page-cap');expect(empty.complete).toBe(false);
});
test('rejects missing/repeated tokens, malformed zones/errors/records before following',async()=>{
 const repeated=fixture([page([],'same',true),page([],'same',true)]);await expect(readCloudPersonSchema(repeated.session)).rejects.toThrow('continuation');
 const invalid:any[]=[{zones:[]},{zones:[{...page([]).zones[0],zoneID:{zoneName:'Other'}}]},page([],'',true),{zones:[{...page([]).zones[0],records:null}]},{zones:[{...page([]).zones[0],serverErrorCode:'BAD_REQUEST'}]},page([{...record(),serverErrorCode:'BAD_REQUEST'}]),page(Array.from({length:101},()=>record()))];
 for(const value of invalid){const f=fixture([value]);await expect(readCloudPersonSchema(f.session)).rejects.toThrow();expect(f.bodies.length).toBe(1);}
});
test('suppresses unsafe field and record identifiers without copying values',async()=>{
 const result=await readCloudPersonSchema(fixture([page([{...record(),fields:{validField:{value:'secret'},'not-a-schema-key/private':{value:'secret'}}},{recordType:'private/name',fields:{}}])]).session);
 expect(result.suppressedIdentifiers).toBe(2);expect(result.recordTypes[0].fieldNames).toEqual(['validField']);expect(JSON.stringify(result)).not.toContain('private/name');
});
test('loopback HTTP fixture exercises exact changes request transport',async()=>{
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){expect(req.headers.has('cookie')).toBe(false);expect((await req.json()).zones[0].resultsLimit).toBe(100);return Response.json(page([]));}});
 try{const session:CloudSession={dsid:'123',webservices:{ckdatabasews:{url:'https://p42-ckdatabasews.icloud.com'}},request:(_url,init)=>fetch(`http://127.0.0.1:${server.port}`,init)};expect((await readCloudPersonSchema(session)).complete).toBe(true);}finally{server.stop(true);}
});
test('owner identity is stable across pages and any record zone must match',async()=>{
 const owned=(owner:string|undefined,token:string,more:boolean)=>{const p=page([],token,more);if(owner)(p.zones[0].zoneID as any).ownerRecordName=owner;return p;};
 for(const owners of [['one','two'],['one',undefined],[undefined,'two']]){
  await expect(readCloudPersonSchema(fixture([owned(owners[0],'first',true),owned(owners[1],'second',false)]).session)).rejects.toThrow('photos_zone_mismatch');
 }
 const inconsistent=page([{...record(),zoneID:{zoneName:'Other'}}]);
 await expect(readCloudPersonSchema(fixture([inconsistent]).session)).rejects.toThrow('photos_zone_mismatch');
});
