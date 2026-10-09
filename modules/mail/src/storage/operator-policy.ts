import {Database} from 'bun:sqlite';
import {z} from 'zod';
import {MailOperationError} from '../domain/mail.js';
export const capabilityPolicySchema=z.object({read:z.boolean(),write:z.boolean(),send:z.boolean(),unsubscribe:z.boolean()}).strict();
export type CapabilityPolicy=z.infer<typeof capabilityPolicySchema>;
const storedPolicy=z.object({readEnabled:z.number().int().min(0).max(1),writeEnabled:z.number().int().min(0).max(1),sendEnabled:z.number().int().min(0).max(1),unsubscribeEnabled:z.number().int().min(0).max(1)}).strict();
const capabilities=['read','write','send','unsubscribe'] as const;
function validate(value:unknown):CapabilityPolicy {
 const result=capabilityPolicySchema.safeParse(value);
 if(!result.success)throw new MailOperationError('invalid_input','Invalid capability policy');
 return result.data;
}
/** Local operator policy only. OAuth grants, credentials and tokens are not modified. */
export class SqliteOperatorPolicy {
 constructor(private readonly database:Database,initial:CapabilityPolicy){
  const seed=validate(initial);
  database.exec('CREATE TABLE IF NOT EXISTS icloudOperatorPolicy(singleton INTEGER PRIMARY KEY CHECK(singleton=1),readEnabled INTEGER NOT NULL CHECK(readEnabled IN (0,1)),writeEnabled INTEGER NOT NULL CHECK(writeEnabled IN (0,1)),sendEnabled INTEGER NOT NULL CHECK(sendEnabled IN (0,1)),unsubscribeEnabled INTEGER NOT NULL CHECK(unsubscribeEnabled IN (0,1)))');
  database.query('INSERT OR IGNORE INTO icloudOperatorPolicy(singleton,readEnabled,writeEnabled,sendEnabled,unsubscribeEnabled) VALUES(1,?,?,?,?)').run(Number(seed.read),Number(seed.write),Number(seed.send),Number(seed.unsubscribe));
 }
 snapshot():CapabilityPolicy {
  const row=storedPolicy.parse(this.database.query('SELECT readEnabled,writeEnabled,sendEnabled,unsubscribeEnabled FROM icloudOperatorPolicy WHERE singleton=1').get());
  return{read:row.readEnabled===1,write:row.writeEnabled===1,send:row.sendEnabled===1,unsubscribe:row.unsubscribeEnabled===1};
 }
 update(next:CapabilityPolicy,confirmEnable:boolean):CapabilityPolicy {
  const policy=validate(next);
  return this.database.transaction(()=>{
   const previous=this.snapshot();
   if(capabilities.some(capability=>!previous[capability]&&policy[capability])&&confirmEnable!==true)throw new MailOperationError('forbidden','Explicit confirmation is required to enable a capability');
   this.database.query('UPDATE icloudOperatorPolicy SET readEnabled=?,writeEnabled=?,sendEnabled=?,unsubscribeEnabled=? WHERE singleton=1').run(Number(policy.read),Number(policy.write),Number(policy.send),Number(policy.unsubscribe));
   return this.snapshot();
  }).immediate();
 }
}
