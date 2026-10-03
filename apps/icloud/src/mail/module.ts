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
 const capabilities=()=>operatorPolicy.snapshot();
 const scopes=()=>{const p=capabilities();return p.read?['mail.read',...(p.write?['mail.write']:[]),...(p.send?['mail.send']:[])]:[];};
 const provider=deps.provider??(credential=>new ICloudMailAdapter({user:credential.user,password:credential.appPassword}));
 const credentials=()=>{const owner=deps.store.ownerId();if(!owner)throw new MailOperationError('forbidden','Owner setup required');const bytes=deps.store.readSecret(owner);if(!bytes)throw new MailOperationError('forbidden','Mail credentials revoked');try{return credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));}finally{bytes.fill(0);}};
 const current=()=>{const owner=deps.store.ownerId();if(!owner)throw new MailOperationError('forbidden','Owner setup required');const bytes=deps.store.readSecret(owner);if(!bytes)throw new MailOperationError('forbidden','Mail credentials revoked');try{return provider(credentialSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))));}finally{bytes.fill(0);}};
 const gateway:MailGateway={withSession:run=>current().withSession(run),parse:source=>current().parse(source)};
 const mail=new MailService({allowWrites:settings.allow_writes},gateway,capabilities);
 const unsubscribe=new UnsubscribeService(mail,createUnsubscribeGateway({sendMail:input=>current().send(input)}),{get enabled(){const p=capabilities();return p.read&&p.write&&p.unsubscribe;}});
 const outboundProvider=()=>{const credential=credentials();return deps.outboundProvider?.(credential)??new ICloudOutboundAdapter({user:credential.user,password:credential.appPassword});};
 const ledger=new SqliteOutboundLedger(deps.authDatabase,deps.masterKey,()=>{const owner=deps.store.ownerId();if(!owner)throw new MailOperationError('forbidden','Owner setup required');credentials();return owner;});
 const outbound=new OutboundService({get allowRead(){return capabilities().read;},get allowSend(){const p=capabilities();return p.read&&p.send;},get allowWrites(){const p=capabilities();return p.read&&p.write;}},gateway,{compose:input=>{const p=outboundProvider();if(!p.compose)throw new Error("Compose unavailable");return p.compose(input);},send:input=>outboundProvider().send(input),draft:(input,mailbox)=>outboundProvider().draft(input,mailbox)},ledger);
 const config={user:'',password:'',get allowRead(){return capabilities().read;},get allowWrites(){const p=capabilities();return p.read&&p.write;},get allowSend(){const p=capabilities();return p.read&&p.send;},get allowUnsubscribe(){return capabilities().unsubscribe;},transport:'http' as const,host:settings.host,port:settings.public_port,publicUrl:settings.public_origin+'/icloud/mcp',issuer:settings.public_origin+'/icloud/auth',audience:settings.public_origin+'/icloud/mcp',jwksUrl:settings.public_origin+'/unused',get scopes(){return scopes();},allowedSubjects:[]};
 return {registration:{...mailRegistration(mail,config,unsubscribe,outbound,deps.monitor),dispose:async()=>ledger.dispose()},config,admin:{presentation:mailAdminPresentation,capabilities,updateCapabilities:async(next:Record<string,boolean>,confirm:boolean)=>operatorPolicy.update({read:next.read!,write:next.write!,send:next.send!,unsubscribe:next.unsubscribe!},confirm),validateCredential:async(credential:AppleCredential)=>{await provider(credential).withSession(session=>session.list());}}};
}
