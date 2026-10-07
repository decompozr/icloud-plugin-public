import {HomeKitError} from './provider.js';
import {nativeEventResourceUri,type EventAddress} from './resources.js';
type Listener={updated:()=>void;failed:(error:HomeKitError)=>void};
/** Private provider subscriptions. Public account authorization stays in the module/host. */
export class EventSubscriptions {
 private readonly feeds=new Map<string,Set<Listener>>();private queue:Promise<unknown>=Promise.resolve();private closed=false;
 constructor(private readonly request:(method:'resources/subscribe'|'resources/unsubscribe',uri:string)=>Promise<unknown>,private readonly limit=32){}
 private serial<T>(operation:()=>Promise<T>):Promise<T>{const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
 async subscribe(address:EventAddress,listener:Listener):Promise<()=>Promise<void>>{
  const uri=nativeEventResourceUri({...address,after:0});const registration={...listener};
  await this.serial(async()=>{if(this.closed)throw new HomeKitError('provider_disposed');let feed=this.feeds.get(uri);if(!feed){if(this.feeds.size>=this.limit)throw new HomeKitError('event_subscription_limit');await this.request('resources/subscribe',uri);if(this.closed){await this.request('resources/unsubscribe',uri).catch(()=>{});throw new HomeKitError('provider_disposed');}feed=new Set();this.feeds.set(uri,feed);}if(feed.size>=this.limit)throw new HomeKitError('event_subscription_limit');feed.add(registration);});
  let removed=false;return async()=>{if(removed)return;removed=true;this.feeds.get(uri)?.delete(registration);await this.serial(async()=>{const feed=this.feeds.get(uri);if(!feed||feed.size)return;this.feeds.delete(uri);if(!this.closed)await this.request('resources/unsubscribe',uri);});};
 }
 updated(uri:string){if(this.closed)return;for(const listener of this.feeds.get(uri)??[])try{listener.updated();}catch{/* A consumer cannot disrupt provider framing. */}}
 fail(error:HomeKitError){if(this.closed)return;this.closed=true;for(const feed of this.feeds.values())for(const listener of feed)try{listener.failed(error);}catch{}this.feeds.clear();}
}
