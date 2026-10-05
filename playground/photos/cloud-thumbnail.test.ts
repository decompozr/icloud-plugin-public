import {test,expect} from 'bun:test';
import {fetchThumbnail} from './cloud-thumbnail';
import {parsePage} from './photos';
import {pair,library} from './fixture';
test('thumbnail request has no account headers and refuses redirects/non-image bodies',async()=>{
 const p=parsePage({records:pair('one')},library)[0];p.resources.thumbnail!.downloadURL='https://cvws.icloud-content.com/example?token=synthetic';
 const bytes=await fetchThumbnail(p,async(_u,init)=>{expect(init?.credentials).toBe('omit');expect(init?.redirect).toBe('manual');expect(init?.headers).toBeUndefined();return new Response(new Uint8Array([255,216,255,217]),{headers:{'content-type':'application/octet-stream'}});});expect(bytes.length).toBe(4);
 await expect(fetchThumbnail(p,async()=>new Response(null,{status:302}))).rejects.toThrow('response');
 await expect(fetchThumbnail(p,async()=>new Response('html',{headers:{'content-type':'image/jpeg'}}))).rejects.toThrow('signature');
 p.resources.thumbnail!.downloadURL='https://cvws.icloud-content.com.evil.test/example';
 await expect(fetchThumbnail(p,async()=>{throw Error('must not call');})).rejects.toThrow('host');
});
