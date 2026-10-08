import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import type {createServer as ProductionMcpFactory} from '../mail/mcp/server.js';
import {readConfig} from '../mail/config.js';
import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {Encoder} from 'cbor-x';
import {createHash,generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOwnerAuth as createBaselineAuth} from './test-fixtures/scope-upgrade-owner.js';
import type {createOwnerAuth as ProductionFactory} from '@decompozr/account/server';
import {pathToFileURL} from 'node:url';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest();
const b64=(v:Uint8Array)=>Buffer.from(v).toString('base64url');
const encoder=new Encoder({useRecords:false,mapsAsObjects:false});
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=publicKey.export({format:'jwk'}),id=randomBytes(24);
const cose=encoder.encode(new Map<number, number | Buffer>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]));
function response(challenge:string,origin:string,register:boolean,uv=true,counter=1){
 const cd=Buffer.from(JSON.stringify({type:register?'webauthn.create':'webauthn.get',challenge,origin,crossOrigin:false}));
 const count=Buffer.alloc(4);count.writeUInt32BE(register?0:counter);
 const ad=Buffer.concat([hash('127.0.0.1'),Buffer.from([register?(uv?0x45:0x41):(uv?5:1)]),count]);
 const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
 return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:register?{clientDataJSON:b64(cd),attestationObject:b64(encoder.encode(new Map<string, unknown>([['fmt','none'],['attStmt',new Map()],['authData',Buffer.concat([ad,Buffer.alloc(16),length,id,cose])]])))}:{clientDataJSON:b64(cd),authenticatorData:b64(ad),signature:b64(sign('sha256',Buffer.concat([ad,hash(cd)]),privateKey))}};
}
const challengeSchema=z.object({challenge:z.string()});
const clientSchema=z.object({client_id:z.string()});
const tokensSchema=z.object({access_token:z.string(),refresh_token:z.string()});
test('persisted resource scope upgrade reproduces narrowing and merge preserves existing grants',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'icloud-auth-test-')),databasePath=join(directory,'auth.sqlite');
 let db=new Database(databasePath);let handler:(r:Request)=>Promise<Response>=async()=>new Response('starting');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>handler(r)}),base=`http://127.0.0.1:${server.port}`;
 let enabledScopes=['mail.read','mail.write','offline_access'];
 let owner:string|undefined;const proof='fixture-proof';
 const cookies=new Map<string,string>();
 const request=async(path:string,body?:Record<string,unknown>,form=false,privateRoute=false)=>{
  const r=new Request(base+path,{method:body?'POST':'GET',headers:{origin:base,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'x-bootstrap-proof':proof,...(body?{'content-type':form?'application/x-www-form-urlencoded':'application/json'}:{})},body:body?(form?new URLSearchParams(z.record(z.string()).parse(body)):JSON.stringify(body)):undefined});
  const res=privateRoute?await component.privateHandler(r):await fetch(r,{redirect:'manual'});
  for(const cookie of res.headers.getSetCookie()){const pair=cookie.split(';')[0]!,at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}return res;
 };
 const config={database:db,publicBaseURL:base,privateOrigin:base,rpID:'127.0.0.1',secret:'fixture-long-only-secret-production-never-123',resource:base+'/icloud/mcp',scopes:['mail.read','mail.write','mail.send','offline_access'],allowedScopes:()=>enabledScopes,ownerId:()=>owner,checkBootstrapProof:(value:string)=>{if(value!==proof)throw Error('Denied');}};
 db.exec('CREATE TABLE plugin_auth_private (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
 db.query('INSERT INTO plugin_auth_private VALUES (?,?)').run('resource-client','legacy-encrypted-record');
 const oldComponent=await createBaselineAuth({...config,scopes:['mail.read','mail.write','offline_access'],resourceName:'Preserved canonical name',extraResource:base+'/other-resource'});
 const legacyClient=clientSchema.parse(await(await oldComponent.publicHandler(new Request(base+'/icloud/auth/oauth2/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Legacy anonymous fixture',application_type:'native',redirect_uris:[base+'/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'mail.read offline_access'})}))).json());
 let component:Awaited<ReturnType<typeof ProductionFactory>>=await createBaselineAuth(config);
 expect(db.query<{value:string},[]>("SELECT value FROM plugin_auth_private WHERE id='resource-client'").get()?.value).toBe('legacy-encrypted-record');
 expect(db.query<{count:number},[]>("SELECT count(*) AS count FROM plugin_auth_private WHERE id LIKE 'resource-client-v2:%'").get()?.count).toBe(1);
 handler=component.publicHandler;
 try{
  const metadata=await component.publicHandler(new Request(base+'/.well-known/oauth-authorization-server/icloud/auth'));
  expect(metadata.status).toBe(200);
  const discovery=z.object({issuer:z.string(),authorization_endpoint:z.string(),token_endpoint:z.string(),registration_endpoint:z.string()}).parse(await metadata.json());
  expect(discovery.issuer).toBe(base+'/icloud/auth');
  expect(discovery.authorization_endpoint).toBe(base+'/icloud/auth/oauth2/authorize');
  expect(discovery.token_endpoint).toBe(base+'/icloud/auth/oauth2/token');
  expect(discovery.registration_endpoint).toBe(base+'/icloud/auth/oauth2/register');
  expect((await component.publicHandler(new Request(base+'/api/auth/get-session'))).status).toBe(404);
  expect((await request('/icloud/auth/passkey/generate-register-options')).status).toBe(404);
  expect((await component.privateHandler(new Request(base+'/icloud/auth/passkey/generate-register-options'))).status).toBe(403);
  expect((await component.publicHandler(new Request(base+'/icloud/auth/passkey/generate-authenticate-options',{headers:{origin:'https://evil.invalid'}}))).status).toBe(403);
  expect((await request('/icloud/auth/sign-up/email',{email:'a@b.test'})).status).toBe(404);
  const weak=challengeSchema.parse(await(await request('/icloud/auth/passkey/generate-register-options',undefined,false,true)).json());
  expect((await request('/icloud/auth/passkey/verify-registration',{response:response(weak.challenge,base,true,false),createSession:true},false,true)).status).toBe(400);
  const reg=challengeSchema.parse(await(await request('/icloud/auth/passkey/generate-register-options',undefined,false,true)).json());
  const registered=await request('/icloud/auth/passkey/verify-registration',{response:response(reg.challenge,base,true),createSession:true},false,true);
  expect(registered.status).toBe(200);
  const cookieHeaders=()=>new Headers({cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')});
  const staged=await component.enrollmentSession(cookieHeaders());
  await expect(component.ownerSession(cookieHeaders())).rejects.toThrow();
  owner=staged.user.id; // Owner-store acceptance boundary; storage has separate E2E.
  expect((await component.ownerSession(cookieHeaders())).user.id).toBe(owner);
  expect((await request('/icloud/auth/passkey/generate-register-options',undefined,false,true)).status).toBe(403);
  await request('/icloud/auth/sign-out',{});cookies.clear();
  const weakLogin=challengeSchema.parse(await(await request('/icloud/auth/passkey/generate-authenticate-options')).json());
  expect((await request('/icloud/auth/passkey/verify-authentication',{response:response(weakLogin.challenge,base,false,false)})).status).toBe(401);
  const challenge=challengeSchema.parse(await(await request('/icloud/auth/passkey/generate-authenticate-options')).json());
  expect((await request('/icloud/auth/passkey/verify-authentication',{response:response(challenge.challenge,base,false)})).status).toBe(200);
  expect((await request('/icloud/auth/passkey/verify-authentication',{response:response(challenge.challenge,base,false)})).status).toBe(400);
  const client=legacyClient;
  const verifier=b64(randomBytes(32));
  const authorizationPath='/icloud/auth/oauth2/authorize?'+new URLSearchParams({client_id:client.client_id,redirect_uri:base+'/callback',response_type:'code',scope:'mail.read offline_access',resource:base+'/icloud/mcp',state:'fixture-state',code_challenge:b64(hash(verifier)),code_challenge_method:'S256'});
  const start=await request(authorizationPath);
  expect(start.status).toBe(302);const location=new URL(start.headers.get('location')!,base);expect(location.pathname).toBe('/icloud/consent');
  const consent=await request('/icloud/auth/oauth2/consent',{accept:true,oauth_query:location.search.slice(1)});
  const decision=z.object({url:z.string()}).parse(await consent.json());
  const callback=new URL(decision.url);expect(callback.searchParams.get('state')).toBe('fixture-state');
  const exchanged=await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:base+'/callback',resource:base+'/icloud/mcp',code:callback.searchParams.get('code')!,code_verifier:verifier},true);
  const tokens=tokensSchema.parse(await exchanged.json());expect(exchanged.status).toBe(200);
  expect((await component.verifyBearer('Bearer '+tokens.access_token)).subject).toBe(owner);
  const refreshed=await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token,resource:base+'/icloud/mcp'},true);
  expect(refreshed.status).toBe(200);const next=tokensSchema.parse(await refreshed.json());
  expect((await component.verifyBearer('Bearer '+next.access_token)).scopes.has('mail.read')).toBe(true);
  expect((await component.verifyBearer('Bearer '+tokens.access_token)).scopes.has('mail.send')).toBe(false);
  expect((await component.verifyBearer('Bearer '+next.access_token)).scopes.has('mail.send')).toBe(false);
  const sendClient=clientSchema.parse(await(await request('/icloud/auth/oauth2/register',{client_name:'Explicit send fixture',application_type:'native',redirect_uris:[base+'/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'mail.read mail.write mail.send offline_access'})).json());
  const sendPath=authorizationPath.replace(client.client_id,sendClient.client_id).replace('mail.read+offline_access','mail.read+mail.write+mail.send+offline_access');
  expect((await request(sendPath)).status).toBe(403);
  enabledScopes.push('mail.send');
  const sendStart=await request(authorizationPath.replace(client.client_id,sendClient.client_id).replace('mail.read+offline_access','mail.read+mail.write+mail.send+offline_access'));
  const sendLocation=new URL(sendStart.headers.get('location')!,base);
  expect(sendLocation.pathname).toBe('/icloud/consent');
  expect(sendLocation.searchParams.get('scope')).toContain('mail.send');
  enabledScopes=enabledScopes.filter(scope=>scope!=='mail.send');
  expect((await request('/icloud/auth/oauth2/consent',{accept:true,oauth_query:sendLocation.search.slice(1)})).status).toBe(403);
  enabledScopes.push('mail.send');
  const sendConsent=await request('/icloud/auth/oauth2/consent',{accept:true,oauth_query:sendLocation.search.slice(1)});
  const sendCallback=new URL(z.object({url:z.string()}).parse(await sendConsent.json()).url);
  const sendExchange=await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:sendClient.client_id,redirect_uri:base+'/callback',resource:base+'/icloud/mcp',code:sendCallback.searchParams.get('code')!,code_verifier:verifier},true);
  expect(sendExchange.status).toBe(200);
  const sendTokens=tokensSchema.parse(await sendExchange.json());
  const granted=db.query<{scopes:string},[string]>('SELECT scopes FROM oauthConsent WHERE clientId=?').get(sendClient.client_id)!;
  expect(JSON.parse(granted.scopes)).toEqual(['mail.read','mail.write','mail.send','offline_access']);
  expect([...(await component.verifyBearer('Bearer '+sendTokens.access_token)).scopes]).toEqual(['mail.read','mail.write','offline_access']);
  expect((await component.verifyBearer('Bearer '+sendTokens.access_token)).scopes.has('mail.send')).toBe(false); // Reproduces the deployed stale resource ceiling.
  // Approving another client's send grant does not upgrade the original grant.
  expect((await component.verifyBearer('Bearer '+next.access_token)).scopes.has('mail.send')).toBe(false);
  const resourceBefore=db.query<{name:string;allowedScopes:string;updatedAt:string},[string]>('SELECT name,allowedScopes,updatedAt,accessTokenTtl,metadata FROM oauthResource WHERE identifier=?').get(base+'/icloud/mcp')!;
  const otherBefore=db.query('SELECT identifier,name,allowedScopes,updatedAt FROM oauthResource WHERE identifier=?').get(base+'/other-resource');
  const clientsBefore=db.query('SELECT clientId,scopes,updatedAt FROM oauthClient ORDER BY clientId').all();
  const consentBefore=db.query('SELECT clientId,scopes,updatedAt FROM oauthConsent ORDER BY clientId').all();
  db.close();db=new Database(databasePath);const productionModule: {createOwnerAuth:typeof ProductionFactory}=process.env.CP5_ARTIFACT_DIR?await import(pathToFileURL(join(process.env.CP5_ARTIFACT_DIR,'apps/icloud/dist/account/index.js')).href):await import('@decompozr/account/server');component=await productionModule.createOwnerAuth({...config,database:db});handler=component.publicHandler;
  // Force lazy seed through actual resource token verification.
  expect((await component.verifyBearer('Bearer '+sendTokens.access_token)).scopes.has('mail.send')).toBe(false);
  const resourceAfter=db.query<{name:string;allowedScopes:string;updatedAt:string},[string]>('SELECT name,allowedScopes,updatedAt,accessTokenTtl,metadata FROM oauthResource WHERE identifier=?').get(base+'/icloud/mcp')!;
  expect(JSON.parse(resourceAfter.allowedScopes)).toContain('mail.send');expect(resourceAfter.name).toBe(resourceBefore.name);expect(resourceAfter.updatedAt).not.toBe(resourceBefore.updatedAt);
  const {allowedScopes:beforeScopes,updatedAt:beforeTime,...beforeFields}=resourceBefore;const {allowedScopes:afterScopes,updatedAt:afterTime,...afterFields}=resourceAfter;expect(afterFields).toEqual(beforeFields);
  expect(db.query('SELECT identifier,name,allowedScopes,updatedAt FROM oauthResource WHERE identifier=?').get(base+'/other-resource')).toEqual(otherBefore);
  expect(db.query('SELECT clientId,scopes,updatedAt FROM oauthClient ORDER BY clientId').all()).toEqual(clientsBefore);
  expect(db.query('SELECT clientId,scopes,updatedAt FROM oauthConsent ORDER BY clientId').all()).toEqual(consentBefore);
  const oldRefresh=await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:sendTokens.refresh_token,resource:base+'/icloud/mcp'},true);
  expect(oldRefresh.status).toBe(200);const reduced=tokensSchema.parse(await oldRefresh.json());
  const oldPrincipal=await component.verifyBearer('Bearer '+reduced.access_token);expect(oldPrincipal.scopes.has('mail.send')).toBe(false);expect(oldPrincipal.scopes.has('mail.read')).toBe(true);
  const deniedStart=await request(sendPath+'&prompt=consent');const deniedLocation=new URL(deniedStart.headers.get('location')!,base);
  const deniedConsent=await request('/icloud/auth/oauth2/consent',{accept:false,oauth_query:deniedLocation.search.slice(1)});
  expect(new URL(z.object({url:z.string()}).parse(await deniedConsent.json()).url).searchParams.get('error')).toBe('access_denied');
  expect((await component.verifyBearer('Bearer '+reduced.access_token)).scopes.has('mail.send')).toBe(false);
  const freshStart=await request(sendPath+'&prompt=consent');const freshLocation=new URL(freshStart.headers.get('location')!,base);expect(freshLocation.pathname).toBe('/icloud/consent');
  const freshDecision=await request('/icloud/auth/oauth2/consent',{accept:true,oauth_query:freshLocation.search.slice(1)});
  const freshCode=new URL(z.object({url:z.string()}).parse(await freshDecision.json()).url).searchParams.get('code')!;
  const fresh=await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:sendClient.client_id,redirect_uri:base+'/callback',resource:base+'/icloud/mcp',code:freshCode,code_verifier:verifier},true);
  expect(fresh.status).toBe(200);const upgraded=tokensSchema.parse(await fresh.json());expect((await component.verifyBearer('Bearer '+upgraded.access_token)).scopes.has('mail.send')).toBe(true);
  expect((await component.verifyBearer('Bearer '+next.access_token)).scopes.has('mail.send')).toBe(false);
  const forbidden=await request(authorizationPath.replace('mail.read+offline_access','mail.read+mail.write+mail.send+offline_access'));
  expect(new URL(forbidden.headers.get('location')!,base).searchParams.get('error')).toBe('invalid_scope');
  // Request-scopes matrix: a stored broad consent is a ceiling, not the
  // automatically requested grant. No live OAuth values enter this fixture.
  let matrixAccess='';let matrixRefresh='';
  const matrix=async(scope:string|undefined,exchangeScope?:string,resource?:string)=>{
   const query=new URLSearchParams(sendPath.split('?')[1]);if(scope===undefined)query.delete('scope');else query.set('scope',scope);
   const start=await request('/icloud/auth/oauth2/authorize?'+query);if(start.status!==302)return {status:start.status,scopes:[] as string[]};
   let callback=new URL(start.headers.get('location')!,base);
   if(callback.pathname==='/icloud/consent'){const decision=await request('/icloud/auth/oauth2/consent',{accept:true,oauth_query:callback.search.slice(1)});callback=new URL(z.object({url:z.string()}).parse(await decision.json()).url);}
   const exchanged=await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:sendClient.client_id,redirect_uri:base+'/callback',resource:resource??base+'/icloud/mcp',code:callback.searchParams.get('code')!,code_verifier:verifier,...(exchangeScope?{scope:exchangeScope}:{})},true);
   if(!exchanged.ok)return{status:exchanged.status,scopes:[] as string[]};const data=z.object({access_token:z.string(),refresh_token:z.string().optional()}).parse(await exchanged.json());matrixAccess=data.access_token;matrixRefresh=data.refresh_token??'';return{status:exchanged.status,scopes:[...(await component.verifyBearer('Bearer '+data.access_token)).scopes]};
  };
  expect(await matrix('mail.read mail.write')).toEqual({status:200,scopes:['mail.read','mail.write']});
  const sameClientOldAccess=matrixAccess;
  const oldScopeSet=(await component.verifyBearer('Bearer '+sameClientOldAccess)).scopes;
  let adapterCalls=0;const noAdapter=async():Promise<never>=>{adapterCalls++;throw Error('Unexpected adapter');};
  const mcpConfig=readConfig({ICLOUD_USER:'fixture@example.invalid',ICLOUD_APP_PASSWORD:'fixture-only',MCP_PUBLIC_URL:'https://fixture.invalid/icloud/mcp',MCP_OAUTH_ISSUER:'https://fixture.invalid/icloud/auth',MCP_OAUTH_AUDIENCE:'https://fixture.invalid/icloud/mcp',MCP_OAUTH_JWKS_URL:'https://fixture.invalid/unused',MCP_OAUTH_ALLOWED_SUBJECTS:'owner'});
  const mcpModule:{createServer:typeof ProductionMcpFactory}=process.env.CP5_ARTIFACT_DIR?await import(pathToFileURL(join(process.env.CP5_ARTIFACT_DIR,'apps/icloud/dist/mail/mcp/server.js')).href):await import('../mail/mcp/server.js');
  const catalogServer=mcpModule.createServer({listMailboxes:noAdapter,search:noAdapter,read:noAdapter,mark:noAdapter,move:noAdapter,flag:noAdapter,tag:noAdapter,organize:noAdapter,batch:noAdapter},{...mcpConfig,allowWrites:true,allowSend:true},oldScopeSet,undefined,{send:noAdapter,reply:noAdapter,draft:noAdapter});
  const catalogClient=new Client({name:'same-client-stepup',version:'1'});const [catalogTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  try{
   await catalogServer.connect(serverTransport);await catalogClient.connect(catalogTransport);
   expect((await catalogClient.listTools()).tools.some(tool=>tool.name==='mail_send')).toBe(true);
   const blocked=await catalogClient.callTool({name:'mail_send',arguments:{}});expect(blocked.isError).toBe(true);expect(blocked._meta?.['mcp/www_authenticate']).toContain('mail.send');expect(adapterCalls).toBe(0);
   const sameQuery=new URLSearchParams(sendPath.split('?')[1]);sameQuery.set('scope','mail.read mail.send');sameQuery.set('prompt','consent');
   const sameStart=await request('/icloud/auth/oauth2/authorize?'+sameQuery);const sameLocation=new URL(sameStart.headers.get('location')!,base);expect(sameLocation.pathname).toBe('/icloud/consent');
   const refused=await request('/icloud/auth/oauth2/consent',{accept:false,oauth_query:sameLocation.search.slice(1)});expect(new URL(z.object({url:z.string()}).parse(await refused.json()).url).searchParams.get('error')).toBe('access_denied');
   expect((await component.verifyBearer('Bearer '+sameClientOldAccess)).scopes.has('mail.send')).toBe(false);
   const approvedStart=await request('/icloud/auth/oauth2/authorize?'+sameQuery);const approvedLocation=new URL(approvedStart.headers.get('location')!,base);
   const approved=await request('/icloud/auth/oauth2/consent',{accept:true,oauth_query:approvedLocation.search.slice(1)});const approvedCode=new URL(z.object({url:z.string()}).parse(await approved.json()).url).searchParams.get('code')!;
   const sameExchange=await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:sendClient.client_id,redirect_uri:base+'/callback',resource:base+'/icloud/mcp',code:approvedCode,code_verifier:verifier},true);
   expect(sameExchange.status).toBe(200);const sameToken=z.object({access_token:z.string()}).parse(await sameExchange.json());expect([...(await component.verifyBearer('Bearer '+sameToken.access_token)).scopes]).toEqual(['mail.read','mail.send']);
   expect((await component.verifyBearer('Bearer '+sameClientOldAccess)).scopes.has('mail.send')).toBe(false);
   expect((await catalogClient.callTool({name:'mail_send',arguments:{}})).isError).toBe(true);expect(adapterCalls).toBe(0);
  }finally{await catalogClient.close();await catalogServer.close();}
  expect(await matrix('mail.read mail.write mail.send offline_access','mail.read mail.write')).toEqual({status:200,scopes:['mail.read','mail.write','mail.send','offline_access']});
  expect((await matrix(undefined)).status).toBe(403); // application requires explicit requested scopes
  expect((await matrix('mail.read mail.write mail.send offline_access',undefined,base+'/other-resource')).status).toBe(400);
  const defaultProvider=await createBaselineAuth({...config,database:db,allowedScopes:undefined});
  const defaultQuery=new URLSearchParams(sendPath.split('?')[1]);defaultQuery.delete('scope');defaultQuery.set('prompt','consent');
  const defaultStart=await defaultProvider.publicHandler(new Request(base+'/icloud/auth/oauth2/authorize?'+defaultQuery,{headers:cookieHeaders()}));
  expect(defaultStart.status).toBe(302);expect(new URL(defaultStart.headers.get('location')!,base).searchParams.get('scope')).toBe('mail.read mail.write mail.send offline_access');
  const ownershipProvider=await createBaselineAuth({...config,database:db});
  const anonymous=legacyClient;
  const anonymousBefore=db.query('SELECT scopes,updatedAt FROM oauthClient WHERE clientId=?').get(anonymous.client_id);
  expect((await component.ownerSession(cookieHeaders())).user.id).toBe(owner);
  await expect(ownershipProvider.provider.api.adminUpdateOAuthClient({headers:cookieHeaders(),body:{client_id:sendClient.client_id,update:{scope:'mail.read mail.write mail.send offline_access'}}})).resolves.toBeDefined();
  await expect(ownershipProvider.provider.api.adminUpdateOAuthClient({headers:cookieHeaders(),body:{client_id:anonymous.client_id,update:{scope:'mail.read mail.send'}}})).rejects.toMatchObject({status:'UNAUTHORIZED'});
  expect(db.query('SELECT scopes,updatedAt FROM oauthClient WHERE clientId=?').get(anonymous.client_id)).toEqual(anonymousBefore);
  // Existing-client persistence opt-in: all state below is synthetic.
  const persistentClient=clientSchema.parse(await(await request('/icloud/auth/oauth2/register',{client_name:'Persistence opt-in fixture',application_type:'native',redirect_uris:[base+'/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'mail.read mail.write mail.send offline_access'})).json());
  const consentLocation=async(scopes:string)=>{
   const query=new URLSearchParams(sendPath.split('?')[1]);query.set('client_id',persistentClient.client_id);query.set('scope',scopes);query.set('prompt','consent');
   const response=await request('/icloud/auth/oauth2/authorize?'+query);expect(response.status).toBe(302);const location=new URL(response.headers.get('location')!,base);expect(location.pathname).toBe('/icloud/consent');return location;
  };
  const decide=async(location:URL,accept:boolean)=>new URL(z.object({url:z.string()}).parse(await(await request('/icloud/auth/oauth2/consent',{accept,oauth_query:location.search.slice(1)})).json()).url);
  const exchangePersistent=async(callback:URL)=>{
   const response=await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:persistentClient.client_id,redirect_uri:base+'/callback',resource:base+'/icloud/mcp',code:callback.searchParams.get('code')!,code_verifier:verifier},true);expect(response.status).toBe(200);return z.object({access_token:z.string(),refresh_token:z.string().optional()}).parse(await response.json());
  };
  const initialPersistent=await exchangePersistent(await decide(await consentLocation('mail.read mail.write mail.send'),true));
  expect(initialPersistent.refresh_token).toBeUndefined();
  const originalConsent=db.query('SELECT clientId,scopes FROM oauthConsent WHERE clientId=?').all(persistentClient.client_id);
  expect(JSON.parse((originalConsent[0] as {scopes:string}).scopes)).toEqual(['mail.read','mail.write','mail.send']);
  const countClients=db.query<{n:number},[]>('SELECT count(*) AS n FROM oauthClient').get()!.n;
  const persistenceScopes=(await component.verifyBearer('Bearer '+initialPersistent.access_token)).scopes;
  const persistenceServer=mcpModule.createServer({listMailboxes:noAdapter,search:noAdapter,read:noAdapter,mark:noAdapter,move:noAdapter,flag:noAdapter,tag:noAdapter,organize:noAdapter,batch:noAdapter},{...mcpConfig,allowWrites:true,allowSend:true},persistenceScopes);
  const persistenceMcp=new Client({name:'persistence-opt-in',version:'1'});const [pa,pb]=InMemoryTransport.createLinkedPair();
  let requestedPersistence='';
  try{await persistenceServer.connect(pb);await persistenceMcp.connect(pa);
   const descriptor=(await persistenceMcp.listTools()).tools.find(tool=>tool.name==='mail_request_persistent_access');
   expect(descriptor?._meta?.securitySchemes).toEqual([{type:'oauth2',scopes:['mail.read','offline_access']}]);
   const challenge=await persistenceMcp.callTool({name:'mail_request_persistent_access',arguments:{confirm:true}});
   requestedPersistence=z.string().parse(challenge._meta?.['mcp/www_authenticate']).match(/scope="([^"]+)"/)![1]!;
   expect(requestedPersistence.split(' ').sort()).toEqual(['mail.read','mail.send','mail.write','offline_access']);expect(adapterCalls).toBe(0);
  }finally{await persistenceMcp.close();await persistenceServer.close();}
  const refusedPersistence=await decide(await consentLocation(requestedPersistence),false);
  expect(refusedPersistence.searchParams.get('error')).toBe('access_denied');
  expect(db.query('SELECT clientId,scopes FROM oauthConsent WHERE clientId=?').all(persistentClient.client_id)).toEqual(originalConsent);
  expect(db.query<{n:number},[string]>('SELECT count(*) AS n FROM oauthRefreshToken WHERE clientId=?').get(persistentClient.client_id)!.n).toBe(0);
  expect([...(await component.verifyBearer('Bearer '+initialPersistent.access_token)).scopes]).toEqual(['mail.read','mail.write','mail.send']);
  const approvedCallback=await decide(await consentLocation(requestedPersistence),true);
  const approvedPersistence=await exchangePersistent(approvedCallback);
  expect(approvedPersistence.refresh_token).toBeDefined();
  expect([...(await component.verifyBearer('Bearer '+approvedPersistence.access_token)).scopes].sort()).toEqual(['mail.read','mail.send','mail.write','offline_access']);
  expect([...(await component.verifyBearer('Bearer '+initialPersistent.access_token)).scopes]).toEqual(['mail.read','mail.write','mail.send']);
  expect(db.query<{n:number},[]>('SELECT count(*) AS n FROM oauthClient').get()!.n).toBe(countClients);
  expect(db.query<{n:number},[string]>('SELECT count(*) AS n FROM oauthRefreshToken WHERE clientId=?').get(persistentClient.client_id)!.n).toBe(1);
  const grantedPersistenceServer=mcpModule.createServer({listMailboxes:noAdapter,search:noAdapter,read:noAdapter,mark:noAdapter,move:noAdapter,flag:noAdapter,tag:noAdapter,organize:noAdapter,batch:noAdapter},{...mcpConfig,allowWrites:true,allowSend:true},(await component.verifyBearer('Bearer '+approvedPersistence.access_token)).scopes);
  const grantedPersistenceClient=new Client({name:'granted-persistence',version:'1'});const [ga,gb]=InMemoryTransport.createLinkedPair();
  try{await grantedPersistenceServer.connect(gb);await grantedPersistenceClient.connect(ga);
   for(let i=0;i<2;i++){const result=await grantedPersistenceClient.callTool({name:'mail_request_persistent_access',arguments:{confirm:true}});expect(result.isError).not.toBe(true);expect(result._meta?.['mcp/www_authenticate']).toBeUndefined();}
   expect(adapterCalls).toBe(0);expect(db.query<{n:number},[string]>('SELECT count(*) AS n FROM oauthRefreshToken WHERE clientId=?').get(persistentClient.client_id)!.n).toBe(1);
  }finally{await grantedPersistenceClient.close();await grantedPersistenceServer.close();}
  expect((await request('/icloud/auth/oauth2/token',{grant_type:'authorization_code',client_id:persistentClient.client_id,redirect_uri:base+'/callback',resource:base+'/icloud/mcp',code:approvedCallback.searchParams.get('code')!,code_verifier:verifier},true)).status).toBe(400);
  await expect(component.verifyBearer('Bearer '+approvedPersistence.access_token)).rejects.toThrow(); // Provider's existing code-replay defense.
  expect([...(await component.verifyBearer('Bearer '+initialPersistent.access_token)).scopes]).toEqual(['mail.read','mail.write','mail.send']);
  console.log('PERSISTENCE_STEPUP_PASS: same registered client, initial mail-only grant, refused offline consent preserves grant/no refresh, accepted consent issues refresh; old token unchanged; no new registration. Synthetic only.');
  // Lifecycle checks alter only synthetic fixture expiry timestamps.
  const escalation=await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:reduced.refresh_token,resource:base+'/icloud/mcp',scope:'mail.read mail.send'},true);
  expect(escalation.status).toBe(400);
  const rotate=await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:reduced.refresh_token,resource:base+'/icloud/mcp'},true);
  expect(rotate.status).toBe(200);const rotated=tokensSchema.parse(await rotate.json());
  expect((await component.verifyBearer('Bearer '+rotated.access_token)).scopes.has('mail.send')).toBe(false);
  const replay=await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:reduced.refresh_token,resource:base+'/icloud/mcp'},true);
  expect(replay.status).toBe(400);
  expect((await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:rotated.refresh_token,resource:base+'/icloud/mcp'},true)).status).toBe(400);
  await matrix('mail.read mail.write mail.send offline_access');
  const revoking=matrixRefresh;
  expect((await request('/icloud/auth/oauth2/revoke',{client_id:sendClient.client_id,token:revoking,token_type_hint:'refresh_token'},true)).status).toBe(200);
  expect((await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:revoking,resource:base+'/icloud/mcp'},true)).status).toBe(400);
  await matrix('mail.read mail.write mail.send offline_access');expect(matrixRefresh).not.toBe('');expect((await component.verifyBearer('Bearer '+matrixAccess)).scopes.has('mail.read')).toBe(true);
  db.query('UPDATE oauthAccessToken SET expiresAt=? WHERE clientId=?').run('2000-01-01T00:00:00.000Z',sendClient.client_id);
  await expect(component.verifyBearer('Bearer '+matrixAccess)).rejects.toThrow();
  db.query('UPDATE oauthRefreshToken SET expiresAt=? WHERE clientId=?').run('2000-01-01T00:00:00.000Z',sendClient.client_id);
  expect((await request('/icloud/auth/oauth2/token',{grant_type:'refresh_token',client_id:sendClient.client_id,refresh_token:matrixRefresh,resource:base+'/icloud/mcp'},true)).status).toBe(400);
  expect((await component.verifyBearer('Bearer '+next.access_token)).scopes.has('mail.read')).toBe(true);




 }finally{await server.stop(true);db.close();rmSync(directory,{recursive:true,force:true});}
});
