import {Database} from 'bun:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {MailOperationError} from '../domain/mail.js';
import {outboundResultSchema,type OutboundResult,type OutboundLedger} from '../domain/outbound.js';
import {CustodyError} from '../../storage/custody-contract.js';

function openReceipt(key:Uint8Array,owner:string,operation:string,receipt:Uint8Array):OutboundResult {
 const value=Buffer.from(receipt),decipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));
 let partial:Buffer|undefined,final:Buffer|undefined,plain:Buffer|undefined;
 try{decipher.setAAD(Buffer.from(owner+'\0'+operation));decipher.setAuthTag(value.subarray(12,28));
  partial=decipher.update(value.subarray(28));final=decipher.final();plain=Buffer.concat([partial,final]);
  return outboundResultSchema.parse(JSON.parse(plain.toString()));
 }finally{partial?.fill(0);final?.fill(0);plain?.fill(0);}
}
/** Owner-bound durable tombstones never expire into a fresh operation. */
export class SqliteOutboundLedger implements OutboundLedger {
 /** Administrative existing-handle snapshot only. Inventory includes retained
  * account namespaces, not just currently connected accounts. Pending tombstones
  * have no ciphertext and therefore provide no key-authentication evidence. */
 static validateExistingReceipts(options:{database:Database;masterKey:Uint8Array;allowedOwnerNamespaces:readonly string[]}):Readonly<{format:1;records:number;encrypted:number;pending:number}> {
  let key:Buffer|undefined;
  try{
   if(options.masterKey.byteLength!==32||options.allowedOwnerNamespaces.some(value=>!value))throw new CustodyError('invalid_input');
   const owners=new Set(options.allowedOwnerNamespaces);key=createHash('sha256').update(options.masterKey).update('outbound-ledger-v1').digest();
   return options.database.transaction(()=>{
    let records=0,encrypted=0,pending=0;
    for(const raw of options.database.query('SELECT owner,operation,digest,messageId,receipt FROM icloudOutbound').all()){
     const row=z.object({owner:z.string().min(1),operation:z.string().min(1),digest:z.string().min(1),messageId:z.string().min(1),receipt:z.instanceof(Uint8Array).nullable()}).strict().parse(raw);
     if(!owners.has(row.owner))throw new CustodyError('recovery_required');
     if(row.receipt!==null){const receipt=openReceipt(key!,row.owner,row.operation,row.receipt);
      if(receipt.operationId!==row.operation||receipt.messageId!==row.messageId)throw new CustodyError('recovery_required');encrypted++;
     }else pending++;
     records++;
    }
    return Object.freeze({format:1 as const,records,encrypted,pending});
   })();
  }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
  finally{key?.fill(0);}
 }
 private readonly key:Buffer;
 private disposed=false;
 dispose():void{this.disposed=true;this.key.fill(0);}
 private ensureActive():void{if(this.disposed)throw Error('Outbound ledger disposed');}
 constructor(private readonly database:Database,masterKey:Uint8Array,private readonly owner:()=>string){
  this.key=createHash('sha256').update(masterKey).update('outbound-ledger-v1').digest();
  database.exec('CREATE TABLE IF NOT EXISTS icloudOutbound(owner TEXT NOT NULL, operation TEXT NOT NULL, digest TEXT NOT NULL, messageId TEXT NOT NULL, receipt BLOB, PRIMARY KEY(owner,operation))');
 }
 claim(operationId:string,digest:string,messageId:string):{fresh:true}|{fresh:false;result:OutboundResult}{
  this.ensureActive();const owner=this.owner();
  return this.database.transaction(()=>{
   const found=this.database.query('SELECT digest,messageId,receipt FROM icloudOutbound WHERE owner=? AND operation=?').get(owner,operationId);
   if(found){
    const row=z.object({digest:z.string(),messageId:z.string(),receipt:z.instanceof(Uint8Array).nullable()}).parse(found);
    if(row.digest!==digest)throw new MailOperationError('invalid_input','Operation ID was already used with different input');
    if(!row.receipt)return{fresh:false as const,result:{operationId,messageId:row.messageId,status:'unknown' as const,replayed:true}};
    return{fresh:false as const,result:{...openReceipt(this.key,owner,operationId,row.receipt),replayed:true}};
   }
   this.database.query('INSERT INTO icloudOutbound(owner,operation,digest,messageId) VALUES(?,?,?,?)').run(owner,operationId,digest,messageId);
   return{fresh:true as const};
  }).immediate();
 }
 finish(operationId:string,result:OutboundResult):void{
  this.ensureActive();const owner=this.owner(),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);
  cipher.setAAD(Buffer.from(owner+'\0'+operationId));
  const plain=Buffer.from(JSON.stringify(outboundResultSchema.parse(result)));
  try{const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
   const changed=this.database.query('UPDATE icloudOutbound SET receipt=? WHERE owner=? AND operation=? AND receipt IS NULL').run(Buffer.concat([nonce,cipher.getAuthTag(),encrypted]),owner,operationId);
   if(changed.changes!==1)throw Error('Operation receipt already finalized or missing');
  }finally{plain.fill(0);}
 }
}
