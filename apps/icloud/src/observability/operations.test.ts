import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OperationMonitor,type OperationEvent} from './operations.js';
import {MailOperationError} from '../domain/mail.js';
test('operation events include only approved enums and never private input/output/error fields',async()=>{
 const events:OperationEvent[]=[];const monitor=new OperationMonitor(event=>{events.push(event);});const canary='PRIVATE_TOKEN_BODY_ADDRESS_MAILBOX';
 const result={status:'partial',items:[{status:'succeeded',target:{mailbox:canary,uid:123}},{status:'failed',message:canary}],subject:canary};
 assert.equal(await monitor.run('mail_batch',{action:{type:'organize',action:'trash'},body:canary},async()=>result),result);
 const error=new MailOperationError('unsupported_capability',canary);
 await assert.rejects(monitor.run(canary,{action:canary},async()=>{throw error;}),value=>value===error);
 const serialized=JSON.stringify(events);assert.equal(serialized.includes(canary),false);assert.equal(serialized.includes('"uid"'),false);
 const completed=events[1];assert.equal(completed?.event,'completed');
 if(completed?.event==='completed'){assert.equal(completed.outcome,'partial');assert.equal(completed.action,'trash');assert.deepEqual(completed.counts,{succeeded:1,failed:1,unknown:0,notAttempted:0});}
 const rejected=events[3];if(rejected?.event==='completed'){assert.equal(rejected.tool,'unknown');assert.equal(rejected.action,'unknown');assert.equal(rejected.outcome,'rejected');assert.equal(rejected.errorCode,'unsupported_capability');}
 assert.equal(events[0]?.correlationId,events[1]?.correlationId);assert.notEqual(events[0]?.correlationId,events[2]?.correlationId);
});
test('unknown outcomes and partial batch counts remain explicit without arbitrary error text',async()=>{
 const events:OperationEvent[]=[];const monitor=new OperationMonitor(event=>{events.push(event);});
 await monitor.run('mail_batch',{action:{type:'move'}},async()=>({status:'unknown',items:[{status:'succeeded'},{status:'outcome_unknown'},{status:'not_attempted'}],errorCode:'arbitrary_secret'}));
 const event=events[1];assert.equal(event?.event,'completed');if(event?.event==='completed'){assert.equal(event.outcome,'unknown');assert.equal(event.errorCode,undefined);assert.deepEqual(event.counts,{succeeded:1,failed:0,unknown:1,notAttempted:1});}
 await assert.rejects(monitor.run('mail_move',{},async()=>{throw new MailOperationError('outcome_unknown','Secret');}));
 const failed=events[3];if(failed?.event==='completed')assert.equal(failed.outcome,'unknown');
});
test('drain rejects new operations but tracks detached work until completion',async()=>{
 const monitor=new OperationMonitor(()=>{});let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});
 const running=monitor.run('mail_send',{},async()=>{await gate;return 'receipt';});assert.equal(monitor.activeCount,1);
 monitor.beginDrain();let idle=false;const waiting=monitor.waitForIdle().then(()=>{idle=true;});
 await assert.rejects(monitor.run('mail_read',{},async()=>{throw Error('must not start');}),{code:'upstream_failure'});
 await Promise.resolve();assert.equal(idle,false);assert.equal(monitor.activeCount,1);
 finish();assert.equal(await running,'receipt');await waiting;assert.equal(idle,true);assert.equal(monitor.activeCount,0);await monitor.waitForIdle();
});
test('throwing/rejecting sinks cannot change results or errors',async()=>{
 for(const sink of [()=>{throw Error('sink');},async()=>{throw Error('async sink');}]){
  const monitor=new OperationMonitor(sink);assert.equal(await monitor.run('mail_read',{},async()=>42),42);
  const error=Error('provider');await assert.rejects(monitor.run('mail_read',{},async()=>{throw error;}),value=>value===error);assert.equal(monitor.activeCount,0);
 }
});

test('actual create-draft tool maps to an allowlisted diagnostic action',async()=>{
 const events:OperationEvent[]=[];const monitor=new OperationMonitor(event=>{events.push(event);});
 await monitor.run('mail_draft_create',{subject:'private'},async()=>({status:'draft_saved'}));
 assert.equal(events[0]?.tool,'mail_draft_create');assert.equal(events[0]?.action,'draft');
});
