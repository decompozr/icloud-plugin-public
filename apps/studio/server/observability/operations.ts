import {randomUUID} from 'node:crypto';
export type OperationOutcome='succeeded'|'rejected'|'partial'|'unknown'|'failed';
export interface OperationCounts {succeeded:number;failed:number;unknown:number;notAttempted:number}
export interface OperationSummary {outcome:OperationOutcome;errorCode?:string;counts?:OperationCounts}
export interface OperationClassifier {
 tools:readonly string[];actions:readonly string[];errorCodes:readonly string[];
 action(tool:string,input:unknown):string;result(result:unknown):OperationSummary;error(error:unknown):OperationSummary;
}
interface EventIdentity {correlationId:string;tool:string;action:string;activeCount:number}
export type OperationEvent=(EventIdentity&{event:'started'})|(EventIdentity&{event:'completed';durationMs:number}&OperationSummary);
export type OperationSink=(event:OperationEvent)=>void|Promise<void>;
export class ServiceDrainingError extends Error {readonly code='upstream_failure';constructor(){super('Service draining');}}
function bounded(summary:OperationSummary,classifier?:OperationClassifier):OperationSummary {
 const outcome=(['succeeded','rejected','partial','unknown','failed'] as const).find(value=>value===summary.outcome)??'unknown';
 const errorCode=classifier?.errorCodes.find(value=>value===summary.errorCode);
 const counts=summary.counts;
 const safeCounts=counts&&[counts.succeeded,counts.failed,counts.unknown,counts.notAttempted].every(value=>Number.isSafeInteger(value)&&value>=0)?{succeeded:counts.succeeded,failed:counts.failed,unknown:counts.unknown,notAttempted:counts.notAttempted}:undefined;
 return{outcome,...(errorCode?{errorCode}:{}),...(safeCounts?{counts:safeCounts}:{})};
}
/** Receives raw values only to select fixed enums/counts; never forwards or retains them. */
export class OperationMonitor {
 private active=0;private draining=false;private readonly idleWaiters=new Set<()=>void>();
 constructor(private readonly sink:OperationSink=event=>{console.info(JSON.stringify(event));}){}
 get activeCount():number{return this.active;}
 beginDrain():void{this.draining=true;}
 waitForIdle():Promise<void>{return this.active===0?Promise.resolve():new Promise(resolve=>this.idleWaiters.add(resolve));}
 private emit(event:OperationEvent):void{try{const pending=this.sink(event);if(pending)void Promise.resolve(pending).catch(()=>{});}catch{/* Logging must never change operation outcomes. */}}
 async run<T>(tool:string,input:unknown,operation:()=>Promise<T>,classifier?:OperationClassifier):Promise<T>{
  if(this.draining)throw new ServiceDrainingError();
  const identity={correlationId:randomUUID(),tool:classifier?.tools.find(name=>name===tool)??'unknown',action:'unknown'} satisfies Omit<EventIdentity,'activeCount'>;
  let action='unknown';try{const candidate=classifier?.action(identity.tool,input);action=classifier?.actions.find(value=>value===candidate)??'unknown';}catch{}const start=performance.now();this.active++;
  this.emit({...identity,action,event:'started',activeCount:this.active});
  let summary:OperationSummary={outcome:'unknown'};
  try{const result=await operation();try{summary=bounded(classifier?.result(result)??{outcome:'succeeded'},classifier);}catch{summary={outcome:'unknown'};}return result;}
  catch(error:unknown){try{summary=bounded(classifier?.error(error)??{outcome:'failed'},classifier);}catch{summary={outcome:'unknown'};}throw error;}
  finally{
   this.active--;this.emit({...identity,action,event:'completed',activeCount:this.active,durationMs:Math.max(0,Math.round(performance.now()-start)),...summary});
   if(this.active===0){for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear();}
  }
 }
}
