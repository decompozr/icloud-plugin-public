import {randomUUID} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import {invocationContext} from '../modules/context.js';
import {HomeKitError,type NativeHomeKitProvider} from './provider.js';
import {controlCommandSchema,controlReferenceSchema,controlApplySchema,parseControlPreview,controlResponseSchema,canonicalControl,type ControlIntent} from './control-contracts.js';
import {z} from 'zod';
interface ControlBinding {id:string;owner:string;account:string;home:string}
interface Dependencies {
 db:Database;
 bound:(home:string,scopes:ReadonlySet<string>)=>ControlBinding;
 unchanged:(binding:ControlBinding,scopes:ReadonlySet<string>)=>void;
 provider:(binding:ControlBinding)=>NativeHomeKitProvider;
 reconnect:(binding:ControlBinding,scopes:ReadonlySet<string>)=>Promise<unknown>;
 register:<T>(name:string,description:string,schema:z.ZodType<T>,run:(input:T,scopes:ReadonlySet<string>)=>Promise<unknown>,readOnly?:boolean)=>void;
}
interface Plan {id:string;binding:string;intent:string;state:string;result:string|null;expires:number}
/** Host reservations survive transport loss/restart. Never repeat provider I/O. */
export function registerHomeKitControls(d:Dependencies){
 d.db.exec(`CREATE TABLE IF NOT EXISTS homekit_control_plans(
 id TEXT PRIMARY KEY,owner TEXT NOT NULL,account TEXT NOT NULL,home TEXT NOT NULL,binding TEXT NOT NULL,
 operation TEXT NOT NULL,intent TEXT NOT NULL,state TEXT NOT NULL,result TEXT,expires INTEGER NOT NULL,
 UNIQUE(owner,account,home,operation));
 CREATE TABLE IF NOT EXISTS homekit_control_observations(id TEXT PRIMARY KEY,plan TEXT NOT NULL,observed INTEGER NOT NULL,observation TEXT NOT NULL);`);
 const check=async(b:ControlBinding,s:ReadonlySet<string>)=>{
  const context=invocationContext();if(context?.signal?.aborted)throw new HomeKitError('request_cancelled');
  await context?.authorize?.();d.unchanged(b,s);
  if(context?.signal?.aborted)throw new HomeKitError('request_cancelled');
 };
 const row=(b:ControlBinding,id:string)=>{
  const saved=d.db.query<Plan,[string,string,string,string]>('SELECT * FROM homekit_control_plans WHERE id=? AND owner=? AND account=? AND home=?').get(id,b.owner,b.account,b.home);
  if(!saved)throw new HomeKitError('plan_not_found');return saved;
 };
 const outcome=(p:Plan)=>p.result?JSON.parse(p.result):{planId:p.id,status:p.state==='executing'?'unknown':p.state,automaticRetry:false,physicalCompletionVerified:false};
 const save=(id:string,result:{status:string;[key:string]:unknown})=>{d.db.query('UPDATE homekit_control_plans SET state=?,result=? WHERE id=?').run(result.status,JSON.stringify(result),id);return result;};
 d.register('homekit_control_prepare','Review a bounded exact-ID physical control. No provider write. Only app-owned supported scenes/automations. Separate control consent required.',controlCommandSchema,async(input,scopes)=>{
  const b=d.bound(input.homeId,scopes);await check(b,scopes);
  // Reusing an operation ID never silently creates a second reviewed command.
  if(d.db.query('SELECT id FROM homekit_control_plans WHERE owner=? AND account=? AND home=? AND operation=?').get(b.owner,b.account,b.home,input.operationId))throw new HomeKitError('operation_already_exists');
  const preview=parseControlPreview(await d.provider(b).call('homekit_control_preview',input,invocationContext()?.signal),input);
  if(preview.homeId!==b.home||preview.operationId!==input.operationId)throw new HomeKitError('native_identity_mismatch');
  await check(b,scopes);const intent:ControlIntent={...input,expectedRevision:preview.revision},id=randomUUID();
  d.db.query('INSERT INTO homekit_control_plans VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,b.owner,b.account,b.home,b.id,input.operationId,JSON.stringify(intent),'prepared',null,Date.now()+300000);
  return{planId:id,intent,preview,requiresConfirmation:true,providerWriteAttempted:false,physicalCompletionVerified:false};
 },true);
 d.register('homekit_control_apply','Dispatch one reviewed control once. Requires literal confirmation and current binding/revision. Unknown/mismatch outcomes are retained without retry.',controlApplySchema,async(input,scopes)=>{
  const b=d.bound(input.homeId,scopes),p=row(b,input.planId);
  // Outcome reads after re-enrollment cannot dispatch the old binding's command.
  if(p.state!=='prepared')return outcome(p);
  if(p.binding!==b.id)throw new HomeKitError('binding_changed');
  if(p.expires<Date.now())throw new HomeKitError('plan_expired');
  const stored=JSON.parse(p.intent),command=controlCommandSchema.parse((({expectedRevision:_,...rest})=>rest)(stored));
  if(command.homeId!==b.home||!/^[a-f0-9]{64}$/.test(stored.expectedRevision))throw new HomeKitError('invalid_saved_intent');
  await check(b,scopes);if(p.expires<Date.now())throw new HomeKitError('plan_expired');
  const reserved=d.db.query("UPDATE homekit_control_plans SET state='executing' WHERE id=? AND state='prepared'").run(p.id);
  if(reserved.changes!==1)return outcome(row(b,p.id));
  // Intent/reservation committed before starting or sending to the provider.
  let native:unknown;
  try{
   await check(b,scopes);
   const response=controlResponseSchema.parse(await d.provider(b).call('homekit_control_apply',stored,invocationContext()?.signal,async()=>{await check(b,scopes);if(p.expires<Date.now())throw new HomeKitError('plan_expired');}));
   if(Buffer.byteLength(JSON.stringify(response))>65536)throw new HomeKitError('native_result_limit');native=response;
   const result=response.payload;
   if(result.operationId!==command.operationId||canonicalControl(result.intent)!==canonicalControl(stored)||result.physicalCompletionVerified!==false)throw new HomeKitError('native_identity_mismatch');
   await check(b,scopes);
   const mismatch=result.error==='READBACK_MISMATCH'||result.error==='AUTOMATION_STATE_MISMATCH';
   const status=mismatch?'mismatch':response.isError?(result.providerWriteAttempted===false?'rejected':'unknown'):result.writeAcknowledged===true?'acknowledged':'unknown';
   return save(p.id,{status,planId:p.id,native,automaticRetry:false,physicalCompletionVerified:false});
  }catch(error){return save(p.id,{status:'unknown',planId:p.id,error:error instanceof HomeKitError?error.code:'provider_failed',...(native?{native}:{}),automaticRetry:false,physicalCompletionVerified:false});}
 });
 d.register('homekit_control_reconnect','Explicitly reset the exact control transport after failure. Preserves plans/journals and never retries or undoes an operation.',z.object({homeId:z.string().uuid()}).strict(),async(input,scopes)=>{const b=d.bound(input.homeId,scopes);await check(b,scopes);const result=await d.reconnect(b,scopes);await check(b,scopes);return result;},true);
 d.register('homekit_control_cancel','Cancel only a still-prepared control. A dispatched or uncertain operation cannot be undone or retried.',controlReferenceSchema,async(input,scopes)=>{
  const b=d.bound(input.homeId,scopes);await check(b,scopes);const p=row(b,input.planId);
  if(p.state!=='prepared')return outcome(p);
  const result={status:'cancelled',planId:p.id,providerWriteAttempted:false,automaticRetry:false,physicalCompletionVerified:false};
  d.db.query("UPDATE homekit_control_plans SET state='cancelled',result=? WHERE id=? AND state='prepared'").run(JSON.stringify(result),p.id);
  return outcome(row(b,p.id));
 },true);
 d.register('homekit_control_operation','Read the retained control outcome for this owner/account/Home. Executing is unknown; no provider dispatch or automatic retry.',controlReferenceSchema,async(input,scopes)=>{const b=d.bound(input.homeId,scopes);await check(b,scopes);return outcome(row(b,input.planId));},true);
 d.register('homekit_control_reconcile','Add a current read-only target/revision observation to a retained outcome. Does not retry, undo or prove causal physical completion.',controlReferenceSchema,async(input,scopes)=>{
  const b=d.bound(input.homeId,scopes);await check(b,scopes);const p=row(b,input.planId),stored=JSON.parse(p.intent),{expectedRevision:_,...command}=stored;
  const provider=d.provider(b),signal=invocationContext()?.signal;
  const nativeOutcome=await provider.call('homekit_control_outcome',stored,signal);
  const journal=z.object({operationId:z.literal(command.operationId),homeId:z.literal(b.home),found:z.boolean(),result:z.record(z.unknown()).nullable(),providerWriteAttempted:z.literal(false)}).strict().parse(nativeOutcome);
  if(Buffer.byteLength(JSON.stringify(journal))>65536)throw new HomeKitError('native_result_limit');
  let targetObservation:unknown;
  try{
   targetObservation=parseControlPreview(await provider.call('homekit_control_preview',controlCommandSchema.parse(command),signal),controlCommandSchema.parse(command));
   if(command.action==='write'){
    const fresh=z.object({homeId:z.literal(b.home),accessoryId:z.literal(command.accessoryId),serviceId:z.literal(command.serviceId),characteristicId:z.literal(command.characteristicId),value:z.unknown(),valueSource:z.literal('fresh-read'),error:z.null()}).strict().parse(await provider.call('homekit_read',{homeId:b.home,accessoryId:command.accessoryId,serviceId:command.serviceId,characteristicId:command.characteristicId},signal));
    if(Buffer.byteLength(JSON.stringify(fresh))>65536)throw new HomeKitError('readback_size_limit');
    targetObservation={preview:targetObservation,freshRead:fresh};
   }
  }catch(error){targetObservation={unavailable:true,error:error instanceof HomeKitError?error.code:'readback_unavailable'};}
  await check(b,scopes);const observation={journal,target:targetObservation},observedAt=Date.now();
  d.db.query('INSERT INTO homekit_control_observations VALUES(?,?,?,?)').run(randomUUID(),p.id,observedAt,JSON.stringify(observation));
  return{...outcome(p),observation,observedAt,originalOutcomeUnchanged:true,causalCompletionVerified:false};
 },true);
}
