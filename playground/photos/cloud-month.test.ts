import {expect,test} from 'bun:test';
import {readCloudMonth,scanCloudMonth,monthBounds} from './cloud-month';
import {cloudCommand} from './cloud-cli';
import {pair} from './fixture';
test('Toronto month boundaries and CLI validation are explicit',()=>{
 expect(monthBounds('2026-09')).toEqual({from:Date.parse('2026-09-01T04:00:00Z'),to:Date.parse('2026-10-01T04:00:00Z')});
 expect(monthBounds('2026-12').to).toBe(Date.parse('2027-01-01T05:00:00Z'));
 expect(()=>monthBounds('2026-13')).toThrow();expect(()=>cloudCommand(['--month'])).toThrow();
 expect(cloudCommand(['--month','2026-09']).month).toBe('2026-09');
 expect(cloudCommand(['--month','2026-09','--start-rank','200']).startRank).toBe(200);
 expect(()=>cloudCommand(['--read','--start-rank','20'])).toThrow();
 expect(monthBounds('2026-11').to-monthBounds('2026-11').from).toBe((30*24+1)*3600000);
});
test('resumed EOF is not complete month coverage and rejects invalid window caps',async()=>{
 const bodies:any[]=[];
 const session={dsid:'123',webservices:{ckdatabasews:{url:'https://p01-ckdatabasews.icloud.com'}},request:async(_u:any,init:any)=>{const body=JSON.parse(init.body);bodies.push(body);return Response.json({records:body.query.recordType==='CheckIndexingState'?[{fields:{state:{value:'FINISHED'}}}]:[]});}};
 const result=await scanCloudMonth(session,'2026-09',{startRank:200,maxWindows:1});
 expect(result.evidence).toMatchObject({complete:false,exhausted:true,startRank:200,nextRank:200});
 expect(bodies[1].query.filterBy[0].fieldValue.value).toBe(200);
 await expect(scanCloudMonth(session,'2026-09',{maxWindows:101})).rejects.toThrow();
});
test('month filtering preserves scan rank, excludes end boundary, and reports missing dates',async()=>{
 const dates=[Date.parse('2026-08-31T23:59:59Z'),Date.parse('2026-09-01T04:00:00Z'),Date.parse('2026-09-30T23:59:59Z'),Date.parse('2026-10-01T04:00:00Z'),undefined];
 const bodies:any[]=[];
 const result=await readCloudMonth({dsid:'123',webservices:{ckdatabasews:{url:'https://p01-ckdatabasews.icloud.com'}},request:async(_u,init)=>{
  const body=JSON.parse(String(init?.body));bodies.push(body);
  if(bodies.length===1)return Response.json({records:[{fields:{state:{value:'FINISHED'}}}]});
  const records=bodies.length===2?dates.flatMap((date,index)=>{const p:any[]=pair(String(index));if(date!==undefined)p[0].fields.assetDate={type:'TIMESTAMP',value:date};return p;}):[];
  return Response.json({records});
 }},'2026-09');
 expect(result.evidence).toMatchObject({scanned:5,matched:2,unknownDates:1,complete:false,exhausted:true,personFilterApplied:false});
 expect(bodies[2].query.filterBy[0].fieldValue.value).toBe(5);
 expect(bodies[1].desiredKeys).toContain('assetDate');
 expect(result.photos.map(p=>p.assetRecordName)).toEqual(['asset-1','asset-2']);
});
