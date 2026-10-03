import {
  XMLParser, XMLValidator
}
from 'fast-xml-parser';
export const DAV = 'DAV:', CAL = 'urn:ietf:params:xml:ns:caldav';
export const escapeXml = (value:string) => value.replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}
[c]!));
export type XmlNode = {
  name:string;
  text:string;
  children:XmlNode[] }
;
export function parseXml(xml:string):XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) throw Error('Invalid XML');
  const raw = new XMLParser({
    preserveOrder:true,ignoreAttributes:false,parseTagValue:false,trimValues:false}
  ).parse(xml);
  function nodes(items:any[], inherited:Record<string,string>, depth=0):XmlNode[] {
    if(depth>64) throw Error('XML nesting limit');
    return items.flatMap(item=>Object.entries(item).filter(([key])=>key!==':@'&&key!=='#text'&&!key.startsWith('?')&&!key.startsWith('!')).map(([key,value])=>{
      const ns={
        ...inherited}
      ;
      for(const [k,v] of Object.entries(item[':@']??{
      }
      )){
        if(k==='@_xmlns')ns['']=String(v);
        else if(k.startsWith('@_xmlns:'))ns[k.slice(8)]=String(v);
      }
      const parts=key.split(':'),local=parts.pop()!,prefix=parts[0]??'';
      if(prefix&&!ns[prefix])throw Error('Unbound XML prefix');
      const children=nodes(value as any[],ns,depth+1);
      const text=(value as any[]).map(v=>v['#text']??'').join('');
      return {
        name:`{${ns[prefix]??''}}${local}`,text,children}
      ;
    }
    ));
  }
  const roots=nodes(raw,{
  }
  );
  if(roots.length!==1)throw Error('Expected one XML root');
  return roots[0]!;
}
export const children=(node:XmlNode,name:string)=>node.children.filter(n=>n.name===name);
export const content=(node:XmlNode):string=>node.text+node.children.map(content).join('');
const field=(n:XmlNode,name:string)=>children(n,`{${DAV}}${name}`)[0];
const status=(s:string)=>{
  const match=/^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/.exec(s.trim());
  if(!match)throw Error('Missing DAV status');
  return Number(match[1]);
}
;
export type DavRow={
  href:string;
  status?:number;
  props:Record<string,string>;
  nodes:Record<string,XmlNode>;
  errors:number[];
  propertyStatus:Record<string,number>}
;
export function parseMultiStatus(xml:string):DavRow[]{
  const root=parseXml(xml);
  if(root.name!==`{${DAV}}multistatus`)throw Error('Expected DAV multistatus');
  return children(root,`{${DAV}}response`).map(row=>{
    const href=field(row,'href');
    if(children(row,`{${DAV}}href`).length!==1||!href||!content(href))throw Error('Missing or duplicate DAV href');
    const result:DavRow={
      href:content(href),props:{
      }
      ,nodes:{
      }
      ,errors:[],propertyStatus:{}}
    ;
    const direct=field(row,'status');
    if(direct)result.status=status(content(direct));
    for(const ps of children(row,`{${DAV}}propstat`)){
      const code=status(content(field(ps,'status')??{
        text:'',children:[],name:''}
      ));
      const prop=field(ps,'prop');
      if(!prop)throw Error('Missing DAV prop');
      for(const node of prop.children){
        if(Object.hasOwn(result.propertyStatus,node.name))throw Error('Duplicate DAV property status');
        result.propertyStatus[node.name]=code;
      }
      if(code<200||code>=300){
        result.errors.push(code);
        continue;
      }
      for(const node of prop.children){
        result.props[node.name]=content(node);
        result.nodes[node.name]=node;
      }
    }
    return result;
  }
  );
}
export class DavUntrustedOriginError extends Error {
  constructor(public origin:string) { super('Untrusted DAV origin requires approval'); }
}
export class DavRedirectError extends Error {
  constructor(public location:string|null, public status:number){
    super('DAV redirect requires explicit rediscovery');
  }
}
export type DavResponse={
  status:number;
  headers:Headers;
  body:string;
  url:string}
;
export type Snapshot={
  token:string;
  resources:Record<string,{
    etag:string;
    data:string}
  >}
;
export type ClientOptions={
  baseUrl:string;
  authorization?:string;
  allowedOrigins?:string[];
  timeoutMs?:number;
  maxBytes?:number;
  fetch?:typeof fetch;
  beforeRead?:()=>void}
;
export function createCalDavClient(options:ClientOptions){
  const base=new URL(options.baseUrl);
  const origins=new Set([base.origin,...options.allowedOrigins??[]]);
  function resolve(href:string,relative=base.href){
    const url=new URL(href,relative);
    if(url.username||url.password||url.hash||url.search||url.protocol!=='https:')throw Error('Untrusted DAV href');
    if(!origins.has(url.origin))throw new DavUntrustedOriginError(url.origin);
    return url;
  }
  resolve(base.href);
  async function request(method:string,href:string,init:{
    headers?:HeadersInit;
    body?:string}
  ={
  }
  ):Promise<DavResponse>{
    const url=resolve(href);
    const headers=new Headers(init.headers);
    if(options.authorization)headers.set('authorization',options.authorization);
    if(init.body&&Buffer.byteLength(init.body)>(options.maxBytes??2_000_000))throw Error('Request too large');
    if (['GET','PROPFIND','REPORT','OPTIONS'].includes(method)) options.beforeRead?.();
    const response=await (options.fetch??fetch)(url,{
      method,headers,body:init.body,redirect:'manual',signal:AbortSignal.timeout(options.timeoutMs??10000)}
    );
    if(response.status>=300&&response.status<400){
      await response.body?.cancel();
      throw new DavRedirectError(response.headers.get('location'),response.status);
    }
    const chunks:Uint8Array[]=[];
    let size=0;
    const reader=response.body?.getReader();
    if(reader)try{
      while(true){
        const part=await reader.read();
        if(part.done)break;
        size+=part.value.length;
        if(size>(options.maxBytes??2_000_000)){
          await reader.cancel();
          throw Error('Response too large');
        }
        chunks.push(part.value);
      }
    }
    finally{
      reader.releaseLock();
    }
    return {
      status:response.status,headers:response.headers,body:Buffer.concat(chunks).toString('utf8'),url:url.href}
    ;
  }
  const envelope=(name:string,inner:string)=>`<d:${name} xmlns:d="DAV:" xmlns:c="${
  CAL
}">${inner}</d:${name}>`;
  async function report(href:string,body:string){
    const res=await request('REPORT',href,{
      headers:{
        'content-type':'application/xml; charset=utf-8',depth:'1'}
      ,body}
    );
    if(res.status!==207)throw Error(`DAV REPORT ${res.status}`);
    return parseMultiStatus(res.body);
  }
  async function propfind(href:string,props:string,depth='0'){
    const res=await request('PROPFIND',href,{
      headers:{
        depth,'content-type':'application/xml'}
      ,body:envelope('propfind',`<d:prop>${props}</d:prop>`)}
    );
    if(res.status!==207)throw Error(`DAV PROPFIND ${res.status}`);
    return parseMultiStatus(res.body);
  }
  function collectionHref(href:string, collection:string) {
    const parent=resolve(collection);
    const url=resolve(href,parent.href);
    const root=decodeURIComponent(parent.pathname).replace(/\/?$/, '/');
    const path=decodeURIComponent(url.pathname);
    if(url.origin!==parent.origin || !path.startsWith(root) || path.slice(root.length).includes('/') || /[\\\x00-\x1f]/.test(path)) throw Error('Href outside calendar collection');
    return url.href;
  }
  function canonicalRows(rows:DavRow[],relative:string,contained=false) {
    return rows.map(row=>({
      ...row,href:contained?collectionHref(row.href,relative):resolve(row.href,resolve(relative).href).href}
    ));
  }
  async function discover(){
    const root=await propfind(base.href,'<d:current-user-principal/>');
    const principalNode=root[0]?.nodes[`{${DAV}}current-user-principal`];
    const principal=principalNode&&children(principalNode,`{${DAV}}href`)[0]?.text.trim();
    if(!principal)throw Error('Principal unavailable');
    const p=resolve(principal).href;
    const rows=await propfind(p,'<c:calendar-home-set/>');
    const homeNode=rows[0]?.nodes[`{${CAL}}calendar-home-set`];
    const home=homeNode&&children(homeNode,`{${DAV}}href`)[0]?.text.trim();
    if(!home)throw Error('Calendar home unavailable');
    const h=resolve(home,p).href;
    const discovered=await propfind(h,'<d:displayname/><d:resourcetype/><d:current-user-privilege-set/>','1');
    if(discovered.some(r=>r.status&&r.status>=400 || r.errors.some(code=>code!==404) || !r.nodes[`{${DAV}}resourcetype`]))throw Error('Partial calendar discovery');
    const calendars=canonicalRows(discovered,h).filter(r=>r.nodes[`{${DAV}}resourcetype`]?.children.some(n=>n.name===`{${CAL}}calendar`));
    return {
      principal:p,home:h,calendars}
    ;
  }
  const props='<d:prop><d:getetag/><c:calendar-data/></d:prop>';
  async function query(href:string,start:string,end:string){
    const valid=(s:string)=>/^\d{8}T\d{6}Z$/.test(s);
    if(!valid(start)||!valid(end)||start>=end)throw Error('Finite ordered UTC range required');
    return canonicalRows(await report(href,`<c:calendar-query xmlns:d="DAV:" xmlns:c="${
  CAL
}">${props}<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${
  start
}" end="${
  end
}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`),href,true);
  }
  async function multiget(href:string,hrefs:string[]){
    if(!hrefs.length||hrefs.length>500)throw Error('Multiget size limit');
    const body=hrefs.map(h=>{
      const resource=new URL(collectionHref(h,href));
      if(resource.search)throw Error('Calendar resource query is unsupported');
      // iCloud multiget expects an encoded absolute path, not an absolute URL.
      return `<d:href>${escapeXml(resource.pathname)}</d:href>`;
    }).join('');
    return canonicalRows(await report(href,`<c:calendar-multiget xmlns:d="DAV:" xmlns:c="${
  CAL
}">${props}${body}</c:calendar-multiget>`),href,true);
  }
  function strong(etag:string){
    if(!/^"[^"\x00-\x20\x7f]*"$/.test(etag))throw Error('Strong ETag required');
    return etag;
  }
  async function sync(href:string,previous?:Snapshot):Promise<Snapshot>{
    async function get(token:string){
      return request('REPORT',href,{
        headers:{
          depth:'1','content-type':'application/xml'
        }
        ,body:envelope('sync-collection',`<d:sync-token>${escapeXml(token)}</d:sync-token><d:sync-level>1</d:sync-level>${props}`)
      }
      );
    }
    let res=await get(previous?.token??''),reset=!previous;
    if(res.status===403&&previous){
      const error=parseXml(res.body);
      if(error.name===`{${DAV}}error`&&children(error,`{${DAV}}valid-sync-token`).length){
        res=await get('');
        reset=true;
      }
    }
    if(res.status!==207)throw Error(`DAV sync ${res.status}`);
    const root=parseXml(res.body);
    const token=children(root,`{${DAV}}sync-token`)[0]?.text;
    if(!token)throw Error('Missing sync token');
    const resources={
      ...(reset?{
      }
      :previous!.resources)
    }
    ;
    const seen=new Set<string>();
    const collectionUrl=resolve(href).href;
    let hydrated=0;
    let totalDataBytes=0;
    for(const row of canonicalRows(parseMultiStatus(res.body),href)){
      // iCloud includes the collection itself with successful DAV:getetag only.
      // It is metadata, not a calendar object; no child or error is exempted.
      if(row.href===collectionUrl){
        if(seen.has(row.href))throw Error('Duplicate sync href');
        seen.add(row.href);
        const keys=Object.keys(row.props);
        if(row.errors.length || (row.status!==undefined && row.status!==200) ||
           keys.length!==1 || keys[0]!==`{${DAV}}getetag` ||
           !row.props[`{${DAV}}getetag`])throw Error('Invalid sync collection metadata');
        continue;
      }
      collectionHref(row.href,href);
      if(seen.has(row.href))throw Error('Duplicate sync href');
      seen.add(row.href);
      if(row.status===404){
        delete resources[row.href];
        continue;
      }
      if(row.errors.length||(row.status&&row.status!==200))throw Error('Partial sync response');
      const etag=row.props[`{${DAV}}getetag`];
      let data=row.props[`{${CAL}}calendar-data`];
      if(!etag)throw Error('Incomplete sync resource');
      strong(etag);
      if(data===undefined){
        // Some providers return only the revision in sync-collection reports.
        // Hydrate once, and commit only the exact revision reported by sync.
        if(++hydrated>500)throw Error('Sync hydration limit');
        const fetched=await request('GET',row.href);
        if(fetched.status!==200 || fetched.headers.get('etag')!==etag){
          throw Error('Sync hydration failed or revision changed');
        }
        strong(fetched.headers.get('etag')!);
        data=fetched.body;
      }
      totalDataBytes+=Buffer.byteLength(data);
      if(totalDataBytes>(options.maxBytes??2_000_000))throw Error('Sync data size limit');
      if(Object.keys(resources).length>=5000&&!Object.hasOwn(resources,row.href))throw Error('Sync resource limit');
      resources[row.href]={
        etag,data
      }
      ;
    }
    return {
      token,resources
    }
    ;
  }
  return {
    request,resolve,discover,propfind,query,multiget,sync
  }
  ;
}
