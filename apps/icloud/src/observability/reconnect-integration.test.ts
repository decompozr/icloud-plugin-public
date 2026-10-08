import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createOwnerAuth} from '@decompozr/account/server';
import {createHttpApp} from '../server/http.js';
import {HttpLifecycle} from '../server/lifecycle.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {ReconnectCapture} from './reconnect.js';
test('real provider rejection, public HTTP stages and MCP error produce only safe diagnostic records',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'reconnect-http-')),db=new Database(':memory:');
 const capture=new ReconnectCapture(directory);
 writeFileSync(join(directory,'reconnect-diagnostics.enable'),'',{mode:0o600});
 const config={transport:'http' as const,host:'127.0.0.1',port:0,publicUrl:'http://127.0.0.1/icloud/mcp',issuer:'http://127.0.0.1/icloud/auth',audience:'http://127.0.0.1/icloud/mcp',jwksUrl:'http://127.0.0.1/unused',scopes:['mail.read'],allowedSubjects:[]};
 let auth:Awaited<ReturnType<typeof createOwnerAuth>>;let base='';
 const app=createHttpApp(config,new ModuleRuntime(),async()=>{throw Error('fixture secret');},new HttpLifecycle(),undefined,capture,async request=>auth.publicHandler(new Request(base+new URL(request.url).pathname+new URL(request.url).search,request)));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();if(!address||typeof address==='string')throw Error('Missing fixture listener');config.port=address.port;
 base=`http://127.0.0.1:${address.port}`;const secret='CANARY_SECRET_CODE_TOKEN_PASSWORD_EMAIL@example.invalid';
 try{
  auth=await createOwnerAuth({database:db,publicBaseURL:base,privateOrigin:base,rpID:'127.0.0.1',secret:'synthetic-owner-secret-0123456789-0123456789',resource:base+'/icloud/mcp',scopes:['mail.read','calendar.read'],allowedScopes:()=>['mail.read','calendar.read'],ownerId:()=>undefined,checkBootstrapProof:()=>{},onOAuthError:capture.noteError});
  const request=async(path:string,body?:object)=>{
   const response=await fetch(base+path,{redirect:'manual',...(body?{method:'POST',headers:{'content-type':path.endsWith('/token')?'application/x-www-form-urlencoded':'application/json','x-private-canary':secret},body:path.endsWith('/token')?new URLSearchParams(body as Record<string,string>):JSON.stringify(body)}:{})});
   await response.arrayBuffer();return response.status;
  };
  expect(await request('/.well-known/oauth-protected-resource/icloud/mcp?code='+secret)).toBe(200);
  expect(await request('/.well-known/oauth-authorization-server/icloud/auth')).toBe(200);
  expect(await request('/icloud/auth/oauth2/register',{client_name:secret,application_type:'native',redirect_uris:[base+'/callback'],scope:'not-registered',token_endpoint_auth_method:'none'})).toBe(400);
  expect(await request('/icloud/auth/oauth2/authorize?scope=not-registered&code='+secret)).toBe(403);
  expect(await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',code:secret,client_id:secret,client_secret:secret,redirect_uri:base+'/callback'})).toBe(400);
  expect(await request('/icloud/mcp')).toBe(401);
  const text=readFileSync(join(directory,'reconnect-diagnostics.json'),'utf8'),records=JSON.parse(text);
  expect(records.map((r:{stage:string})=>r.stage)).toEqual(['discovery','discovery','registration','authorization','token','mcp']);
  expect(records.map((r:{errorCode:string})=>r.errorCode)).toEqual(['none','none','invalid_scope','invalid_scope','invalid_grant','invalid_token']);
  expect(text).not.toContain(secret);expect(text).not.toContain('Bearer');expect(text).not.toContain('client_secret');expect(text).not.toContain('?code=');
  // Synthetic client has a narrower registration ceiling; no real grant exists.
  const registered=await auth.publicHandler(new Request(base+'/icloud/auth/oauth2/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:secret,application_type:'native',redirect_uris:['https://client.invalid/callback'],scope:'mail.read',token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']})}));
  expect(registered.status).toBe(201);
  const client=await registered.json() as {client_id:string};db.query('UPDATE oauthClient SET scopes=? WHERE clientId=?').run('["mail.read"]',client.client_id);expect(db.query<{scopes:string},[string]>('SELECT scopes FROM oauthClient WHERE clientId=?').get(client.client_id)?.scopes).toBe('["mail.read"]');
  const query=new URLSearchParams({client_id:client.client_id,redirect_uri:'https://client.invalid/callback',response_type:'code',scope:'calendar.read',state:secret,code:secret,code_challenge:'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',code_challenge_method:'S256'});
  expect(await request('/icloud/auth/oauth2/authorize?'+query)).toBe(302);
  const redirectText=readFileSync(join(directory,'reconnect-diagnostics.json'),'utf8');
  const last=JSON.parse(redirectText).at(-1);
  expect(last).toMatchObject({stage:'authorization',route:'/icloud/auth/oauth2/authorize',status:302,errorCode:'invalid_scope'});
  expect(Object.keys(last)).toEqual(['timestamp','stage','route','status','errorCode']);
  for(const forbidden of [secret,client.client_id,'https://client.invalid','state=','code=','location','error_description'])expect(redirectText).not.toContain(forbidden);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();rmSync(directory,{recursive:true,force:true});}
});
