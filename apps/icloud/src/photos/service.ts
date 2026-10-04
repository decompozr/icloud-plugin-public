import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {mutationSchema,PhotosError,type PhotosProvider,type Mutation} from './contracts.js';
export interface PhotosPolicy {read:boolean;write:boolean;delete:boolean}
interface Row {id:string;owner:string;mutation:string;snapshot:string;status:string;result:string|null;expires:number}
/** Durable single-use plans. Unknown writes are never automatically resubmitted. */
export class PhotosService {
 constructor(private readonly db:Database,private readonly provider:PhotosProvider,private readonly policy:()=>PhotosPolicy,private readonly owner:()=>string){
  db.exec(`CREATE TABLE IF NOT EXISTS photos_operations (id TEXT PRIMARY KEY,owner TEXT NOT NULL,mutation TEXT NOT NULL,snapshot TEXT NOT NULL,status TEXT NOT NULL,result TEXT,expires INTEGER NOT NULL)`);
 }
 private check(write=false,destructive=false){const p=this.policy();if(!p.read||write&&!p.write||destructive&&!p.delete)throw new PhotosError('forbidden');return this.owner();}
 async read(command:string,input:unknown){this.check();return this.provider.read(command,input);}
 async prepare(raw:unknown){const mutation=mutationSchema.parse(raw);const owner=this.check(true,mutation.action==='delete_assets');if(this.db.query("SELECT id FROM photos_operations WHERE owner=? AND mutation=? AND status IN ('executing','outcome_unknown') LIMIT 1").get(owner,JSON.stringify(mutation)))throw new PhotosError('unresolved_operation');const state=await this.provider.inspect(mutation);if(this.check(true,mutation.action==='delete_assets')!==owner)throw new PhotosError('owner_changed');
  const id=randomUUID(),expires=Date.now()+15*60*1000;
  this.db.query('INSERT INTO photos_operations (id,owner,mutation,snapshot,status,expires) VALUES (?,?,?,?,?,?)').run(id,owner,JSON.stringify(mutation),JSON.stringify(state),'prepared',expires);
  return {operationId:id,status:'prepared',expiresAt:new Date(expires).toISOString(),mutation,before:state,message:'Review exact assets and changes before calling apply with confirm=true.'};
 }
 status(id:string){const owner=this.check();const row=this.db.query('SELECT * FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as Row|null;if(!row)throw new PhotosError('operation_not_found');return {operationId:id,status:row.status==='executing'?'outcome_unknown':row.status,result:row.result?JSON.parse(row.result):null};}
 async apply(id:string,confirm:boolean,allowDelete=false){if(confirm!==true)throw new PhotosError('confirmation_required');const owner=this.check(true);const row=this.db.query('SELECT * FROM photos_operations WHERE id=? AND owner=?').get(id,owner) as Row|null;if(!row)throw new PhotosError('operation_not_found');
  const mutation=mutationSchema.parse(JSON.parse(row.mutation));if(mutation.action==='delete_assets'&&!allowDelete)throw new PhotosError('delete_scope_required');if(allowDelete&&mutation.action!=='delete_assets')throw new PhotosError('wrong_operation_type');this.check(true,mutation.action==='delete_assets');
  if(row.status!=='prepared')return this.status(id);
  if(row.expires<Date.now())throw new PhotosError('plan_expired');
  const claimed=this.db.query("UPDATE photos_operations SET status='executing' WHERE id=? AND owner=? AND status='prepared' AND NOT EXISTS (SELECT 1 FROM photos_operations WHERE status='executing')").run(id,owner);
  if(!claimed.changes){const current=this.status(id);if(current.status==='prepared')throw new PhotosError('another_operation_in_progress');return current;}
  let result:unknown;let status='outcome_unknown';
  try{
   this.check(true,mutation.action==='delete_assets');
   result=await this.provider.apply(mutation,JSON.parse(row.snapshot));
   status=(result as {status?:string})?.status==='applied'?'applied':(result as {status?:string})?.status==='stale_plan'?'rejected':'outcome_unknown';
  }catch(e){const code=e instanceof PhotosError?e.code:'provider_failed';status=['stale_plan','forbidden'].includes(code)?'rejected':'outcome_unknown';result={error:code};}
  this.db.query('UPDATE photos_operations SET status=?,result=? WHERE id=? AND owner=?').run(status,JSON.stringify(result),id,owner);
  return this.status(id);
 }
}
