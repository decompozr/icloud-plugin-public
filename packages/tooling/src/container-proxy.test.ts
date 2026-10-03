import{test,expect}from'bun:test';
import{createProxy}from'./container-proxy.js';
test('container proxy preserves MCP methods/auth/session/status and streams responses',async()=>{
 const observed:{method:string;authorization:string|null;session:string|null;body:string}[]=[];
 const backend=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  observed.push({method:request.method,authorization:request.headers.get('authorization'),session:request.headers.get('mcp-session-id'),body:await request.text()});
  if(request.method==='GET'){const headers=new Headers({'content-type':'text/event-stream','mcp-session-id':'session-response'});headers.append('set-cookie','session=fixture; HttpOnly');headers.append('set-cookie','csrf=fixture; SameSite=Strict');return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: hello\n\n'));controller.close();}}),{headers});}
  return new Response('fixture',{status:request.method==='DELETE'?204:201,headers:{'mcp-protocol-version':'2025-06-18'}});
 }});
 const proxy=createProxy(0,async()=>backend.url.href);
 try{
  for(const path of ['/','/other','/icloud-other','/.well-known/oauth-protected-resource'])expect((await fetch(new URL(path,proxy.server.url))).status).toBe(404);expect(observed).toHaveLength(0);
  for(const method of ['POST','GET','DELETE']){
   const response=await fetch(new URL('/icloud/mcp',proxy.server.url),{method,headers:{authorization:'Bearer fixture','mcp-session-id':'session-fixture'},body:method==='POST'?'fixture-request':undefined});
   expect(response.status).toBe(method==='POST'?201:method==='GET'?200:204);
   if(method==='GET'){expect(response.headers.getSetCookie()).toEqual(['session=fixture; HttpOnly','csrf=fixture; SameSite=Strict']);expect(response.headers.get('mcp-session-id')).toBe('session-response');expect(await response.text()).toBe('data: hello\n\n');}
  }
  expect(observed.map(x=>x.method)).toEqual(['POST','GET','DELETE']);
  expect(observed.every(x=>x.authorization==='Bearer fixture'&&x.session==='session-fixture')).toBe(true);
  expect(observed[0]!.body).toBe('fixture-request');
 }finally{await proxy.close();await backend.stop(true);}
 await expect(fetch(proxy.server.url)).rejects.toThrow();
});
test('proxy shutdown aborts an open upstream event stream and releases listener',async()=>{
 let upstreamAborted=false;
 const backend=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  request.signal.addEventListener('abort',()=>{upstreamAborted=true;});
  return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: first\n\n'));},cancel(){upstreamAborted=true;}}),{headers:{'content-type':'text/event-stream'}});
 }});
 const proxy=createProxy(0,async()=>backend.url.href);
 try{
  const response=await fetch(new URL('/icloud/mcp',proxy.server.url));const reader=response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n');
  await proxy.close();
  for(let attempt=0;attempt<25&&!upstreamAborted;attempt++)await Bun.sleep(10);
  expect(upstreamAborted).toBe(true);
  await expect(fetch(proxy.server.url)).rejects.toThrow();
 }finally{await proxy.close();await backend.stop(true);}
});
