import {Database} from 'bun:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {MailOperationError} from '../domain/mail.js';
import {outboundResultSchema,type OutboundResult,type OutboundLedger} from '../domain/outbound.js';
/** Owner-bound durable tombstones never expire into a fresh operation. */
export class SqliteOutboundLedger implements OutboundLedger {
 private readonly key:Buffer;
 constructor(private readonly database:Database,masterKey:Uint8Array,private readonly owner:()=>string){
  this.key=createHash('sha256').update(masterKey).update('outbound-ledger-v1').digest();
  database.exec('CREATE TABLE IF NOT EXISTS icloudOutbound(owner TEXT NOT NULL, operation TEXT NOT NULL, digest TEXT NOT NULL, messageId TEXT NOT NULL, receipt BLOB, PRIMARY KEY(owner,operation))');
 }
 claim(operationId:string,digest:string,messageId:string):{fresh:true}|{fresh:false;result:OutboundResult}{
  const owner=this.owner();
  return this.database.transaction(()=>{
   const found=this.database.query('SELECT digest,messageId,receipt FROM icloudOutbound WHERE owner=? AND operation=?').get(owner,operationId);
   if(found){
    const row=z.object({digest:z.string(),messageId:z.string(),receipt:z.instanceof(Uint8Array).nullable()}).parse(found);
    if(row.digest!==digest)throw new MailOperationError('invalid_input','Operation ID was already used with different input');
    if(!row.receipt)return{fresh:false as const,result:{operationId,messageId:row.messageId,status:'unknown' as const,replayed:true}};
    const value=Buffer.from(row.receipt),decipher=createDecipheriv('aes-256-gcm',this.key,value.subarray(0,12));
    decipher.setAAD(Buffer.from(owner+'\0'+operationId));decipher.setAuthTag(value.subarray(12,28));
    const plain=Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]);
    try{return{fresh:false as const,result:{...outboundResultSchema.parse(JSON.parse(plain.toString())),replayed:true}};}finally{plain.fill(0);}
   }
   this.database.query('INSERT INTO icloudOutbound(owner,operation,digest,messageId) VALUES(?,?,?,?)').run(owner,operationId,digest,messageId);
   return{fresh:true as const};
  }).immediate();
 }
 finish(operationId:string,result:OutboundResult):void{
  const owner=this.owner(),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);
  cipher.setAAD(Buffer.from(owner+'\0'+operationId));
  const plain=Buffer.from(JSON.stringify(outboundResultSchema.parse(result)));
  try{const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
   const changed=this.database.query('UPDATE icloudOutbound SET receipt=? WHERE owner=? AND operation=? AND receipt IS NULL').run(Buffer.concat([nonce,cipher.getAuthTag(),encrypted]),owner,operationId);
   if(changed.changes!==1)throw Error('Operation receipt already finalized or missing');
  }finally{plain.fill(0);}
 }
}
