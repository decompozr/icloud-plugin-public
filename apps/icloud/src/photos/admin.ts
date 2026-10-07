import type {Database} from 'bun:sqlite';
import {z} from 'zod';
import type {OwnerSecretStore} from '../../../../modules/account/dist/index.js';
import type {AdminModule} from '../admin/handler.js';
import {PhotosError} from './contracts.js';
import type {PhotosPolicy} from './service.js';

const keys=['read','write','delete'] as const;
const policySchema=z.object({read:z.boolean(),write:z.boolean(),delete:z.boolean()}).strict().refine(policy=>(!policy.write||policy.read)&&(!policy.delete||policy.write),'Photos policy requires read before write and write before delete');
const disabled=():PhotosPolicy=>({read:false,write:false,delete:false});
const fields=[{id:'read',label:'Read Photos'},{id:'write',label:'Organize Photos'},{id:'delete',label:'Delete Photos'}] as const;
const parse=(value:unknown):PhotosPolicy=>{const result=policySchema.safeParse(value);if(!result.success)throw new PhotosError('invalid_input');return result.data;};

/** Global local-library policy: owner-bound, separate from accounts and OAuth grants. */
export function createPhotosAdmin(options:{database:Database;store:Pick<OwnerSecretStore,'ownerId'>;ceiling:PhotosPolicy}):{policy():PhotosPolicy;admin:AdminModule}{
 const ceiling=parse(options.ceiling),db=options.database;
 db.exec(`CREATE TABLE IF NOT EXISTS photos_admin_policy (
  owner TEXT PRIMARY KEY,
  readEnabled INTEGER NOT NULL CHECK(readEnabled IN (0,1)),
  writeEnabled INTEGER NOT NULL CHECK(writeEnabled IN (0,1) AND writeEnabled<=readEnabled),
  deleteEnabled INTEGER NOT NULL CHECK(deleteEnabled IN (0,1) AND deleteEnabled<=writeEnabled)
 )`);
 const put=(owner:string,value:PhotosPolicy)=>db.query('INSERT INTO photos_admin_policy VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET readEnabled=excluded.readEnabled,writeEnabled=excluded.writeEnabled,deleteEnabled=excluded.deleteEnabled').run(owner,Number(value.read),Number(value.write),Number(value.delete));
 const effective=(value:PhotosPolicy):PhotosPolicy=>{const read=ceiling.read&&value.read,write=read&&ceiling.write&&value.write;return{read,write,delete:write&&ceiling.delete&&value.delete};};
 function snapshot(owner:string):PhotosPolicy{
  const row=db.query<{readEnabled:number;writeEnabled:number;deleteEnabled:number},[string]>('SELECT readEnabled,writeEnabled,deleteEnabled FROM photos_admin_policy WHERE owner=?').get(owner);
  // New owner policies start disabled. Existing stored choices are preserved.
  if(!row){const initial=disabled();put(owner,initial);return initial;}
  if(keys.some(key=>![0,1].includes(row[`${key}Enabled` as keyof typeof row])))throw new PhotosError('policy_unavailable');
  const saved=parse({read:row.readEnabled===1,write:row.writeEnabled===1,delete:row.deleteEnabled===1}),next=effective(saved);
  // Persist restrictive ceiling changes so relaxing config never resurrects actions.
  if(keys.some(key=>saved[key]!==next[key]))put(owner,next);
  return next;
 }
 const policy=():PhotosPolicy=>{const owner=options.store.ownerId();return owner?db.transaction(()=>snapshot(owner)).immediate():disabled();};
 const updateCapabilities=async(next:Record<string,boolean>,confirm:boolean):Promise<Record<string,boolean>>=>{
  const value=parse(next);
  if(keys.some(key=>value[key]&&!ceiling[key]))throw new PhotosError('configured_capability_disabled');
  return db.transaction(()=>{
   const owner=options.store.ownerId();if(!owner)throw new PhotosError('forbidden');
   const previous=snapshot(owner);
   if(keys.some(key=>value[key]&&!previous[key])&&confirm!==true)throw new PhotosError('confirmation_required');
   if(options.store.ownerId()!==owner)throw new PhotosError('owner_changed');
   put(owner,value);return{...snapshot(owner)};
  }).immediate();
 };
 // Apply a restrictive configuration change at activation, retaining prior owner intent.
 policy();
 return{policy,admin:{id:'photos',title:'Photos',fields:fields.map(field=>({...field,available:ceiling[field.id]})),capabilities:()=>({...policy()}),updateCapabilities}};
}
