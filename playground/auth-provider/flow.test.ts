import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {jwt} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {passkey} from '@better-auth/passkey';
import {Encoder} from 'cbor-x';
import {createHash,generateKeyPairSync,sign,randomBytes} from 'node:crypto';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest();
const b64=(v:Uint8Array)=>Buffer.from(v).toString('base64url');
const encoder=new Encoder({useRecords:false,mapsAsObjects:false});
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=publicKey.export({format:'jwk'}),id=randomBytes(24);
const cose=encoder.encode(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]));
function response(challenge:string,origin:string,register:boolean){
 const cd=Buffer.from(JSON.stringify({type:register?'webauthn.create':'webauthn.get',challenge,origin,crossOrigin:false}));
 const count=Buffer.alloc(4);count.writeUInt32BE(register?0:1);
 const ad=Buffer.concat([hash('127.0.0.1'),Buffer.from([register?0x45:5]),count]);
 const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
 return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:register?{clientDataJSON:b64(cd),attestationObject:b64(encoder.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',Buffer.concat([ad,Buffer.alloc(16),length,id,cose])]])))}:{clientDataJSON:b64(cd),authenticatorData:b64(ad),signature:b64(sign('sha256',Buffer.concat([ad,hash(cd)]),privateKey))}};
}
test('real provider synthetic Passkey login then consent PKCE code and refresh',async()=>{
 const db=new Database(':memory:');let handler:any=()=>new Response('starting');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>handler(r)}),base=`http://127.0.0.1:${server.port}`;
 const cookies=new Map<string,string>();
 const request=async(path:string,body?:any,form=false)=>{
  const r=await fetch(path.startsWith('http')?path:base+path,{method:body?'POST':'GET',redirect:'manual',headers:{origin:base,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(body?{'content-type':form?'application/x-www-form-urlencoded':'application/json'}:{})},body:body?(form?new URLSearchParams(body):JSON.stringify(body)):undefined});
  for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0]!,at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}return r;
 };
 try{
  const options={database:db,baseURL:base,secret:'fixture-only-long-secret-not-production-12345',emailAndPassword:{enabled:true},disabledPaths:['/token'],plugins:[jwt(),passkey({rpID:'127.0.0.1',origin:base}),oauthProvider({loginPage:'/sign-in',consentPage:'/consent',allowDynamicClientRegistration:true,allowUnauthenticatedClientRegistration:true,scopes:['openid','offline_access','mail.read']})]};
  await(await getMigrations(options)).runMigrations();handler=betterAuth(options).handler;
  expect((await request('/api/auth/sign-up/email',{email:'fixture@example.test',password:'Fixture-password-only-123!',name:'Fixture'})).status).toBe(200);
  const reg=await(await request('/api/auth/passkey/generate-register-options')).json() as any;
  expect(reg.challenge).toBeString();
  const registration={response:response(reg.challenge,base,true)};
  expect((await request('/api/auth/passkey/verify-registration',registration)).status).toBe(200);
  expect((await request('/api/auth/passkey/verify-registration',registration)).status).toBe(400);
  await request('/api/auth/sign-out',{});cookies.clear();
  const authn=await(await request('/api/auth/passkey/generate-authenticate-options')).json() as any;
  expect((await request('/api/auth/passkey/verify-authentication',{response:response(authn.challenge,base,false)})).status).toBe(200);
  const metadata=await(await request('/.well-known/oauth-authorization-server/api/auth')).json() as any;
  const client=await(await request(metadata.registration_endpoint,{client_name:'Fixture',application_type:'native',redirect_uris:[base+'/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'mail.read offline_access'})).json() as any;
  const verifier=b64(randomBytes(32));
  const authorize=metadata.authorization_endpoint+'?'+new URLSearchParams({client_id:client.client_id,redirect_uri:base+'/callback',response_type:'code',scope:'mail.read offline_access',state:'fixture-state',code_challenge:b64(hash(verifier)),code_challenge_method:'S256'});
  const start=await request(authorize);expect(start.status).toBe(302);
  const location=new URL(start.headers.get('location')!,base);expect(location.pathname).toBe('/consent');
  const consent=await request('/api/auth/oauth2/consent',{accept:true,oauth_query:location.search.slice(1)});
  const decision=await consent.json() as any;
  expect(consent.status).toBe(200);
  const callback=new URL(decision.url);expect(callback.searchParams.get('state')).toBe('fixture-state');
  const exchanged=await request(metadata.token_endpoint,{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:base+'/callback',code:callback.searchParams.get('code')!,code_verifier:verifier},true);
  const tokens=await exchanged.json() as any;expect(exchanged.status).toBe(200);expect(tokens.access_token).toBeString();expect(tokens.refresh_token).toBeString();
  const refreshed=await request(metadata.token_endpoint,{grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token},true);expect(refreshed.status).toBe(200);expect((await refreshed.json() as any).access_token).toBeString();
 }finally{await server.stop(true);db.close();}
});
