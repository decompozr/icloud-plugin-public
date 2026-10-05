import { describe, expect, test } from 'bun:test';
import { cloudEvidence, photosEndpoint, readCloudPhotos, type CloudSession } from './cloud-client';
import { pair } from './fixture';

const service = 'https://p42-ckdatabasews.icloud.com';
const fullZone={zoneName:'PrimarySync',ownerRecordName:'synthetic-owner',zoneType:'REGULAR_CUSTOM_ZONE'};
function zonedPair(name:string,zone=fullZone):any[] {
  const records:any[]=pair(name);
  for(const record of records) record.zoneID={...zone};
  records[0].fields.masterRef.value.zoneID={...zone};
  return records;
}
function fixture(next: (body: any, call: number) => Response) {
  const calls: any[] = [];
  const session: CloudSession = { dsid: '1234', webservices: { ckdatabasews: { url: service } }, async request(url, init) {
    expect(new URL(url).origin).toBe(service);
    expect(new URL(url).pathname).toBe('/database/1/com.apple.photos.cloud/production/private/records/query');
    expect(init?.redirect).toBe('manual');
    const body = JSON.parse(String(init?.body)); calls.push(body);
    return calls.length === 1 ? Response.json({ records: [{ fields: { state: { value: 'FINISHED' } } }] }) : next(body, calls.length);
  } };
  return { session, calls };
}
describe('direct cloud client (injected HTTP fixtures, not live evidence)', () => {
  test('binds server zone identity for photos, metadata and subsequent queries',async()=>{
    const {session,calls}=fixture((_,call)=>Response.json({records:zonedPair(String(call))}));
    const result=await readCloudPhotos(session);
    expect(result.photos).toHaveLength(2);
    expect(calls[1].zoneID).toEqual({zoneName:'PrimarySync'});
    expect(calls[2].zoneID).toEqual(fullZone);
    for(let i=0;i<result.photos.length;i++) {
      expect(result.photos[i].library.zoneID).toEqual(fullZone);
      expect(result.metadata[i].library.zoneID).toEqual(fullZone);
      expect(result.metadata[i].id).toBe(result.photos[i].id);
    }
  });
  test('rejects cross-page owner changes, wrong zones, mixed owners and reference owner mismatch',async()=>{
    const drift=fixture((_,call)=>Response.json({records:zonedPair(String(call),{...fullZone,ownerRecordName:call===2?'first':'second'})}));
    await expect(readCloudPhotos(drift.session)).rejects.toMatchObject({code:'photos_zone_mismatch'});
    for(const change of [
      (records:any[])=>{for(const record of records)record.zoneID.zoneName='other';},
      (records:any[])=>{records[1].zoneID.ownerRecordName='other';},
      (records:any[])=>{records[0].fields.masterRef.value.zoneID.ownerRecordName='other';},
    ]) {
      const bad=fixture(()=>{const records=zonedPair('bad');change(records);return Response.json({records});});
      await expect(readCloudPhotos(bad.session)).rejects.toBeInstanceOf(Error);
      expect(bad.calls).toHaveLength(2);
    }
  });
  test('actual client path includes indexing, metadata keys, cloud identity and empty exhaustion', async () => {
    const {session,calls} = fixture((_, call) => Response.json({ records: call === 2 ? pair('one') : [] }));
    const result = await readCloudPhotos(session);
    expect(result.complete).toBe(true);
    expect(result.photos[0].assetRecordName).toBe('asset-one');
    expect(result.photos[0].library.zoneID).toEqual({zoneName:'PrimarySync'});
    expect(calls[1].desiredKeys).toContain('keywordsEnc');
    expect(calls[2].query.filterBy[0].fieldValue.value).toBe(1);
    expect(JSON.stringify(cloudEvidence(result))).not.toContain('https:');
    expect(result.metadata[0].people.state).toBe('unsupported');
  });
  test('20 asset cap is explicitly incomplete after 2 pages', async () => {
    const {session,calls} = fixture((_, call) => Response.json({ records: Array.from({length:10},(_,i)=>pair(`${call}-${i}`)).flat() }));
    const result = await readCloudPhotos(session);
    expect(result.photos.length).toBe(20); expect(result.complete).toBe(false); expect(result.stoppedBy).toBe('item-cap'); expect(calls.length).toBe(3);
  });
  test('rejects duplicate pagination and HTTP failures without retries', async () => {
    const repeated = fixture(()=>Response.json({records:pair('same')}));
    await expect(readCloudPhotos(repeated.session)).rejects.toThrow('Repeated');
    const failed = fixture(()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}));
    await expect(readCloudPhotos(failed.session)).rejects.toMatchObject({code: 'photos_http_rejected', status: 302}); expect(failed.calls.length).toBe(2);
  });
  test('refuses malicious discoveries before transport', async () => {
    for (const url of ['http://p42-ckdatabasews.icloud.com','https://evil.test','https://p42-ckdatabasews.icloud.com.evil.test','https://user@p42-ckdatabasews.icloud.com','https://p42-ckdatabasews.icloud.com/path','https://p42-ckdatabasews.icloud.com?token=x','https://p42-ckdatabasews.icloud.com:444']) {
      const {session,calls}=fixture(()=>Response.json({records:[]})); session.webservices.ckdatabasews.url=url;
      await expect(readCloudPhotos(session)).rejects.toThrow(); expect(calls.length).toBe(0);
    }
  });
  test('rejects oversized responses and excessive asset counts', async () => {
    const huge=fixture(()=>new Response('x'.repeat(2*1024*1024)));
    await expect(readCloudPhotos(huge.session)).rejects.toThrow('byte limit');
    const many=fixture(()=>Response.json({records:Array.from({length:11},(_,i)=>pair(String(i))).flat()}));
    await expect(readCloudPhotos(many.session)).rejects.toThrow('item limit');
  });
});

test('loopback HTTP fixture drives the same cloud reader without credentials', async () => {
  let requests = 0;
  const server = Bun.serve({ hostname:'127.0.0.1', port:0, async fetch(request) {
    expect(request.headers.has('cookie')).toBe(false);
    const body = await request.json(); requests++;
    if (body.query.recordType === 'CheckIndexingState') return Response.json({records:[{fields:{state:{value:'FINISHED'}}}]});
    const rank = body.query.filterBy[0].fieldValue.value;
    const records = rank === 0 ? pair('http') : [];
    if (records.length) records[0].fields.captionEnc = {type:'ENCRYPTED_BYTES',value:Buffer.from('private caption').toString('base64')};
    return Response.json({records});
  }});
  try {
    const session:CloudSession = {dsid:'1234',webservices:{ckdatabasews:{url:service}}, request:(_url,init)=>fetch(`http://127.0.0.1:${server.port}/fixture`,init)};
    const result=await readCloudPhotos(session);
    expect(requests).toBe(3); expect(cloudEvidence(result).captionsPresent).toBe(1);
    expect(JSON.stringify(cloudEvidence(result))).not.toContain('private caption');
  } finally { server.stop(true); }
});

test('reader diagnostics separate discovery, indexing and photo HTTP failures',async()=>{
  let stage='';
  const report=(value:string)=>{stage=value;};
  const missing=fixture(()=>Response.json({}));
  missing.session.webservices={};
  await expect(readCloudPhotos(missing.session,undefined,report)).rejects.toMatchObject({code:'photos_service_missing'});
  expect(stage).toBe('service-discovery');
  const indexing={...missing.session,webservices:{ckdatabasews:{url:'https://p01-ckdatabasews.icloud.com'}},request:async()=>Response.json({records:[]})};
  await expect(readCloudPhotos(indexing,undefined,report)).rejects.toMatchObject({code:'photos_indexing_not_ready'});
  expect(stage).toBe('photos-indexing');
  const failed=fixture(()=>new Response(null,{status:503}));
  await expect(readCloudPhotos(failed.session,undefined,report)).rejects.toMatchObject({code:'photos_http_rejected',status:503});
  expect(stage).toBe('photos-read');
});
