import {randomUUID} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {z} from 'zod';
import {CustodyError,installationIdentitySchema,accountCustodyIdentitySchema,type AccountCustodyIdentity,type CustodyFailureCode,type MasterKeyCustody,type AccountPasswordCustody,type CustodyProvisioning} from './custody-contract.js';

const headerLimit=4096,payloadLimit=65536,outputLimit=8+headerLimit+payloadLimit;
const response=z.union([
 z.object({version:z.literal(1),requestId:z.string().uuid(),status:z.literal('ok')}).strict(),
 z.object({version:z.literal(1),requestId:z.string().uuid(),status:z.literal('error'),code:z.enum(['invalid_input','locked','denied','missing','conflict','recovery_required','outcome_unknown'])}).strict(),
]);
type RequestHeader={version:1;requestId:string;action:'read'|'add'|'delete';kind:'master'|'password';installationId:string;interaction:'setup'|'prohibited';ownerId?:string;accountId?:string;revision?:number;generation?:number};
class DeclaredFailure extends Error {constructor(readonly code:CustodyFailureCode){super(code);}}

async function collect(stream:ReadableStream<Uint8Array>,maximum:number,retain:boolean,signal:AbortSignal):Promise<Buffer> {
 const reader=stream.getReader(),chunks:Buffer[]=[];let length=0;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel);
 try{
  while(true){
   const item=await reader.read();if(signal.aborted){item.value?.fill(0);throw Error('aborted');}if(item.done)break;
   try{length+=item.value.length;if(length>maximum)throw Error('output_limit');if(retain)chunks.push(Buffer.from(item.value));}
   finally{item.value.fill(0);}
  }
  if(!retain&&length)throw Error('diagnostic_output');
  return retain?Buffer.concat(chunks):Buffer.alloc(0);
 }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();for(const chunk of chunks)chunk.fill(0);}
}

/** Inactive official-Bun transport for a trusted, installation-scoped helper.
 * Constructor command is release/operator configuration, never request data.
 * Caller qualifies native signing/access policy and authenticates administrative
 * owner/account/maintenance operations. This is local-user trust, not app-only
 * caller proof. No production factory selects a native backend here.
 */
export class CustodyHelper implements CustodyProvisioning {
 private command:readonly string[];
 private installationId:string;
 private timeoutMs:number;
 readonly master:MasterKeyCustody;
 readonly passwords:AccountPasswordCustody;
 constructor(options:{installationId:string;command:readonly string[];timeoutMs?:number}){
  const installation=installationIdentitySchema.safeParse(options.installationId),timeout=options.timeoutMs??5000;
  if(!installation.success||!options.command.length||!isAbsolute(options.command[0]!)||options.command.some(value=>typeof value!=='string'||!value||value.includes('\0'))||!Number.isInteger(timeout)||timeout<10||timeout>30000)throw new CustodyError('invalid_input');
  this.installationId=installation.data;this.command=Object.freeze([...options.command]);this.timeoutMs=timeout;
  this.master={read:async(id,opts)=>this.exchange(this.header('master','read',id,opts.interaction))};
  this.passwords={read:async(id,opts)=>this.exchange(this.header('password','read',id,opts.interaction))};
 }
 private header(kind:'master'|'password',action:RequestHeader['action'],identity:string|AccountCustodyIdentity,interaction:unknown):RequestHeader {
  if(action==='add'?!z.enum(['setup','prohibited']).safeParse(interaction).success:interaction!=='prohibited')throw new CustodyError('invalid_input');
  const parsed=kind==='master'?installationIdentitySchema.safeParse(identity):accountCustodyIdentitySchema.safeParse(identity);
  if(!parsed.success)throw new CustodyError('invalid_input');
  const fields=typeof parsed.data==='string'?{installationId:parsed.data}:parsed.data;
  if(fields.installationId!==this.installationId)throw new CustodyError('conflict');
  return{version:1,requestId:randomUUID(),action,kind,...fields,interaction:interaction as RequestHeader['interaction']};
 }
 private async exchange(header:RequestHeader,borrowed?:Uint8Array):Promise<Buffer> {
  let input:Buffer|undefined,output:Buffer|undefined,child:ReturnType<typeof spawn>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const signal=new AbortController(),tasks:Promise<unknown>[]=[];const mutating=header.action!=='read';
  try{
   if(header.action==='add'){
    if(!borrowed||header.kind==='master'&&borrowed.length!==32||header.kind==='password'&&(!borrowed.length||borrowed.length>payloadLimit))throw new CustodyError('invalid_input');
    if(header.kind==='password')try{new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(borrowed);}catch{throw new CustodyError('invalid_input');}
   }
   const metadata=Buffer.from(JSON.stringify(header));if(metadata.length>headerLimit)throw new CustodyError('invalid_input');
   const prefix=Buffer.alloc(8);prefix.writeUInt32BE(metadata.length);prefix.writeUInt32BE(borrowed?.length??0,4);input=Buffer.concat([prefix,metadata,...(borrowed?[borrowed]:[])]);
   child=spawn(this.command,input);
   const stdout=collect(child.stdout,outputLimit,true,signal.signal).then(bytes=>{output=bytes;});
   const stderr=collect(child.stderr,4096,false,signal.signal);
   tasks.push(stdout,stderr,child.exited);
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),this.timeoutMs);});
   await Promise.race([Promise.all(tasks),deadline]);
   if(child.exitCode!==0||!output||output.length<8)throw Error('process_failure');
   const headerLength=output.readUInt32BE(0),length=output.readUInt32BE(4);
   if(!headerLength||headerLength>headerLimit||length>payloadLimit||output.length!==8+headerLength+length)throw Error('invalid_frame');
   const reply=response.safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output.subarray(8,8+headerLength))));
   if(!reply.success||reply.data.requestId!==header.requestId)throw Error('invalid_response');
   if(reply.data.status==='error'){if(length)throw Error('error_payload');throw new DeclaredFailure(reply.data.code);}
   if(header.action==='read'?(header.kind==='master'?length!==32:length===0):length!==0)throw Error('invalid_payload');
   return Buffer.from(output.subarray(8+headerLength));
  }catch(error){
   if(error instanceof DeclaredFailure)throw new CustodyError(error.code);
   if(!child&&error instanceof CustodyError)throw error;
   throw new CustodyError(child&&mutating?'outcome_unknown':'recovery_required');
  }finally{
   if(timer)clearTimeout(timer);signal.abort();
   if(child){if(child.exitCode===null)try{child.kill('SIGKILL');}catch{/* May have become terminal. */}await child.exited;}
   await Promise.allSettled(tasks);input?.fill(0);output?.fill(0);
  }
 }
 async addMaster(id:string,bytes:Uint8Array,opts:{interaction:'setup'|'prohibited'}):Promise<void>{const result=await this.exchange(this.header('master','add',id,opts.interaction),bytes);result.fill(0);}
 async addPassword(id:AccountCustodyIdentity,bytes:Uint8Array,opts:{interaction:'setup'|'prohibited'}):Promise<void>{const result=await this.exchange(this.header('password','add',id,opts.interaction),bytes);result.fill(0);}
 async deleteMaster(id:string,opts:{interaction:'prohibited'}):Promise<void>{const result=await this.exchange(this.header('master','delete',id,opts.interaction));result.fill(0);}
 async deletePassword(id:AccountCustodyIdentity,opts:{interaction:'prohibited'}):Promise<void>{const result=await this.exchange(this.header('password','delete',id,opts.interaction));result.fill(0);}
}
function spawn(command:readonly string[],input:Buffer){return Bun.spawn([...command],{stdin:new Blob([Uint8Array.from(input)]),stdout:'pipe',stderr:'pipe',env:{PATH:'/usr/bin:/bin'}});}
