import {expect,test} from 'bun:test';
import {readCloudAlbums,albumEvidence} from './cloud-albums';
import {readCloudPhotos,type CloudSession} from './cloud-client';
import {pair} from './fixture';
const album=(recordName:string,name='Example')=>({recordName,fields:{albumNameEnc:{value:Buffer.from(name).toString('base64')}}});
test('album identities retain full server zone and reject mixed owners',async()=>{
 const zoneID={zoneName:'PrimarySync',ownerRecordName:'synthetic-owner',zoneType:'REGULAR_CUSTOM_ZONE'};
 const result=await readCloudAlbums(fixture([{...album('one'),zoneID}]).session);
 expect(result.albums[0].library.zoneID).toEqual(zoneID);
 expect(JSON.parse(result.albums[0].id)[1]).toEqual(zoneID);
 await expect(readCloudAlbums(fixture([{...album('one'),zoneID},{...album('two'),zoneID:{...zoneID,ownerRecordName:'other'}}]).session)).rejects.toThrow('photos_zone_mismatch');
});
function fixture(records:unknown[]){
 const bodies:any[]=[];
 const session:CloudSession={dsid:'123',webservices:{ckdatabasews:{url:'https://p42-ckdatabasews.icloud.com'}},async request(_url,init){
  const body=JSON.parse(String(init?.body));bodies.push(body);
  return Response.json(body.query.recordType==='CheckIndexingState'?{records:[{fields:{state:{value:'FINISHED'}}}]}:{records});
 }};return {session,bodies};
}
test('album listing preserves duplicate names/exact identities and claims no pagination completion',async()=>{
 const {session,bodies}=fixture([album('one'),album('two'),album('----Root-Folder----'),{...album('deleted'),fields:{isDeleted:{value:1}}}]);
 const result=await readCloudAlbums(session);
 expect(result.albums.length).toBe(2);expect(result.albums[0].name).toBe(result.albums[1].name);expect(result.albums[0].id).not.toBe(result.albums[1].id);
 expect(result.complete).toBe(false);expect(result.stoppedBy).toBe('pagination-unverified');
 expect(bodies[1]).toEqual({query:{recordType:'CPLAlbumByPositionLive'},zoneID:{zoneName:'PrimarySync'}});
 expect(JSON.stringify(albumEvidence(result))).not.toContain('Example');expect(albumEvidence(result).peopleSearchVerified).toBe(false);
});
test('album cap at20 preserves incomplete; malformed duplicate and mismatched identities fail',async()=>{
 const capped=await readCloudAlbums(fixture(Array.from({length:21},(_,i)=>album(String(i)))).session);
 expect(capped.albums.length).toBe(20);expect(capped.stoppedBy).toBe('item-cap');
 await expect(readCloudAlbums(fixture([album('x'),album('x')]).session)).rejects.toThrow('Duplicate');
 await expect(readCloudAlbums(fixture([{...album('x'),zoneID:{zoneName:'Other'}}]).session)).rejects.toThrow('zone');
 await expect(readCloudAlbums(fixture([{recordName:'x',fields:{albumNameEnc:{value:'not base64!'}}}]).session)).rejects.toThrow('encoding');
});
test('album member HTTP query uses exact parentId and source rank pagination',async()=>{
 const bodies:any[]=[];
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  expect(request.headers.has('cookie')).toBe(false);const body=await request.json();bodies.push(body);
  if(body.query.recordType==='CheckIndexingState')return Response.json({records:[{fields:{state:{value:'FINISHED'}}}]});
  return Response.json({records:body.query.filterBy[0].fieldValue.value===0?pair('album'):[]});
 }});
 try{
  const session:CloudSession={dsid:'123',webservices:{ckdatabasews:{url:'https://p42-ckdatabasews.icloud.com'}},request:(_url,init)=>fetch(`http://127.0.0.1:${server.port}`,init)};
  const result=await readCloudPhotos(session,'exact-album-id');
  expect(result.photos.length).toBe(1);expect(result.complete).toBe(true);
  expect(bodies[1].query.recordType).toBe('CPLContainerRelationLiveByAssetDate');
  expect(bodies[1].query.filterBy[2]).toEqual({fieldName:'parentId',comparator:'EQUALS',fieldValue:{type:'STRING',value:'exact-album-id'}});
  expect(bodies[2].query.filterBy[0].fieldValue.value).toBe(1);
 }finally{server.stop(true);}
});
test('album member unsupported relation-only response fails safely',async()=>{
 await expect(readCloudPhotos(fixture([{recordName:'relation',recordType:'CPLContainerRelation',fields:{}}]).session,'album')).rejects.toThrow('photos_response_invalid');
 const {session,bodies}=fixture([]);await expect(readCloudPhotos(session,'')).rejects.toThrow('identity');expect(bodies.length).toBe(0);
});
test('explicit album disclosure returns only bounded names and scoped IDs',async()=>{
 const result=await readCloudAlbums(fixture([album('one','Private album')]).session);
 const hidden=albumEvidence(result);expect('albums' in hidden).toBe(false);
 (result.albums[0] as any).downloadURL='https://secret.invalid/signed';
 const shown=albumEvidence(result,true);
 expect(shown.albums).toEqual([{recordName:'one',name:'Private album',library:{database:'private',zoneID:{zoneName:'PrimarySync'}}}]);
 expect(JSON.stringify(shown)).not.toContain('signed');
});
