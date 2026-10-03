import {test,expect} from 'bun:test';
import {createCalDavClient,parseMultiStatus,escapeXml,DAV,CAL} from './caldav-client';
const row=(href:string,data='event',etag='"v1"')=>`<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>${escapeXml(etag)}</d:getetag><c:calendar-data>${escapeXml(data)}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=(body:string,token='')=>`<d:multistatus xmlns:d="DAV:" xmlns:c="${CAL}">${body}${token?`<d:sync-token>${token}</d:sync-token>`:''}</d:multistatus>`;
const prop=(href:string,body:string)=>`<d:response><d:href>${href}</d:href><d:propstat><d:prop>${body}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
test('XML namespace scopes and per-property failure remain distinguishable',()=>{
 const rows=parseMultiStatus(multi(`<d:response><d:href>/a</d:href><d:propstat><d:prop><x:getetag xmlns:x="DAV:">&quot;yes&quot;</x:getetag><d:getetag xmlns:d="wrong">bad</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:displayname/></d:prop><d:status>HTTP/1.1 403 Forbidden</d:status></d:propstat></d:response>`));
 expect(rows[0]!.props['{DAV:}getetag']).toBe('"yes"');expect(rows[0]!.errors).toEqual([403]);expect(()=>parseMultiStatus('<!DOCTYPE x><x/>')).toThrow();
});
test('loopback discovery query multiget conditional writes and containment',async()=>{
 let stored:string|null=null,etag='"1"';const seen:{method:string,body:string}[]=[];
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const url=new URL(req.url),body=await req.text();seen.push({method:req.method,body});
 if(url.pathname==='/redirect')return Response.redirect('https://example.invalid/',302);if(url.pathname==='/large')return new Response('x'.repeat(5000));
 if(req.method==='PROPFIND'){const value=url.pathname==='/'?prop('/','<d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal>'):url.pathname==='/principal/'?prop('/principal/','<c:calendar-home-set><d:href>/home/</d:href></c:calendar-home-set>'):prop('/home/cal/','<d:displayname>Test</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>');return new Response(multi(value),{status:207});}
 if(req.method==='REPORT')return new Response(multi(row('/home/cal/a.ics')),{status:207});
 if(req.method==='GET')return new Response(stored,{status:stored===null?404:200,headers:{etag}});
 if(req.headers.get('if-none-match')==='*'?stored!==null:req.headers.get('if-match')!==etag)return new Response(null,{status:412});
 if(req.method==='DELETE'){stored=null;return new Response(null,{status:204});}const created=stored===null;stored=body;etag='"2"';return new Response(null,{status:created?201:204,headers:{etag}});
 }});
 try{const c=createCalDavClient({baseUrl:server.url.href,maxBytes:4096});const d=await c.discover();expect(d.calendars[0]!.props['{DAV:}displayname']).toBe('Test');
 expect((await c.query(d.calendars[0]!.href,'20261001T000000Z','20261101T000000Z')).length).toBe(1);expect(seen.at(-1)!.body).toContain('<c:time-range start="20261001T000000Z"');await c.multiget('/home/cal/',['/home/cal/a.ics']);expect(seen.at(-1)!.body).toContain('calendar-multiget');
 await c.create('/home/cal/a.ics','one');await expect(c.create('/home/cal/a.ics','two')).rejects.toThrow('412');expect(()=>c.update('/home/cal/a.ics','two','W/"2"')).toThrow('Strong');await c.update('/home/cal/a.ics','two','"2"');await c.remove('/home/cal/a.ics','"2"');
 await expect(c.request('GET','/redirect')).rejects.toThrow('redirect');await expect(c.request('GET','/large')).rejects.toThrow('large');await expect(c.request('GET','https://evil.invalid')).rejects.toThrow('Untrusted');expect(()=>c.resolve('http://user:pass@127.0.0.1/')).toThrow('Untrusted');
 }finally{server.stop(true);}
});
test('sync commits changed/deleted snapshot atomically, invalid token resets and partial errors preserve input',async()=>{
 let mode='initial';const tokens:string[]=[];const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const body=await req.text();tokens.push(body);
 if(mode==='invalid'&&!body.includes('<d:sync-token></d:sync-token>'))return new Response('<d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>',{status:403});
 if(mode==='partial')return new Response(multi(row('/a','new')+'<d:response><d:href>/b</d:href><d:status>HTTP/1.1 500 Failed</d:status></d:response>','bad'),{status:207});
 return new Response(multi(mode==='delta'?row('/b','changed')+'<d:response><d:href>/a</d:href><d:status>HTTP/1.1 404 Gone</d:status></d:response>':row('/a'),'token-'+mode),{status:207});}});
 try{const c=createCalDavClient({baseUrl:server.url.href});const first=await c.sync('/');mode='delta';const second=await c.sync('/',first);expect(Object.keys(second.resources)).toEqual([new URL('/b',server.url).href]);expect(Object.keys(first.resources)).toHaveLength(1);mode='partial';const copy=JSON.stringify(second);await expect(c.sync('/',second)).rejects.toThrow('Partial');expect(JSON.stringify(second)).toBe(copy);mode='invalid';const reset=await c.sync('/',second);expect(Object.keys(reset.resources)).toEqual([new URL('/a',server.url).href]);expect(tokens.at(-1)).toContain('<d:sync-token></d:sync-token>');}finally{server.stop(true);}
});
test('timeout after applied PUT reads back without replaying mutation',async()=>{
 let data='',puts=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){if(req.method==='PUT'){puts++;data=await req.text();await Bun.sleep(80);return new Response(null,{status:201});}return new Response(data,{headers:{etag:'"stored"'}});}});
 try{const c=createCalDavClient({baseUrl:server.url.href,timeoutMs:20});const r=await c.create('/a','same exact payload');expect(r.reconciled).toBe(true);expect(puts).toBe(1);}finally{server.stop(true);}
});
test('failed/incomplete sync and out-of-collection href never advance snapshot',async()=>{
 let response=multi(row('/other/a'),'next');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response(response,{status:207});}});
 const c=createCalDavClient({baseUrl:server.url.href});const previous={token:'old',resources:{}};
 try{await expect(c.sync('/cal/',previous)).rejects.toThrow('outside');response=multi(prop('/cal/a','<c:calendar-data>missing etag</c:calendar-data>'),'next');await expect(c.sync('/cal/',previous)).rejects.toThrow('Incomplete');expect(previous).toEqual({token:'old',resources:{}});await expect(c.multiget('/cal/',['/cal/%2F..%2Fother'])).rejects.toThrow('outside');}finally{server.stop(true);}
});
test('server 500 after write reconciles exact state; differing state remains unknown',async()=>{
 let payload='',alter=false,puts=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){if(req.method==='PUT'){puts++;payload=await req.text();return new Response(null,{status:500});}return new Response(alter?'different':payload,{headers:{etag:'"observed"'}});}});
 try{const c=createCalDavClient({baseUrl:server.url.href});expect((await c.create('/a','wanted')).reconciled).toBe(true);alter=true;await expect(c.create('/b','wanted')).rejects.toThrow('unknown');expect(puts).toBe(2);}finally{server.stop(true);}
});
test('sync accepts exact successful collection metadata alongside changed and deleted children', async () => {
  const metadata = prop('/cal/', '<d:getetag>&quot;collection-v1&quot;</d:getetag>');
  let response = multi(metadata + row('/cal/new.ics', 'changed') +
    '<d:response><d:href>/cal/old.ics</d:href><d:status>HTTP/1.1 404 Gone</d:status></d:response>', 'next');
  const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response(response,{status:207});}});
  const client = createCalDavClient({baseUrl:server.url.href});
  const oldHref = new URL('/cal/old.ics', server.url).href;
  const newHref = new URL('/cal/new.ics', server.url).href;
  const previous = {token:'old',resources:{[oldHref]:{etag:'"old"',data:'old'}}};
  const before = JSON.stringify(previous);
  try {
    const next = await client.sync('/cal/', previous);
    expect(next.token).toBe('next');
    expect(next.resources).toEqual({[newHref]:{etag:'"v1"',data:'changed'}});
    expect(JSON.stringify(previous)).toBe(before);
    for (const invalid of [
      row('/cal/', 'self calendar data'),
      metadata.replace('200 OK', '403 Forbidden'),
      '<d:response><d:href>/cal/</d:href><d:status>HTTP/1.1 404 Gone</d:status></d:response>',
      prop('/cal/unknown.ics', '<d:getetag>&quot;v1&quot;</d:getetag>'),
    ]) {
      response = multi(invalid, 'must-not-advance');
      await expect(client.sync('/cal/', previous)).rejects.toThrow();
      expect(JSON.stringify(previous)).toBe(before);
    }
  } finally { server.stop(true); }
});
test('etag-only sync children hydrate once at reported revision and races preserve prior state', async () => {
  let actualEtag = '"v2"';
  let gets = 0;
  const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
    if(req.method === 'GET') {
      gets++;
      expect(new URL(req.url).pathname).toBe('/cal/changed.ics');
      return new Response('hydrated event', {headers:{etag:actualEtag}});
    }
    return new Response(multi(
      prop('/cal/', '<d:getetag>&quot;collection&quot;</d:getetag>') +
      prop('/cal/changed.ics', '<d:getetag>&quot;v2&quot;</d:getetag>') +
      '<d:response><d:href>/cal/deleted.ics</d:href><d:status>HTTP/1.1 404 Gone</d:status></d:response>', 'next'), {status:207});
  }});
  const client=createCalDavClient({baseUrl:server.url.href});
  const deleted=new URL('/cal/deleted.ics',server.url).href;
  const changed=new URL('/cal/changed.ics',server.url).href;
  const previous={token:'old',resources:{[deleted]:{etag:'"v1"',data:'old'}}};
  const before=JSON.stringify(previous);
  try {
    const next=await client.sync('/cal/',previous);
    expect(next).toEqual({token:'next',resources:{[changed]:{etag:'"v2"',data:'hydrated event'}}});
    expect(gets).toBe(1);
    actualEtag='"raced"';
    await expect(client.sync('/cal/',previous)).rejects.toThrow('revision changed');
    expect(JSON.stringify(previous)).toBe(before);
    expect(gets).toBe(2);
  } finally {server.stop(true);}
});
test('multiget sends encoded path-form hrefs and resolves the same validated identity', async () => {
  let reports=0;
  const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
    reports++;
    const body=await req.text();
    if(!body.includes('<d:href>/cal/a%20b%26c.ics</d:href>') || body.includes('<d:href>http')) {
      return new Response(multi('<d:response><d:href>/cal/a%20b%26c.ics</d:href><d:status>HTTP/1.1 404 Missing</d:status></d:response>'),{status:207});
    }
    return new Response(multi(row('/cal/a%20b%26c.ics','correct event')),{status:207});
  }});
  const client=createCalDavClient({baseUrl:server.url.href});
  const resource=new URL('/cal/a%20b%26c.ics',server.url).href;
  try {
    const result=await client.multiget('/cal/',[resource]);
    expect(result[0]!.href).toBe(resource);
    expect(result[0]!.props[`{${CAL}}calendar-data`]).toBe('correct event');
    for(const invalid of ['/other/a.ics','/cal/%2f..%2fother.ics','/cal/../other.ics','https://example.invalid/cal/a.ics','/cal/a.ics?other=1']) {
      await expect(client.multiget('/cal/',[invalid])).rejects.toThrow();
    }
    expect(reports).toBe(1);
  } finally {server.stop(true);}
});

test('property statuses distinguish missing invite from unrelated ACL404 and reject duplicate ambiguity', () => {
  const xml = '<d:multistatus xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:response><d:href>/calendar/</d:href><d:propstat><d:prop><d:acl/><cs:invite/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response></d:multistatus>';
  const row = parseMultiStatus(xml)[0]!;
  expect(row.propertyStatus['{http://calendarserver.org/ns/}invite']).toBe(404);
  expect(row.propertyStatus['{DAV:}acl']).toBe(404);
  expect(row.nodes['{http://calendarserver.org/ns/}invite']).toBeUndefined();
  expect(() => parseMultiStatus(xml.replace('<d:acl/><cs:invite/>', '<cs:invite/><cs:invite/>'))).toThrow('Duplicate DAV property status');
});
