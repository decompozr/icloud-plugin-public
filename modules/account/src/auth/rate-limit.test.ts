import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createOwnerAuth } from './owner.js';

test('auth database limits apply without production mode and cannot be bypassed by forwarded header rotation',async()=>{
 const database=new Database(':memory:');
 const config={database,publicBaseURL:'https://plugin.invalid',privateOrigin:'https://plugin.invalid:8443',rpID:'plugin.invalid',secret:'synthetic-test-only-secret-longer-than-32',resource:'https://plugin.invalid/icloud/mcp',scopes:['mail.read'],ownerId:()=>null,checkBootstrapProof:()=>{throw Error('Denied');}};
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='test';
 try{
  let component=await createOwnerAuth(config);
  const request=(path:string,index:number)=>component.publicHandler(new Request('https://plugin.invalid/icloud/auth'+path,{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':`203.0.113.${index}`,'x-real-ip':`198.51.100.${index}`},body:'{}'}));
  // Internal verifier registration consumes one request in the shared DCR bucket.
  for(let i=0;i<9;i++)expect((await request('/oauth2/register',i)).status).not.toBe(429);
  const denied=await request('/oauth2/register',99);expect(denied.status).toBe(429);expect(denied.headers.get('x-retry-after')).toBeTruthy();
  component=await createOwnerAuth(config);
  expect((await request('/oauth2/register',100)).status).toBe(429);
  for(let i=0;i<60;i++)expect((await request('/oauth2/token',i)).status).not.toBe(429);
  expect((await request('/oauth2/token',101)).status).toBe(429);
 }finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;database.close();}
});
