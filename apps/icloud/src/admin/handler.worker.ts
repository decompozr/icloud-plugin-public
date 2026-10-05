import {mailAdminPresentation} from '../mail/admin.js';
import { createPrivateAdmin } from './handler.js';
import { SqliteOwnerStore } from '../storage/owner-store.js';
import { z } from 'zod';
const input=z.object({databasePath:z.string(),markerPath:z.string(),masterKey:z.string(),bootstrapProof:z.string(),ready:z.boolean(),seedAccount:z.boolean().optional()}).parse(JSON.parse(await Bun.stdin.text()) as unknown);
const store=SqliteOwnerStore.provision({...input,masterKey:Buffer.from(input.masterKey,'hex')});
if(input.seedAccount){store.enroll({proof:input.bootstrapProof,ownerId:'owner'});store.addAccount('owner',{user:'owner@example.invalid',label:'Personal',credential:Buffer.from(JSON.stringify({user:'owner@example.invalid',appPassword:'dummy-secret'}))});}
const session=async(headers:Headers)=>{const id=headers.get('x-fixture-session');if(!id)throw Error();return{user:{id}};};
let policy:Record<string,boolean>={read:true,write:true,send:false,unsubscribe:false};
let calendarPolicy:Record<string,boolean>={read:false,write:false,schedule:false,share:false};
let handler:(request:Request)=>Promise<Response>;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:request=>handler(request)});
handler=createPrivateAdmin({modules:[{id:'calendar',title:'Calendar',fields:[],capabilities:()=>calendarPolicy,updateCapabilities:async next=>{calendarPolicy=next;return next;}}],presentation:mailAdminPresentation,privateOrigin:server.url.origin,store,capabilities:()=>policy,updateCapabilities:async next=>{policy=next;return policy;},ownerAuth:{ownerSession:session,enrollmentSession:session},diagnostics:async()=>({installed:input.ready,authenticated:input.ready,online:input.ready,privateReachable:input.ready}),validateCredential:async credential=>{if(credential.appPassword==='invalid-dummy')throw Error('Never return provider detail');}});
console.log(server.url.origin);
