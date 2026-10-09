import {z} from 'zod';

// Source-derived request contracts only. Not registered or dispatched until
// reviewed plans, ownership checks, ledger recovery and readback are integrated.
// Reference: Apple's public Photos 2636Build18 management request builders.
const uuid=z.string().uuid();
const token=z.string().min(1).max(512).refine(value=>!/[\x00-\x1f\x7f]/.test(value));
const unique=<T>(values:T[])=>new Set(values).size===values.length;
export const sharedManagementIntent=z.discriminatedUnion('action',[
 z.object({action:z.literal('set_contributions'),albumGuid:uuid,currentName:z.string().min(1).max(200),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('set_public_access'),albumGuid:uuid,enabled:z.boolean()}).strict(),
 z.object({action:z.literal('invite_participants'),albumGuid:uuid,invitations:z.array(z.object({invitationGuid:uuid,email:z.string().email().max(320)}).strict()).min(1).max(20).refine(items=>unique(items.map(i=>i.invitationGuid.toLowerCase()))&&unique(items.map(i=>i.email.toLowerCase())))}).strict(),
 z.object({action:z.literal('remove_participant'),albumGuid:uuid,invitationGuid:token}).strict(),
 z.object({action:z.literal('remove_shared_assets'),albumGuid:uuid,assetGuids:z.array(token).min(1).max(100).refine(unique)}).strict(),
]);
export function sharedManagementRequest(raw:unknown,serverContext:{clientOrgKey?:string}={}){
 const intent=sharedManagementIntent.parse(raw);
 const context=z.object({clientOrgKey:token.optional()}).strict().parse(serverContext);
 const common={albumguid:intent.albumGuid,...context};
 switch(intent.action){
  case 'set_contributions':return {endpoint:'updatealbum',payload:{...common,attributes:{name:intent.currentName,allowcontributions:intent.enabled?'1':'0'}},route:'owner_dsid',mayNotify:false} as const;
  case 'set_public_access':return {endpoint:'setalbumpublic',payload:{...common,ispublic:intent.enabled?'1':'0'},route:'owner_dsid',mayNotify:false} as const;
  case 'invite_participants':return {endpoint:'share',payload:{...common,invitations:intent.invitations.map(i=>({email:i.email,invitationguid:i.invitationGuid}))},route:'owner_dsid',mayNotify:true} as const;
  case 'remove_participant':return {endpoint:'unshare',payload:{...common,invitations:[intent.invitationGuid]},route:'owner_dsid',mayNotify:true} as const;
  case 'remove_shared_assets':return {endpoint:'deleteassets',payload:{...common,assets:intent.assetGuids},route:'album_location',mayNotify:false} as const;
 }
}
