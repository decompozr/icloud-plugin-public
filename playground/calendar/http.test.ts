import {test,expect} from 'bun:test';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
const limit=4096;
async function xml(response:Response){
 const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw Error('Response too large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const text=Buffer.concat(chunks).toString();if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw Error('Invalid XML');
 // Preserve attributes and prefixes; resolve expanded DAV names, not spelling.
 const parsed=new XMLParser({ignoreAttributes:false,parseTagValue:false}).parse(text);
 const root=Object.keys(parsed).find(key=>!key.startsWith('?'))!;const value=parsed[root];
 const namespaces:Record<string,string>={};for(const [key,item] of Object.entries(value))if(key==='@_xmlns')namespaces['']=String(item);else if(key.startsWith('@_xmlns:'))namespaces[key.slice(8)]=String(item);
 const nestedNamespaces=(node:unknown):boolean=>{if(!node||typeof node!=='object')return false;return Object.entries(node).some(([key,item])=>key.startsWith('@_xmlns')||nestedNamespaces(item));};
 for(const [key,item] of Object.entries(value))if(!key.startsWith('@_')&&nestedNamespaces(item))throw Error('Nested namespace declarations unsupported');
 const dav=(name:string)=>{const [prefix,local]=name.includes(':')?name.split(':'):['',name];return namespaces[prefix!]==='DAV:'?local:null;};
 if(dav(root)!=='multistatus')throw Error('Wrong namespace');
 const responseKey=Object.keys(value).find(key=>dav(key)==='response');if(!responseKey)return [];
 const rows=Array.isArray(value[responseKey])?value[responseKey]:[value[responseKey]];
 return rows.map((row:Record<string,unknown>)=>{const get=(name:string)=>row[Object.keys(row).find(key=>dav(key)===name)??''];return {href:get('href'),status:get('status')};});
}
test('loopback CalDAV request conditions, namespace identity, partial status and response bounds',async()=>{
 const seen:string[]=[];let content:string|null=null,etag='"v1"';
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const path=new URL(req.url).pathname;seen.push(req.method);
  if(path==='/rebind')return new Response('<q:multistatus xmlns:q="DAV:"><q:response xmlns:q="urn:wrong"><q:href>/bad</q:href></q:response></q:multistatus>');
  if(path==='/redirect')return Response.redirect('https://example.invalid/no-network',302);
  if(path==='/large')return new Response('x'.repeat(limit+1));if(path==='/bad')return new Response('<broken>');if(path==='/wrong')return new Response('<x:multistatus xmlns:x="urn:wrong"/>');
  if(req.method==='PROPFIND'||req.method==='REPORT'){
   if(req.method==='PROPFIND'&&req.headers.get('depth')!=='1')return new Response(null,{status:400});
   if(req.method==='REPORT'&&!(await req.text()).includes('calendar-query'))return new Response(null,{status:400});
   return new Response('<q:multistatus xmlns:q="DAV:"><q:response><q:href>/cal/a.ics</q:href><q:status>HTTP/1.1 200 OK</q:status></q:response><q:response><q:href>/cal/missing.ics</q:href><q:status>HTTP/1.1 404 Not Found</q:status></q:response></q:multistatus>',{status:207});
  }
  if(req.method==='GET')return new Response(content,{status:content?200:404,headers:{etag}});
  if(req.headers.get('if-none-match')==='*'){if(content!==null)return new Response(null,{status:412});}
  else if(content===null||req.headers.get('if-match')!==etag)return new Response(null,{status:412});
  if(req.method==='DELETE'){content=null;return new Response(null,{status:204});}
  const existed=content!==null;content=await req.text();etag=existed?'"v2"':'"v1"';return new Response(null,{status:existed?204:201,headers:{etag}});
 }});
 const call=(path:string,options?:RequestInit)=>fetch(new URL(path,server.url),{...options,redirect:'manual',signal:AbortSignal.timeout(2000)});
 try{
  const rows=await xml(await call('/cal',{method:'PROPFIND',headers:{depth:'1'}}));expect(rows).toEqual([{href:'/cal/a.ics',status:'HTTP/1.1 200 OK'},{href:'/cal/missing.ics',status:'HTTP/1.1 404 Not Found'}]);
  expect((await xml(await call('/cal',{method:'REPORT',body:'<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav"/>'}))).length).toBe(2);
  const put=(headers:Record<string,string>,body:string)=>call('/cal/a.ics',{method:'PUT',headers,body});
  expect((await put({'if-none-match':'*'},'original')).status).toBe(201);expect((await put({'if-none-match':'*'},'duplicate')).status).toBe(412);
  expect((await put({'if-match':'"stale"'},'bad')).status).toBe(412);expect(await(await call('/cal/a.ics')).text()).toBe('original');
  expect((await put({'if-match':'"v1"'},'changed')).status).toBe(204);
  expect((await call('/cal/a.ics',{method:'DELETE',headers:{'if-match':'"v1"'}})).status).toBe(412);
  expect((await call('/cal/a.ics',{method:'DELETE',headers:{'if-match':'"v2"'}})).status).toBe(204);
  for(const path of ['/large','/bad','/wrong','/rebind'])await expect(xml(await call(path))).rejects.toThrow();
  expect((await call('/redirect')).status).toBe(302);
  expect(seen.filter(method=>method==='PUT').length).toBe(4); // no automatic conflict retry
 }finally{await server.stop(true);}
});

function containedHref(href:string,calendar:URL){if(/%2f|%5c|%2e/i.test(href))throw Error('Encoded path ambiguity');const url=new URL(href,calendar);if(url.origin!==calendar.origin||url.username||url.password||url.hash||url.search||!url.pathname.startsWith(calendar.pathname))throw Error('Untrusted href');return url;}
test('untrusted href cannot leave discovered calendar before any credential-bearing request',()=>{
 const base=new URL('https://fixture.invalid/cal/');expect(containedHref('a%20b.ics',base).pathname).toBe('/cal/a%20b.ics');
 for(const href of ['https://other.invalid/cal/a.ics','//other.invalid/a','../other/a','a%2fb.ics','%2e%2e/a','https://user:password@fixture.invalid/cal/a'])expect(()=>containedHref(href,base)).toThrow();
});
