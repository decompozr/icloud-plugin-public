import { Database } from 'bun:sqlite';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { passkey } from '@better-auth/passkey';
import { oauthProvider } from '@better-auth/oauth-provider';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Principal } from './verify.js';
import { authRateLimit } from './rate-limit.js';

export interface OwnerAuthOptions {
 database: Database;
 publicBaseURL: string;
 privateOrigin: string;
 rpID: string;
 secret: string;
 resource: string;
 scopes: string[];
 allowedScopes?(): readonly string[];
 ownerId(): string | null | undefined;
 checkBootstrapProof(proof: string): void;
}
const bootstrapPaths = new Set(['/icloud/auth/passkey/generate-register-options','/icloud/auth/passkey/verify-registration']);
const publicPaths = new Set(['/icloud/auth/passkey/generate-authenticate-options','/icloud/auth/passkey/verify-authentication','/icloud/auth/get-session','/icloud/auth/sign-out','/icloud/auth/oauth2/authorize','/icloud/auth/oauth2/consent','/icloud/auth/oauth2/token','/icloud/auth/oauth2/register','/icloud/auth/oauth2/revoke','/icloud/auth/.well-known/oauth-authorization-server','/.well-known/oauth-authorization-server/icloud/auth']);
const clientSchema=z.object({client_id:z.string(),client_secret:z.string()});
const tokenSchema=z.object({active:z.literal(true),sub:z.string(),iss:z.string(),aud:z.union([z.string(),z.array(z.string())]),scope:z.string(),exp:z.number()});
const cipherSchema=z.object({nonce:z.string(),tag:z.string(),value:z.string()});

export async function createOwnerAuth(options:OwnerAuthOptions) {
 if(options.secret.length<32)throw Error('Auth secret must contain at least 32 characters');
 const publicOrigin=new URL(options.publicBaseURL).origin;
 if(options.publicBaseURL.replace(/\/$/,'')!==publicOrigin)throw Error('Auth base URL must be an origin');
 const origins=[publicOrigin,options.privateOrigin];
 const issuer=options.publicBaseURL.replace(/\/$/,'')+'/icloud/auth';
 const checkBootstrap=(headers:Headers|undefined)=>{ if(options.ownerId())throw Error('Enrollment closed'); options.checkBootstrapProof(headers?.get('x-bootstrap-proof')??''); };
 const config={
  database:options.database,baseURL:options.publicBaseURL,basePath:'/icloud/auth',rateLimit:authRateLimit,advanced:{ipAddress:{ipAddressHeaders:[]},cookiePrefix:'icloud',defaultCookieAttributes:{path:'/icloud'}},secret:options.secret,trustedOrigins:origins,
  plugins:[passkey({rpID:options.rpID,rpName:'iCloud Plugin',origin:origins,authenticatorSelection:{userVerification:'required',residentKey:'required'},
   registration:{requireSession:false,
    resolveUser:async({ctx})=>{checkBootstrap(ctx.headers);const id=randomUUID();return{id,name:'iCloud Plugin Admin',displayName:'iCloud Plugin Admin'};},
    afterVerification:async({ctx,verification,user})=>{
     checkBootstrap(ctx.headers);if(!verification.registrationInfo?.userVerified)throw new APIError('BAD_REQUEST',{message:'User verification required'});
     await ctx.context.internalAdapter.createUser({id:user.id,email:`${user.id}@owner.invalid`,name:'iCloud Plugin Admin',emailVerified:false},{method:'passkey'});
    }},
   authentication:{afterVerification:async({verification})=>{if(!verification.authenticationInfo.userVerified)throw new APIError('UNAUTHORIZED',{message:'User verification required'});}}
  }),oauthProvider({loginPage:'/icloud/sign-in',consentPage:'/icloud/consent',disableJwtPlugin:true,
   allowDynamicClientRegistration:true,allowUnauthenticatedClientRegistration:true,
   grantTypes:['authorization_code','refresh_token'],scopes:options.scopes,
   // This app owns the canonical resource scope ceiling. Reconcile only
   // supplied fields; preserve other resource policy and existing grants.
   resourceSeedMode:'merge' as const,
   resources:[{identifier:options.resource,allowedScopes:options.scopes}],
   clientRegistrationDefaultResources:[options.resource],clientRegistrationRequirePKCE:true,
   clientPrivileges:async({user})=>Boolean(user&&user.id===options.ownerId()),resourcePrivileges:async()=>false,
  })]
 };
 await(await getMigrations(config)).runMigrations();
 const auth=betterAuth(config);
 options.database.exec('CREATE TABLE IF NOT EXISTS plugin_auth_private (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
 const key=createHash('sha256').update(options.secret).update('icloud-resource-client-v1').digest();
 const seal=(value:string)=>{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return JSON.stringify({nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:encrypted.toString('base64')});};
 const open=(value:string)=>{const item=cipherSchema.parse(JSON.parse(value)),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(item.nonce,'base64'));decipher.setAuthTag(Buffer.from(item.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(item.value,'base64')),decipher.final()]).toString('utf8');};
 const resourceClientKey='resource-client-v2:'+createHash('sha256').update(issuer+'\n'+options.resource).digest('hex');
 const stored=options.database.query<{value:string},[string]>("SELECT value FROM plugin_auth_private WHERE id=?").get(resourceClientKey);
 let resourceClient: z.infer<typeof clientSchema>;
 if(stored)resourceClient=clientSchema.parse(JSON.parse(open(stored.value)));
 else {
  const response=await auth.handler(new Request(issuer+'/oauth2/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Internal resource verifier',application_type:'native',redirect_uris:[publicOrigin+'/icloud/internal-unused-callback'],token_endpoint_auth_method:'client_secret_post',grant_types:['authorization_code'],response_types:['code'],scope:options.scopes.join(' ')})}));
  if(!response.ok)throw Error('Resource verifier provisioning failed');
  resourceClient=clientSchema.parse(await response.json());
  options.database.query("INSERT INTO plugin_auth_private (id,value) VALUES (?,?)").run(resourceClientKey,seal(JSON.stringify(resourceClient)));
 }
 async function session(headers:Headers, requireOwner=true){const result=await auth.api.getSession({headers});if(!result || (requireOwner&&result.user.id!==options.ownerId()))throw Error('Owner session required');return result;}
 async function route(request:Request,privateRoute:boolean):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,origin=request.headers.get('origin');
  if(origin&&!origins.includes(origin))return new Response('Forbidden',{status:403});
  if(bootstrapPaths.has(path)){
   if(!privateRoute)return new Response('Not found',{status:404});
   if(origin&&origin!==options.privateOrigin)return new Response('Forbidden',{status:403});
   try{checkBootstrap(request.headers);}catch{return new Response('Enrollment denied',{status:403});}
   // A staged owner resumes setup; never generate another credential from the
   // framework's session-email fallback (which is an internal account identifier).
   if(path==='/icloud/auth/passkey/generate-register-options'&&await auth.api.getSession({headers:request.headers}))return new Response('Passkey already registered; resume setup',{status:409});
  }else if(!publicPaths.has(path))return new Response('Not found',{status:404});
  if(path==='/icloud/auth/oauth2/authorize'||path==='/icloud/auth/oauth2/consent'){
   if(options.allowedScopes){
    const allowed=new Set(options.allowedScopes());
    let requested=url.searchParams.get('scope');
    if(path.endsWith('/consent')){
     const body=z.object({oauth_query:z.string()}).safeParse(await request.clone().json().catch(()=>null));
     if(!body.success)return new Response('Invalid authorization request',{status:400});
     requested=new URLSearchParams(body.data.oauth_query).get('scope');
    }
    // Do not let provider's omitted-scope default silently request disabled scopes.
    if(!requested||requested.split(' ').filter(Boolean).some(scope=>!allowed.has(scope)))return new Response('Requested capability is disabled',{status:403});
   }

   const existing=await auth.api.getSession({headers:request.headers});
   if(existing&&existing.user.id!==options.ownerId())return new Response('Owner required',{status:403});
  }
  const response=await auth.handler(request);
  if(options.allowedScopes&&path.includes('/.well-known/oauth-authorization-server')&&response.ok){
   const body=z.record(z.unknown()).parse(await response.json());
   return Response.json({...body,scopes_supported:[...options.allowedScopes()]},{status:response.status,headers:response.headers});
  }
  return response;
 }
 async function verifyBearer(authorization?:string):Promise<Principal>{
  const match=/^Bearer ([^\s]+)$/i.exec(authorization??'');if(!match)throw Error('Bearer required');
  const response=await auth.handler(new Request(issuer+'/oauth2/introspect',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:match[1]!,client_id:resourceClient.client_id,client_secret:resourceClient.client_secret,token_type_hint:'access_token'})}));
  if(!response.ok)throw Error('Invalid token');const token=tokenSchema.parse(await response.json());
  if(token.sub!==options.ownerId()||token.iss!==issuer||token.exp<=Date.now()/1000||!(Array.isArray(token.aud)?token.aud:[token.aud]).includes(options.resource))throw Error('Invalid token claims');
  const scopes=new Set(token.scope.split(' '));if(!scopes.has('mail.read'))throw Error('Missing mail.read');
  return{subject:token.sub,scopes};
 }
 return{publicHandler:(request:Request)=>route(request,false),privateHandler:(request:Request)=>route(request,true),verifyBearer,ownerSession:(headers:Headers)=>session(headers),enrollmentSession:(headers:Headers)=>session(headers,false)};
}
