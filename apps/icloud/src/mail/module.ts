import {serviceEligible} from '../accounts/capabilities.js';
import {invocationContext} from '../modules/context.js';
import {Database} from 'bun:sqlite';
import {z} from 'zod';
import {SqliteOperatorPolicy} from './storage/operator-policy.js';
import {SqliteOutboundLedger} from './storage/outbound-ledger.js';
import {ICloudMailAdapter} from './icloud/adapter.js';
import {ICloudOutboundAdapter} from './icloud/outbound.js';
import {createUnsubscribeGateway} from './icloud/unsubscribe.js';
import {MailService} from './services/mail.js';
import {UnsubscribeService} from './services/unsubscribe.js';
import {OutboundService} from './services/outbound.js';
import {MailOperationError,type MailGateway,type MailMessageInput,type SendResult} from './domain/mail.js';
import type {OutboundGateway} from './domain/outbound.js';
import type {OwnerSecretStore} from '../storage/owner-store.js';
import type {AppSettings} from '../server/settings.js';
import type {OperationMonitor} from '../observability/operations.js';
import {mailRegistration} from './mcp/tools.js';
import {mailAdminPresentation} from './admin.js';
export interface AppleCredential {user:string;appPassword:string}
export interface MailModuleDependencies {
 store:OwnerSecretStore;authDatabase:Database;masterKey:Uint8Array;monitor:OperationMonitor;
 provider?:(credential:AppleCredential)=>MailGateway&{send(input:MailMessageInput):Promise<SendResult>};
 outboundProvider?:(credential:AppleCredential)=>OutboundGateway;
}
const credentialSchema=z.object({user:z.string().email(),appPassword:z.string().min(1)}).strict();
export function createMailModule(settings:AppSettings,deps:MailModuleDependencies){
 const operatorPolicy=new SqliteOperatorPolicy(deps.authDatabase,{read:true,write:settings.allow_writes,send:settings.allow_send,unsubscribe:settings.allow_writes});
 const capabilities=()=>{const policy=operatorPolicy.snapshot(),context=invocationContext();if(context?.accountId){const metadata=deps.store.account?.(context.ownerId,context.accountId);if(metadata?.services&&!serviceEligible(metadata,'mail'))return {read:false,write:false,send:false,unsubscribe:false};}return policy;};
 const scopes=()=>{const p=capabilities();return p.read?['mail.read',...(p.write?['mail.write']:[]),...(p.send?['mail.send']:[])]:[];};
 const provider=deps.provider??(credential=>new ICloudMailAdapter({user:credential.user,password:credential.appPassword}));
 // Only deliberately unscoped legacy fixtures may omit the account-store API.
 const accountStore:Partial<Pick<OwnerSecretStore,'account'|'legacyAccountId'|'readAccountSecret'>>=deps.store;
 const selected=()=>{
  const context=invocationContext(),owner=deps.store.ownerId();
  if(!owner||context&&context.ownerId!==owner)throw new MailOperationError('forbidden','Owner authorization required');
  // Production HTTP always supplies a context. The runtime validates account selection against the verified token grant.
  if(context&&(!context.accountId||!accountStore.account||!accountStore.readAccountSecret||!accountStore.legacyAccountId))throw new MailOperationError('forbidden','Account-bound authorization required');
  const legacy=accountStore.legacyAccountId?.(owner)??null;
  const id=context?.accountId??legacy??(!accountStore.account?'legacy':null);
  if(!id)throw new MailOperationError('forbidden','Account authorization required');
  const metadata=accountStore.account?.(owner,id);
  if(accountStore.account&&(!metadata||!metadata.credentialStored||(metadata.services&&!serviceEligible(metadata,'mail'))))throw new MailOperationError('forbidden','Mail account unavailable');
  return{owner,id,legacy:id===legacy||!accountStore.account,metadata};
 };
 const credentials=()=>{const account=selected();const bytes=accountStore.readAccountSecret?accountStore.readAccountSecret(account.owner,account.id):deps.store.readSecret(account.owner);if(!bytes)throw new MailOperationError('forbidden','Mail credentials revoked');try{return credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));}finally{bytes.fill(0);}};
 const current=()=>provider(credentials());
 const identity={
  bind(input:unknown){const account=selected();const visit=(value:unknown):void=>{if(Array.isArray(value)){for(const item of value)visit(item);return;}if(!value||typeof value!=='object')return;const object=value as Record<string,unknown>;if(typeof object.mailbox==='string'&&typeof object.uidValidity==='string'){
   if(object.accountId!==account.id&&!(object.accountId===undefined&&account.legacy))throw new MailOperationError('stale_identity','Message reference belongs to another account; search again');
  }for(const child of Object.values(object))visit(child);};visit(input);
   // Result identity is fixed at admission; annotating an observed outcome cannot revoke it.
   const accountId=account.id;
   const annotate=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(annotate);if(!value||typeof value!=='object')return value;const object=Object.fromEntries(Object.entries(value).map(([key,child])=>[key,annotate(child)]));if(typeof object.mailbox==='string'&&typeof object.uidValidity==='string')object.accountId=accountId;return object;};
   return annotate;
  },
  profile(){const account=selected();const email=account.metadata?.user??credentials().user;return{id:account.id,name:account.metadata?.label??email,email};}
 };
 const gateway:MailGateway={withSession:run=>current().withSession(run),parse:source=>current().parse(source)};
 const mail=new MailService({allowWrites:settings.allow_writes},gateway,()=>{selected();return capabilities();});
 const unsubscribe=new UnsubscribeService(mail,createUnsubscribeGateway({sendMail:input=>current().send(input)}),{get enabled(){const p=capabilities();return p.read&&p.write&&p.unsubscribe;}});
 const outboundProvider=()=>{const credential=credentials();return deps.outboundProvider?.(credential)??new ICloudOutboundAdapter({user:credential.user,password:credential.appPassword});};
 const ledger=new SqliteOutboundLedger(deps.authDatabase,deps.masterKey,()=>{const account=selected();credentials();return account.legacy?account.owner:JSON.stringify([account.owner,account.id]);});
 const outbound=new OutboundService({get allowRead(){return capabilities().read;},get allowSend(){const p=capabilities();return p.read&&p.send;},get allowWrites(){const p=capabilities();return p.read&&p.write;}},gateway,{compose:input=>{const p=outboundProvider();if(!p.compose)throw new Error("Compose unavailable");return p.compose(input);},send:input=>outboundProvider().send(input),draft:(input,mailbox)=>outboundProvider().draft(input,mailbox)},ledger,()=>{const account=selected();return account.legacy?'':account.id;});
 const config={user:'',password:'',get allowRead(){return capabilities().read;},get allowWrites(){const p=capabilities();return p.read&&p.write;},get allowSend(){const p=capabilities();return p.read&&p.send;},get allowUnsubscribe(){return capabilities().unsubscribe;},transport:'http' as const,host:settings.host,port:settings.public_port,publicUrl:settings.public_origin+'/icloud/mcp',issuer:settings.public_origin+'/icloud/auth',audience:settings.public_origin+'/icloud/mcp',jwksUrl:settings.public_origin+'/unused',get scopes(){return scopes();},allowedSubjects:[]};
 return {registration:{...mailRegistration(mail,config,unsubscribe,outbound,deps.monitor,identity),dispose:async()=>ledger.dispose()},config,admin:{presentation:mailAdminPresentation,capabilities,updateCapabilities:async(next:Record<string,boolean>,confirm:boolean)=>operatorPolicy.update({read:next.read!,write:next.write!,send:next.send!,unsubscribe:next.unsubscribe!},confirm),validateCredential:async(credential:AppleCredential)=>{await provider(credential).withSession(session=>session.list());}}};
}
