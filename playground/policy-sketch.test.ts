import {test,expect} from 'bun:test';

// Hypothesis sketches only, independent of production and not complete handlers.
function guardedTargets(targets:{mailbox:string,uid:number,validity:string}[],selected:{mailbox:string,validity:string}) {
 if(!targets.length || targets.some(t=>t.mailbox!==selected.mailbox||t.validity!==selected.validity||!Number.isInteger(t.uid)||t.uid<1))throw Error('stale or invalid target');
 return targets.map(t=>t.uid);
}
function folderDestination(folders:{path:string,use?:string}[],purpose:string,original?:string) {
 const matches=purpose==='restore'?folders.filter(f=>original && f.path===original):folders.filter(f=>f.use===purpose);
 return matches.length===1?{status:'resolved',path:matches[0]!.path}:{status:matches.length?'ambiguous':'unknown'};
}
function excerpt(text:string,limit:number){return {text:text.slice(0,limit),truncated:text.length>limit,originalCharacters:text.length,omissions:['attachments']};}
// Narrow test policy: fixed fake resolver, explicit fixtures, no network implementation.
function candidateUrl(value:string,addresses:Map<string,string[]>) {
 try {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return false;
  const resolved=addresses.get(url.hostname);
  return Boolean(resolved?.length && resolved.every(address=>address==='203.0.113.1'));
 }catch{return false;}
}

test('L2 guard sketch refuses stale, mixed-folder and empty references before writer',()=> {
 let calls=0;const write=(targets:Parameters<typeof guardedTargets>[0])=>{guardedTargets(targets,{mailbox:'INBOX',validity:'900'});calls++;};
 for(const targets of [[],[{mailbox:'INBOX',uid:41,validity:'901'}],[{mailbox:'Archive',uid:41,validity:'900'}]])expect(()=>write(targets)).toThrow();
 expect(calls).toBe(0);write([{mailbox:'INBOX',uid:41,validity:'900'}]);expect(calls).toBe(1);
});
test('L4 folder sketch refuses missing/ambiguous special-use and unknown restore origin',()=> {
 expect(folderDestination([],'\\Trash').status).toBe('unknown');
 expect(folderDestination([{path:'a',use:'\\Trash'},{path:'b',use:'\\Trash'}],'\\Trash').status).toBe('ambiguous');
 expect(folderDestination([{path:'INBOX'}],'restore').status).toBe('unknown');
 expect(folderDestination([{path:'INBOX'}],'restore','INBOX')).toEqual({status:'resolved',path:'INBOX'});
});
test('L5 bounded excerpt sketch exposes truncation and omitted attachment bytes',()=> {
 expect(excerpt('abc'.repeat(100),12)).toEqual({text:'abcabcabcabc',truncated:true,originalCharacters:300,omissions:['attachments']});
 expect(excerpt('héllo',20).truncated).toBe(false);
});
test('L6 offline candidate and redirect policy sketch rejects private or ambiguous destinations',()=> {
 const fake=new Map([['public.invalid',['203.0.113.1']],['private.invalid',['10.0.0.1']],['localhost',['127.0.0.1']],['mixed.invalid',['203.0.113.1','127.0.0.1']]]);
 expect(candidateUrl('https://public.invalid/unsubscribe',fake)).toBe(true);
 for(const url of ['file:///tmp/x','http://public.invalid','https://owner:secret@public.invalid','https://private.invalid','https://localhost','https://mixed.invalid','https://unknown.invalid','malformed'])expect(candidateUrl(url,fake)).toBe(false);
 const hops=['https://public.invalid/start','https://private.invalid/redirect'];expect(hops.every(hop=>candidateUrl(hop,fake))).toBe(false);
 // Candidate acceptance is never submission or confirmation.
 expect({status:'candidate',submitted:false,confirmed:false}.submitted).toBe(false);
});
