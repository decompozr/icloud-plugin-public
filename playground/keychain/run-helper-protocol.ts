import {randomBytes,randomUUID} from 'node:crypto';
import {accountCustodyIdentitySchema,accountPasswordSelector,installationIdentitySchema,masterKeySelector} from '../../apps/icloud/src/storage/custody-contract.js';

// Synthetic transport experiment, not a native backend or production protocol.
const limit=65536;
type Header={version:1;requestId:string;action:'read'|'add'|'delete';kind:'master'|'password';installationId:string;interaction:'prohibited'|'setup';ownerId?:string;accountId?:string;revision?:number;generation?:number};
function frame(header:object,payload:Uint8Array=new Uint8Array()):Buffer {
 const json=Buffer.from(JSON.stringify(header)),length=Buffer.alloc(8);length.writeUInt32BE(json.length);length.writeUInt32BE(payload.length,4);
 return Buffer.concat([length,json,payload]);
}
function frames(bytes:Buffer):{header:Record<string,unknown>;payload:Buffer}[] {
 const result:{header:Record<string,unknown>;payload:Buffer}[]=[];let offset=0;
 if(bytes.length>262144)throw Error('invalid_frame');
 try{
  while(offset<bytes.length){
   if(result.length>=16||bytes.length-offset<8)throw Error('invalid_frame');
   const headerLength=bytes.readUInt32BE(offset),payloadLength=bytes.readUInt32BE(offset+4);offset+=8;
   if(!headerLength||headerLength>4096||payloadLength>limit||headerLength+payloadLength>bytes.length-offset)throw Error('invalid_frame');
   const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,offset+headerLength)));
   if(!header||typeof header!=='object'||Array.isArray(header))throw Error('invalid_frame');offset+=headerLength;
   const payload=Buffer.from(bytes.subarray(offset,offset+payloadLength));offset+=payloadLength;result.push({header,payload});
  }return result;
 }catch{for(const item of result)item.payload.fill(0);throw Error('invalid_frame');}
}
function selector(header:Record<string,unknown>,payload:Buffer):string {
 const allowed=['version','requestId','action','kind','installationId','interaction',...(header.kind==='password'?['ownerId','accountId','revision','generation']:[])];
 if(Object.keys(header).some(key=>!allowed.includes(key))||header.version!==1||!installationIdentitySchema.safeParse(header.requestId).success||typeof header.installationId!=='string'||typeof header.action!=='string'||typeof header.kind!=='string'||!['read','add','delete'].includes(header.action)||!['master','password'].includes(header.kind))throw Error('invalid_input');
 if(header.action!=='add'&&(payload.length||header.interaction!=='prohibited')||header.action==='add'&&(typeof header.interaction!=='string'||!['setup','prohibited'].includes(header.interaction)))throw Error('invalid_input');
 if(header.action==='add'&&(header.kind==='master'?payload.length!==32:!payload.length))throw Error('invalid_input');
 if(header.kind==='master')return masterKeySelector(header.installationId).account;
 const identity=accountCustodyIdentitySchema.parse({installationId:header.installationId,ownerId:header.ownerId,accountId:header.accountId,revision:header.revision,generation:header.generation});
 return accountPasswordSelector(identity).account;
}
async function fixture(){
 if(process.env.ICLOUD_PROTOCOL_PARENT_SENTINEL)throw Error('inherited_parent_environment');
 const input=Buffer.from(await new Response(Bun.stdin.stream()).arrayBuffer()),items=new Map<string,Buffer>(),responses:Buffer[]=[];
 try{
  for(const request of frames(input)){
   let output:Buffer|undefined;
   try{
    const key=selector(request.header,request.payload),existing=items.get(key);
    if(request.header.action==='add'){if(existing)throw Error('conflict');items.set(key,Buffer.from(request.payload));}
    else if(!existing)throw Error('missing');
    else if(request.header.action==='delete'){existing.fill(0);items.delete(key);}
    else output=Buffer.from(existing);
    responses.push(frame({version:1,requestId:request.header.requestId,status:'ok'},output));
   }catch(error){responses.push(frame({version:1,requestId:request.header.requestId,status:'error',code:error instanceof Error&&['missing','conflict'].includes(error.message)?error.message:'invalid_input'}));}
   finally{request.payload.fill(0);output?.fill(0);}
  }
  for(const response of responses)await Bun.write(Bun.stdout,response);
 }finally{input.fill(0);for(const item of items.values())item.fill(0);for(const response of responses)response.fill(0);}
}
if(process.argv[2]==='--fixture')await fixture();
else{
 const installationId=randomUUID(),master=randomBytes(32),password=Buffer.from('synthetic-'+randomUUID());
 const masterHeader={version:1,kind:'master',installationId,interaction:'prohibited'} as const;
 const passwordHeader={version:1,kind:'password',installationId,ownerId:'synthetic-owner',accountId:randomUUID(),revision:1,generation:1,interaction:'prohibited'} as const;
 const requests:{header:Header;payload:Buffer}[]=[];
 const add=(base:typeof masterHeader|typeof passwordHeader,action:Header['action'],payload=Buffer.alloc(0),extra:object={})=>{requests.push({header:{...base,requestId:randomUUID(),action,...extra},payload});};
 add(masterHeader,'add',master);add(masterHeader,'read');add(passwordHeader,'add',password);add(passwordHeader,'read');
 add(passwordHeader,'read',undefined,{accountId:randomUUID()});add(passwordHeader,'add',password);
 add(masterHeader,'read',undefined,{interaction:'setup'});add(masterHeader,'read',undefined,{service:'unowned-service'});
 add(masterHeader,'read',undefined,{action:['read']});add(masterHeader,'read',undefined,{installationId:[installationId]});
 add(masterHeader,'delete');add(masterHeader,'read');add(passwordHeader,'read');
 const input=Buffer.concat(requests.map(request=>frame(request.header,request.payload)));let output:Buffer|undefined;
 try{
  const args=[process.execPath,import.meta.path,'--fixture'];
  if(args.some(value=>value.includes(password.toString('utf8'))))throw Error('secret_in_argv');
  const previous=process.env.ICLOUD_PROTOCOL_PARENT_SENTINEL;process.env.ICLOUD_PROTOCOL_PARENT_SENTINEL='synthetic-parent-only';
  const child=(()=>{try{return Bun.spawn(args,{stdin:new Blob([input]),stdout:'pipe',stderr:'pipe',env:{PATH:'/usr/bin:/bin'}});}
   finally{if(previous===undefined)delete process.env.ICLOUD_PROTOCOL_PARENT_SENTINEL;else process.env.ICLOUD_PROTOCOL_PARENT_SENTINEL=previous;}})();
  const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text(),child.exited]);output=Buffer.from(stdout);
  if(exit!==0||stderr)throw Error('fixture_process_failed');
  const replies=frames(output),expected=['ok','ok','ok','ok','missing','conflict','invalid_input','invalid_input','invalid_input','invalid_input','ok','missing','ok'];
  try{
   if(replies.length!==requests.length)throw Error('response_count');
   replies.forEach((reply,index)=>{if(reply.header.version!==1||reply.header.requestId!==requests[index]!.header.requestId||(reply.header.status==='ok'?'ok':reply.header.code)!==expected[index])throw Error('response_binding');});
   if(!replies[1]!.payload.equals(master)||!replies[3]!.payload.equals(password)||!replies[12]!.payload.equals(password))throw Error('secret_bytes_or_account_isolation');
   for(const malformed of [output.subarray(0,7),output.subarray(0,output.length-1),Buffer.from([0xff,0xff,0xff,0xff,0,0,0,0])]){
    let rejected=false;try{for(const item of frames(malformed))item.payload.fill(0);}catch{rejected=true;}if(!rejected)throw Error('accepted_malformed_frame');
   }
   process.stdout.write(JSON.stringify({experiment:'official-bun-scoped-helper-protocol',bun:Bun.version,requests:requests.length,checks:['raw_master_and_password_bytes','request_binding','missing_without_account_fallback','create_only_conflict','noninteractive_reads','fixed_selectors','exact_deletion','malformed_frames','no_secret_argv_or_inherited_environment'],passed:true,k0Passed:false,backend:'synthetic_memory',nativeOperations:0})+'\n');
  }finally{for(const reply of replies)reply.payload.fill(0);}
 }finally{input.fill(0);output?.fill(0);master.fill(0);password.fill(0);}
}
