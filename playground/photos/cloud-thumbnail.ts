import type {Photo} from './photos';
export async function fetchThumbnail(photo:Photo,request:typeof fetch=fetch):Promise<Uint8Array> {
 const resource=photo.resources.thumbnail;if(!resource)throw new Error('Thumbnail unavailable');
 const url=new URL(resource.downloadURL);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!/^([a-z0-9-]+\.)+icloud-content\.com$/.test(url.hostname))throw new Error('Untrusted thumbnail host');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await request(url,{method:'GET',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
  if(!response.ok||response.redirected||!/^(?:image\/(jpeg|png)|application\/octet-stream)(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new Error('Invalid thumbnail response');}
  if(Number(response.headers.get('content-length'))>4*1024*1024){await response.body?.cancel();throw new Error('Thumbnail byte cap');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing thumbnail body');
  let size=0;const parts:Uint8Array[]=[];
  try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>4*1024*1024)throw new Error('Thumbnail byte cap');parts.push(p.value);}}finally{await reader.cancel();reader.releaseLock();}
  const bytes=Buffer.concat(parts);
  if(!(bytes[0]===255&&bytes[1]===216||bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))throw new Error('Invalid image signature');
  return bytes;
 }finally{clearTimeout(timer);controller.abort();}
}
