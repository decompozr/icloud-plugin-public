import {createClientRecovery,withOAuthMutation} from './client-recovery.js';
import { Database } from 'bun:sqlite';
import { betterAuth } from 'better-auth';
import { APIError,createAuthMiddleware } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { passkey } from '@better-auth/passkey';
import { oauthProvider } from '@better-auth/oauth-provider';
import { createHash, randomUUID } from 'node:crypto';
import {resourceClientSchema as clientSchema,resourceClientStorageId,sealResourceClient,openResourceClient} from './key-contexts.js';
import { z } from 'zod';
import type { Principal } from './verify.js';
import { authRateLimit } from './rate-limit.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAccountConnection, validConsentScopes, type AccountStore } from './connect.js';
import {reconnectRedirectError} from '../observability/reconnect.js';
import type {AccountCredentialReader} from '../storage/account-credential-reader.js';

export interface OwnerAuthOptions {
 database: Database;
 sessionOnly?:boolean;
 cookiePrefix?:string;
 registrationOwnerId?():string|null|undefined;
 checkRegistrationProof?(proof:string):void;
 onOAuthError?(code:unknown):void;
 publicBaseURL: string;
 privateOrigin: string;
 rpID: string;
 secret: string;
 resource: string;
 scopes: string[];
 allowedScopes?(): readonly string[];
 ownerId(): string | null | undefined;
 checkBootstrapProof(proof: string): void;
 accountStore?: AccountStore;
 credentialReader?:Pick<AccountCredentialReader,'account'|'listAccounts'|'assertCurrent'>;
 validateCredential?(credential:{user:string;appPassword:string}):Promise<void>;
}
const bootstrapPaths = new Set(['/icloud/auth/passkey/generate-register-options','/icloud/auth/passkey/verify-registration']);
const publicPaths = new Set(['/icloud/auth/passkey/generate-authenticate-options','/icloud/auth/passkey/verify-authentication','/icloud/auth/get-session','/icloud/auth/sign-out','/icloud/auth/oauth2/authorize','/icloud/auth/oauth2/continue','/icloud/auth/oauth2/consent','/icloud/auth/oauth2/token','/icloud/auth/oauth2/register','/icloud/auth/oauth2/revoke','/icloud/auth/.well-known/oauth-authorization-server','/.well-known/oauth-authorization-server/icloud/auth']);
const tokenSchema=z.object({active:z.literal(true),sub:z.string(),iss:z.string(),aud:z.union([z.string(),z.array(z.string())]),scope:z.string(),exp:z.number(),account_id:z.string().optional(),client_id:z.string().optional()});

export async function createOwnerAuth(options:OwnerAuthOptions) {
 if(options.credentialReader&&!options.accountStore)throw Error('Custody account store required');
 if(options.secret.length<32)throw Error('Auth secret must contain at least 32 characters');
 const publicOrigin=new URL(options.publicBaseURL).origin;
 if(options.publicBaseURL.replace(/\/$/,'')!==publicOrigin)throw Error('Auth base URL must be an origin');
 const origins=[publicOrigin,options.privateOrigin];
 const issuer=options.publicBaseURL.replace(/\/$/,'')+'/icloud/auth';
 const checkBootstrap=(headers:Headers|undefined)=>{const proof=headers?.get('x-bootstrap-proof')??'';if(options.checkRegistrationProof){options.checkRegistrationProof(proof);return;}if(options.ownerId())throw Error('Enrollment closed');options.checkBootstrapProof(proof);};
 const requestContext=new AsyncLocalStorage<{query?:string;accountId?:string;refreshToken?:string}>();
 const accountMetadata=(owner:string,id:string)=>{
  if(!options.credentialReader)return options.accountStore!.account(owner,id);
  const snapshot=options.credentialReader.account(owner,id);
  if(snapshot.ownerId!==owner||snapshot.account.id!==id)throw Error('Credential account mismatch');
  options.credentialReader.assertCurrent(snapshot);
  return snapshot.account;
 };
 let connection:ReturnType<typeof createAccountConnection>|undefined;
 const recoverClient=createClientRecovery({database:options.database,origin:options.privateOrigin,resource:options.resource,declaredScopes:options.scopes,validAccount:(owner,accountId)=>{try{return Boolean(options.accountStore&&accountMetadata(owner,accountId).credentialStored);}catch{return false;}},allowedScopes:()=>options.allowedScopes?.()??options.scopes,ownerSession:headers=>session(headers),updateClient:async(headers,clientId,scopes)=>{await auth.api.updateOAuthClient({headers,body:{client_id:clientId,update:{scope:scopes.join(' ')}}});}});
 const config={
  ...(options.onOAuthError?{hooks:{after:createAuthMiddleware(async ctx=>{
   try{
    const result=ctx.context.returned;
    if(result instanceof APIError&&result.status!=='FOUND')options.onOAuthError?.(result.body?.error);
   }catch{/* Diagnostics are best effort; never log raw values or errors. */}
  })}}:{}),
  database:options.database,baseURL:options.publicBaseURL,basePath:'/icloud/auth',rateLimit:authRateLimit,advanced:{ipAddress:{ipAddressHeaders:[]},cookiePrefix:options.cookiePrefix??'icloud',defaultCookieAttributes:{path:'/icloud'}},secret:options.secret,trustedOrigins:origins,
  plugins:[passkey({rpID:options.rpID,rpName:'iCloud Plugin',origin:origins,authenticatorSelection:{userVerification:'required',residentKey:'required'},
   registration:{requireSession:false,
    resolveUser:async({ctx})=>{checkBootstrap(ctx.headers);const id=options.registrationOwnerId?.()??randomUUID();return{id,name:'iCloud Plugin Admin',displayName:'iCloud Plugin Admin'};},
    afterVerification:async({ctx,verification,user})=>{
     checkBootstrap(ctx.headers);if(!verification.registrationInfo?.userVerified)throw new APIError('BAD_REQUEST',{message:'User verification required'});
     if(options.registrationOwnerId?.()){if(user.id!==options.registrationOwnerId())throw new APIError('FORBIDDEN',{message:'Owner required'});return;}
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
   ...(options.accountStore?{
    postLogin:{page:'/icloud/connect',shouldRedirect:async()=>!requestContext.getStore()?.accountId,
     consentReferenceId:async({user,session}:{user:{id:string};session:{id:string}})=>{
      const ctx=requestContext.getStore();
      const accountId=ctx?.accountId??(ctx?.query?connection?.selected(ctx.query,user.id,session.id)?.id:undefined);
      if(user.id!==options.ownerId()||!accountId||!accountMetadata(user.id,accountId).credentialStored)throw new APIError('FORBIDDEN',{message:'Account selection required'});
      return accountId;
     }},
    customAccessTokenClaims:async({user,referenceId}:{user?:{id:string}|null;referenceId?:string})=>{
     if(!user||user.id!==options.ownerId())throw new APIError('FORBIDDEN',{message:'Owner required'});
     const id=referenceId??options.accountStore!.legacyAccountId(user.id);
     if(!id)throw new APIError('FORBIDDEN',{message:'Account unavailable'});
     accountMetadata(user.id,id);
     return{account_id:id};
    },
    // Opaque token issuance does not execute customAccessTokenClaims. Validate
    // the persisted grant before minting/rotating through the response hook.
    customTokenResponseFields:async({grantType,user,verificationValue}:{grantType:string;user?:{id:string}|null;verificationValue?:{referenceId?:string}})=>{
     if(!user||user.id!==options.ownerId())throw new APIError('FORBIDDEN',{message:'Owner required'});
     let referenceId=verificationValue?.referenceId;
     if(grantType==='refresh_token'){
      const presented=requestContext.getStore()?.refreshToken;
      if(!presented)throw new APIError('BAD_REQUEST',{error:'invalid_grant'});
      // The provider's configured default stores SHA-256 base64url digests.
      const stored=createHash('sha256').update(presented).digest('base64url');
      const row=options.database.query<{userId:string;referenceId:string|null},[string]>('SELECT userId,referenceId FROM oauthRefreshToken WHERE token=?').get(stored);
      if(!row||row.userId!==user.id)throw new APIError('BAD_REQUEST',{error:'invalid_grant'});
      referenceId=row.referenceId??undefined;
     }
     const id=referenceId??options.accountStore!.legacyAccountId(user.id);
     if(!id||!accountMetadata(user.id,id).credentialStored)throw new APIError('BAD_REQUEST',{error:'invalid_grant'});
     return{};
    },
   }:{}),
  })]
 };
 await(await getMigrations(config)).runMigrations();
 const auth=betterAuth(config);
 options.database.exec('CREATE TABLE IF NOT EXISTS plugin_auth_private (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
 const seal=(value:string)=>sealResourceClient(options.secret,value);
 const open=(value:string)=>openResourceClient(options.secret,value);
 const resourceClientKey=resourceClientStorageId(issuer,options.resource);
 let resourceClient:z.infer<typeof clientSchema>|undefined;
 if(!options.sessionOnly){
 const stored=options.database.query<{value:string},[string]>("SELECT value FROM plugin_auth_private WHERE id=?").get(resourceClientKey);
 if(stored)resourceClient=clientSchema.parse(JSON.parse(open(stored.value)));
 else {
  const response=await auth.handler(new Request(issuer+'/oauth2/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Internal resource verifier',application_type:'native',redirect_uris:[publicOrigin+'/icloud/internal-unused-callback'],token_endpoint_auth_method:'client_secret_post',grant_types:['authorization_code'],response_types:['code'],scope:options.scopes.join(' ')})}));
  if(!response.ok)throw Error('Resource verifier provisioning failed');
  resourceClient=clientSchema.parse(await response.json());
  options.database.query("INSERT INTO plugin_auth_private (id,value) VALUES (?,?)").run(resourceClientKey,seal(JSON.stringify(resourceClient)));
 }
 }
 async function session(headers:Headers, requireOwner=true){const result=await auth.api.getSession({headers});if(!result || (requireOwner&&result.user.id!==options.ownerId()))throw Error('Owner session required');return result;}
 if(options.accountStore)connection=createAccountConnection({database:options.database,secret:options.secret,origin:publicOrigin,allowedScopes:()=>options.allowedScopes?.()??options.scopes,store:options.accountStore,credentialReader:options.credentialReader,clientName:id=>options.database.query<{name:string|null},[string]>('SELECT name FROM oauthClient WHERE clientId=?').get(id)?.name??undefined,ownerSession:headers=>session(headers),validateCredential:options.validateCredential??(async()=>{throw Error('Credential validation unavailable');}),continueAuthorization:(request,query,accountId)=>requestContext.run({query,accountId},()=>auth.handler(new Request(issuer+'/oauth2/continue',{method:'POST',headers:request.headers,body:JSON.stringify({oauth_query:query,postLogin:true})})))});
 async function route(request:Request,privateRoute:boolean):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,origin=request.headers.get('origin');
  if(origin&&!origins.includes(origin))return new Response('Forbidden',{status:403});
  if(path==='/icloud/admin/oauth-clients')return privateRoute?recoverClient(request):new Response('Not found',{status:404});
  if(path.startsWith('/icloud/connect/'))return connection?.handle(request)??new Response('Not found',{status:404});
  let oauthQuery:string|undefined,consentAccountId:string|undefined,consentSession:{owner:string;id:string}|undefined,consentDenied=false,refreshToken:string|undefined;
  if(connection&&path==='/icloud/auth/oauth2/token'&&request.method==='POST'){
   const fields=request.headers.get('content-type')?.startsWith('application/json')?await request.clone().json().catch(()=>null):Object.fromEntries(new URLSearchParams(await request.clone().text()));
   const parsed=z.object({grant_type:z.literal('refresh_token'),refresh_token:z.string().min(1).max(4096)}).safeParse(fields);
   if(parsed.success)refreshToken=parsed.data.refresh_token;
  }
  if(connection&&(path==='/icloud/auth/oauth2/consent'||path==='/icloud/auth/oauth2/continue')){
   if(request.method!=='POST'||origin!==publicOrigin)return new Response('Forbidden',{status:403});
   const parsed=z.object({oauth_query:z.string(),accept:z.boolean().optional(),postLogin:z.boolean().optional(),scope:z.string().optional()}).safeParse(await request.clone().json().catch(()=>null));
   if(!parsed.success)return new Response('Invalid authorization request',{status:400});
   oauthQuery=parsed.data.oauth_query;
   try{
    const params=await connection.signed(oauthQuery),current=await session(request.headers);
    if(parsed.data.scope!==undefined&&!validConsentScopes(oauthQuery,parsed.data.scope,options.allowedScopes?.()??options.scopes))return new Response('Invalid consent scopes',{status:403});
    if(params.get('ba_pl')&&params.get('ba_pl')!==current.session.id)return new Response('Invalid authorization session',{status:403});
    if(parsed.data.postLogin)return new Response('Account selection required',{status:403});
    if(path.endsWith('/consent')){
     if(parsed.data.accept!==false){
      const selected=connection.selected(oauthQuery,current.user.id,current.session.id);
      if(!params.get('ba_pl')||params.get('ba_pl')!==current.session.id||!selected)return new Response('Account selection required',{status:403});
      consentAccountId=selected.id;
     }
     consentDenied=parsed.data.accept===false;
     consentSession={owner:current.user.id,id:current.session.id};
    }
   }catch{return new Response('Invalid authorization request',{status:403});}
  }
  if(connection&&path==='/icloud/auth/oauth2/authorize'){
   // A signed continuation belongs on /continue. Raw authorization always starts a fresh selection.
   if(url.searchParams.has('sig')||url.searchParams.has('ba_pl'))return new Response('Invalid authorization continuation',{status:400});
   const prompts=new Set((url.searchParams.get('prompt')??'').split(' ').filter(Boolean));
   if(!prompts.has('none'))prompts.add('consent');
   url.searchParams.set('prompt',[...prompts].join(' '));request=new Request(url,request);
  }
  if(bootstrapPaths.has(path)){
   if(!privateRoute)return new Response('Not found',{status:404});
   if(origin&&origin!==options.privateOrigin)return new Response('Forbidden',{status:403});
   try{checkBootstrap(request.headers);}catch{return new Response('Enrollment denied',{status:403});}
   // A staged owner resumes setup; never generate another credential from the
   // framework's session-email fallback (which is an internal account identifier).
   if(!options.checkRegistrationProof&&path==='/icloud/auth/passkey/generate-register-options'&&await auth.api.getSession({headers:request.headers}))return new Response('Passkey already registered; resume setup',{status:409});
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
    if(!requested||requested.split(' ').filter(Boolean).some(scope=>!allowed.has(scope))){try{options.onOAuthError?.('invalid_scope');}catch{}return new Response('Requested capability is disabled',{status:403});}
   }

   const existing=await auth.api.getSession({headers:request.headers});
   if(existing&&existing.user.id!==options.ownerId())return new Response('Owner required',{status:403});
  }
  if(connection&&consentSession&&oauthQuery){
   if(consentDenied)connection.cancel(oauthQuery,consentSession.owner,consentSession.id);
   else if(!connection.consume(oauthQuery,consentSession.owner,consentSession.id))return new Response('Authorization already used',{status:403});
  }
  const response=await requestContext.run({query:oauthQuery,accountId:consentAccountId,refreshToken},()=>auth.handler(request));
  if(options.onOAuthError&&response.status>=300&&response.status<400&&['/icloud/auth/oauth2/authorize','/icloud/auth/oauth2/continue','/icloud/auth/oauth2/consent'].includes(path)){
   // Provider response boundary: only the exact error enum leaves this call.
   try{options.onOAuthError(reconnectRedirectError(response.headers.get('location')));}catch{}
  }
  if(options.allowedScopes&&path.includes('/.well-known/oauth-authorization-server')&&response.ok){
   const body=z.record(z.unknown()).parse(await response.json());
   const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.delete('content-length');
   return Response.json({...body,scopes_supported:[...options.allowedScopes()]},{status:response.status,headers});
  }
  return response;
 }
 async function verifyBearer(authorization?:string):Promise<Principal>{
  if(!resourceClient)throw Error('Bearer verification unavailable for session-only owner authentication');
  const match=/^Bearer ([^\s]+)$/i.exec(authorization??'');if(!match)throw Error('Bearer required');
  const response=await auth.handler(new Request(issuer+'/oauth2/introspect',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:match[1]!,client_id:resourceClient.client_id,client_secret:resourceClient.client_secret,token_type_hint:'access_token'})}));
  if(!response.ok)throw Error('Invalid token');const token=tokenSchema.parse(await response.json());
  if(token.sub!==options.ownerId()||token.iss!==issuer||token.exp<=Date.now()/1000||!(Array.isArray(token.aud)?token.aud:[token.aud]).includes(options.resource))throw Error('Invalid token claims');
  const scopes=new Set(token.scope.split(' '));
  if(options.accountStore){if(!token.account_id)throw Error('Account binding required');accountMetadata(token.sub,token.account_id);}
  return{subject:token.sub,scopes,clientId:token.client_id,expiresAt:token.exp*1000,...(token.account_id?{accountId:token.account_id}:{})};
 }
 const serializedPaths=new Set(['/icloud/auth/oauth2/token','/icloud/auth/oauth2/authorize','/icloud/auth/oauth2/continue','/icloud/auth/oauth2/consent','/icloud/admin/oauth-clients']);
 const handle=(request:Request,privateRoute:boolean)=>serializedPaths.has(new URL(request.url).pathname)?withOAuthMutation(options.database,()=>route(request,privateRoute)):route(request,privateRoute);
 return{publicHandler:(request:Request)=>handle(request,false),privateHandler:(request:Request)=>handle(request,true),verifyBearer,ownerSession:(headers:Headers)=>session(headers),enrollmentSession:(headers:Headers)=>session(headers,false)};
}
