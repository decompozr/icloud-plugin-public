/** Explicit owner-consented, read-only production subscription acceptance. No device writes. */
import {booleanEventValue} from '../../src/helpers/homekit-events.js';
import {Client,StreamableHTTPClientTransport,auth,type OAuthClientProvider} from '@modelcontextprotocol/client';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const [endpoint,output]=process.argv.slice(2);if(!endpoint||!output)throw Error('Usage: subscriptions-listen.ts HTTPS_MCP_URL PRIVATE_OUTPUT');
const serverUrl=new URL(endpoint);if(serverUrl.protocol!=='https:')throw Error('Production HTTPS endpoint required');
process.umask(0o077);const root=resolve(output);await mkdir(root,{recursive:false,mode:0o700});
const target={homeId:'427613EC-700A-51EE-B497-A2B135E5D21B',accessoryId:'9EAA6E74-016C-5DA4-962C-A0000ACD208D',serviceId:'D35F95CC-1502-54A8-974A-BD30D7563551',characteristicId:'82CFFAF3-F105-5E92-AA23-C727ED855E7A'};
const state=randomUUID();let discovery:Awaited<ReturnType<NonNullable<OAuthClientProvider['discoveryState']>>>;
let verifier='',clientInfo:Awaited<ReturnType<OAuthClientProvider['clientInformation']>>,tokens:Awaited<ReturnType<OAuthClientProvider['tokens']>>;
let accept:(value:URLSearchParams)=>void=()=>{};const callback=new Promise<URLSearchParams>(resolve=>{accept=resolve;});
const listener=createServer((req,res)=>{const url=new URL(req.url??'/',`http://127.0.0.1`);if(req.method!=='GET'||url.pathname!=='/callback'||url.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid OAuth callback');return;}if(!url.searchParams.has('code')){res.writeHead(400);res.end('Authorization not completed');return;}res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});res.end('HomeKit read subscription authorized. Return to your agent.');accept(url.searchParams);});
listener.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listener.once('listening',resolve));const address=listener.address();if(!address||typeof address==='string')throw Error('Callback unavailable');const redirect=`http://127.0.0.1:${address.port}/callback`;
const provider:OAuthClientProvider={redirectUrl:redirect,clientMetadata:{client_name:'HomeKit subscription acceptance',redirect_uris:[redirect],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none',scope:'homekit.read',application_type:'native'},state:()=>state,saveDiscoveryState:value=>{discovery=value;},discoveryState:()=>discovery,clientInformation:()=>clientInfo,saveClientInformation:value=>{clientInfo=value;},tokens:()=>tokens,saveTokens:value=>{tokens=value;},saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>verifier,redirectToAuthorization:url=>{if(url.searchParams.get('scope')!=='homekit.read')throw Error('Unexpected scope expansion');console.log(JSON.stringify({phase:'owner_consent_required',url:url.href,scope:'homekit.read',tokensPersisted:false}));}};
const client=new Client({name:'homekit-subscription-acceptance',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
let subscription:Awaited<ReturnType<Client['listen']>>|undefined;
const deadline=(milliseconds:number)=>new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('Owner acceptance wait expired')),milliseconds);timer.unref();});
const save=async(name:string,value:unknown)=>writeFile(join(root,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
try{
 const started=await auth(provider,{serverUrl,scope:'homekit.read'});if(started==='REDIRECT'){const params=await Promise.race([callback,deadline(20*60*1000)]);await auth(provider,{serverUrl,scope:'homekit.read',authorizationCode:params.get('code')!,iss:params.get('iss')??undefined});}
 await new Promise<void>(resolve=>listener.close(()=>resolve()));
 if(!tokens?.access_token||tokens.scope?.split(' ').some(scope=>scope!=='homekit.read'))throw Error('Exact read-only consent required');
 await client.connect(new StreamableHTTPClientTransport(serverUrl,{authProvider:provider}));
 const templates=await client.listResourceTemplates();const selected=templates.resourceTemplates.filter(t=>t.uriTemplate.includes(`/events/${target.homeId}/`));if(selected.length!==1)throw Error('Exact enrolled Home template required');
 const uri=selected[0]!.uriTemplate.split('{?')[0]!.replace('{accessoryId}',target.accessoryId).replace('{serviceId}',target.serviceId).replace('{characteristicId}',target.characteristicId);
 const decode=(result:Awaited<ReturnType<Client['readResource']>>)=>{const first=result.contents[0];if(!first||!('text'in first))throw Error('Text event page required');return JSON.parse(first.text);};
 const baseline=decode(await client.readResource({uri}));if(baseline.gap||baseline.journalErrors)throw Error('Baseline event journal unavailable');let after=baseline.headSequence;
 const events:any[]=[];let signals=0,queue:Promise<void>=Promise.resolve(),complete:()=>void=()=>{},fail:(error:unknown)=>void=()=>{};
 const received=new Promise<void>((resolve,reject)=>{complete=resolve;fail=reject;});
 client.setNotificationHandler('notifications/resources/updated',notification=>{if(notification.params.uri!==uri){fail(Error('Foreign subscription notification'));return;}signals++;queue=queue.then(async()=>{const page=decode(await client.readResource({uri:`${uri}?after=${after}&session=${baseline.session}`}));if(page.session!==baseline.session||page.gap||page.journalErrors)throw Error('Event continuity gap');for(const event of page.events){if(Object.entries(target).some(([key,value])=>event[key]!==value)||event.sequence<=after)throw Error('Foreign or non-monotonic event');events.push(event);after=event.sequence;}await save('observed-events.json',{uri,session:baseline.session,signals,events});const on=events.findIndex(e=>booleanEventValue(e)===true);if(on>=0&&events.slice(on+1).some(e=>booleanEventValue(e)===false))complete();}).catch(fail);});
 subscription=await client.listen({resourceSubscriptions:[uri]});if(subscription.honoredFilter.resourceSubscriptions?.length!==1||subscription.honoredFilter.resourceSubscriptions[0]!==uri)throw Error('Requested feed not acknowledged');
 await save('subscription.json',{protocol:'2026-07-28',scope:'homekit.read',uri,honoredFilter:subscription.honoredFilter,session:baseline.session,after,physicalWrites:0,tokensPersisted:false});
 console.log(JSON.stringify({phase:'listening',target:'Office Light',ownerAction:'Use Apple Home or the physical switch: ON, pause, then OFF',physicalWritesByScript:0}));
 await Promise.race([received,deadline(4*60*1000),subscription.closed.then(reason=>{throw Error('Subscription ended before natural event acceptance: '+reason);})]);await queue;
 await subscription.close();await client.close();await save('summary.json',{status:'passed',protocol:'2026-07-28',genuineOwnerOAuth:true,scope:'homekit.read',naturalOnThenOffReceived:true,signals,eventCount:events.length,physicalWritesByScript:0,agentWakeVerified:false,claudeVerified:false,tokensPersisted:false});console.log(JSON.stringify({phase:'passed',signals,eventCount:events.length,physicalWritesByScript:0}));
}catch(error){await save('summary.json',{status:'incomplete',error:String(error),physicalWritesByScript:0,tokensPersisted:false});throw error;}
finally{await subscription?.close();await client.close();listener.close();tokens=undefined;clientInfo=undefined;verifier='';discovery=undefined;}
