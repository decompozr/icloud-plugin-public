/** Bun-owned synthetic K0 probe. No Keychain, credentials or installed identities.
 * Native fixtures are needed for signed Security-framework identity controls.
 * Darwin recvmsg/SCM_RIGHTS is exercised directly through Bun FFI, not Python.
 */
import {dlopen,ptr} from 'bun:ffi';
import {chmodSync,copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Requires 64-bit macOS');
for(const tool of ['xcrun','codesign'])if(!Bun.which(tool))throw Error(`Existing dependency unavailable: ${tool}`);
const root=mkdtempSync(join(tmpdir(),'icloud-keychain-k0-peer.')),payload=join(root,'payload');
chmodSync(root,0o700);mkdirSync(payload,{mode:0o700});
const socketDirectory=mkdtempSync('/tmp/ic-peer-');chmodSync(socketDirectory,0o700);
const socketPath=join(socketDirectory,'probe.sock'),source=join(import.meta.dir,'PeerProbe.c');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['BUN_','NODE_','DYLD_','JSC_'].some(prefix=>key.startsWith(prefix))));
type FixtureProcess=Bun.Subprocess<'ignore','pipe','pipe'>;
const logs:unknown[]=[],children=new Set<FixtureProcess>();
const record={task:'dual-keychain-K0-peer-boundary',owner:'main-agent',status:'active',writers:[process.pid],artifacts:root,socket_directory:socketDirectory,
 scope:'Bun synthetic connection identity only; no credentials/Keychain/signing identities',knowledge_destination:'playground/keychain/peer-boundary.md',updated_at:'',transient_cleanup:''};
function save(){record.updated_at=new Date().toISOString();for(const [name,value] of [['record.json',record],['results.json',logs]] as const){const path=join(root,name);writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);}}
function spawn(argv:string[],extra:Record<string,string>={}){const child=Bun.spawn(argv,{cwd:payload,env:{...env,...extra},stdout:'pipe',stderr:'pipe',stdin:'ignore'});children.add(child);record.writers.push(child.pid);save();return child;}
async function collect(child:FixtureProcess,timeout=30000){
 let expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeout);
 try{const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  children.delete(child);record.writers=record.writers.filter(pid=>pid!==child.pid);save();return{exit,stdout,stderr,expired};
 }finally{clearTimeout(timer);}
}
async function run(name:string,argv:string[],expected=0,extra:Record<string,string>={}){const result=await collect(spawn(argv,extra));logs.push({case:name,...result});save();if(result.expired||result.exit!==expected)throw Error(`${name}: unexpected command termination; see ${root}/results.json`);return result;}
type Decision={result:'allowed'|'denied';reason:'ok'|'requirement'};
function decision(raw:string,allowed:boolean):Decision{
 const value=JSON.parse(raw),expected={result:allowed?'allowed':'denied',reason:allowed?'ok':'requirement'};
 if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='reason,result'||value.result!==expected.result||value.reason!==expected.reason)throw Error('Unexpected authorization output');
 return value;
}
async function client(name:string,argv:string[],allowed:boolean,extra:Record<string,string>={}){return decision((await run(name,argv,allowed?0:77,extra)).stdout,allowed);}
async function awaitSocket(path:string,child:FixtureProcess){const deadline=Date.now()+5000;while(!existsSync(path)){if(child.exitCode!==null||Date.now()>deadline)throw Error('Fixture did not bind before deadline');await Bun.sleep(20);}}
const libc=dlopen('/usr/lib/libSystem.B.dylib',{
 socket:{args:['i32','i32','i32'],returns:'i32'},bind:{args:['i32','ptr','u32'],returns:'i32'},listen:{args:['i32','i32'],returns:'i32'},
 accept:{args:['i32','ptr','ptr'],returns:'i32'},setsockopt:{args:['i32','i32','i32','ptr','u32'],returns:'i32'},
 recvmsg:{args:['i32','ptr','i32'],returns:'i64'},recv:{args:['i32','ptr','u64','i32'],returns:'i64'},send:{args:['i32','ptr','u64','i32'],returns:'i64'},close:{args:['i32'],returns:'i32'},
});
const c=libc.symbols;
function timeout(fd:number){const value=new Uint8Array(16);new DataView(value.buffer).setBigInt64(0,3n,true);for(const option of [0x1006,0x1005])if(c.setsockopt(fd,0xffff,option,ptr(value),value.length)!==0)throw Error('Unable to bound native socket wait');}
function send(fd:number,text:string){const bytes=Buffer.from(text);if(Number(c.send(fd,ptr(bytes),bytes.length,0))!==bytes.length)throw Error('Short fixture send');}
function receive(fd:number,limit=128){const bytes=new Uint8Array(limit),count=Number(c.recv(fd,ptr(bytes),bytes.length,0));if(count<=0)throw Error('Missing fixture reply');return Buffer.from(bytes.subarray(0,count)).toString();}
function receiveLine(fd:number){let result='';while(!result.endsWith('\n')){result+=receive(fd);if(Buffer.byteLength(result)>128)throw Error('Oversized fixture reply');}return result;}
async function delegated(approved:string,interleaved:boolean){
 const name=interleaved?'delegated-fd-interleaved':'delegated-fd-bun',path=join(socketDirectory,name+'.sock');
 const address=new Uint8Array(106),bytes=Buffer.from(path);if(bytes.length>=104)throw Error('Fixture path too long');address[0]=bytes.length+2;address[1]=1;address.set(bytes,2);
 const listener=c.socket(1,1,0);if(listener<0)throw Error('Unable to create listener');
 let donor:FixtureProcess|undefined,control=-1,peer=-1;
 try{
  timeout(listener);if(c.bind(listener,ptr(address),bytes.length+2)!==0||c.listen(listener,1)!==0)throw Error('Unable to bind FD transfer');
  donor=spawn([approved,socketPath,interleaved?'delegate-race':'delegate',path]);
  control=c.accept(listener,null,null);if(control<0)throw Error('Missing donor');timeout(control);
  const marker=new Uint8Array(1),vector=new Uint8Array(16),rights=new Uint8Array(16),message=new Uint8Array(48);
  const v=new DataView(vector.buffer),m=new DataView(message.buffer);
  v.setBigUint64(0,BigInt(ptr(marker)),true);v.setBigUint64(8,1n,true);
  m.setBigUint64(16,BigInt(ptr(vector)),true);m.setInt32(24,1,true);m.setBigUint64(32,BigInt(ptr(rights)),true);m.setUint32(40,16,true);
  if(Number(c.recvmsg(control,ptr(message),0))!==1||marker[0]!==70||m.getInt32(44,true)!==0||m.getUint32(40,true)!==16)throw Error('Invalid FD transfer');
  const r=new DataView(rights.buffer);
  if(r.getUint32(0,true)!==16||r.getInt32(4,true)!==0xffff||r.getInt32(8,true)!==1)throw Error('Invalid ancillary type');
  peer=r.getInt32(12,true);if(peer<0)throw Error('Invalid descriptor');timeout(peer);
  send(peer,interleaved?'deferred':'unapproved Bun recipient supplies request');
  if(interleaved){if(receiveLine(peer)!=='held\n')throw Error('Missing interleaving checkpoint');send(control,'K');}
  const observed=decision(receiveLine(peer),interleaved);send(control,'D');
  const terminal=await collect(donor,5000);if(terminal.expired||terminal.exit!==0||terminal.stdout||terminal.stderr)throw Error('Donor failed');
  logs.push({case:name,result:observed,donor_exit:terminal.exit,request_sender:'unapproved Bun harness'});save();return observed;
 }finally{
  for(const fd of [peer,control,listener])if(fd>=0)c.close(fd);
  if(donor&&children.has(donor)){donor.kill('SIGKILL');await collect(donor,5000);}
 }
}
let summary:unknown;
console.log(`Experiment record: ${root}/record.json`);save();
try{
 const binaries=Object.fromEntries(['broker','approved','changed','other'].map(name=>[name,join(payload,name)]));
 for(const [name,binary] of Object.entries(binaries)){
  const flags=name==='broker'?['-DROLE_BROKER']:[`-DBUILD_LABEL="${name}"`];
  await run(`compile-${name}`,['xcrun','clang','-Wall','-Wextra','-Werror',...flags,source,'-framework','Security','-framework','CoreFoundation','-o',binary]);
  const identifier=['approved','changed'].includes(name)?'local.icloud-plugin.experiment.peer':`local.icloud-plugin.experiment.${name}`;
  await run(`sign-${name}`,['codesign','--force','--sign','-','--options','runtime','--identifier',identifier,binary]);
  await run(`verify-${name}`,['codesign','--verify','--strict',binary]);
 }
 const approved=binaries.approved!;
 // Reject ABI drift before writing native pointer layouts. These values are
 // measured by the local compiler/SDK, not assumed from a different platform.
 const layout=JSON.parse((await run('native-layout',[approved,'--layout'])).stdout);
 const expected={pointer:8,message:48,iov:16,iov_pointer:16,iov_count:24,control_pointer:32,control_length:40,flags:44,rights_space:16,rights_data:12,timeout:16};
 if(JSON.stringify(layout)!==JSON.stringify(expected))throw Error('Darwin FFI layout unsupported');
 const details=(await run('approved-details',['codesign','-d','--verbose=4',approved])).stderr;
 const hashes=[...details.matchAll(/^CDHash=([a-f0-9]{40})$/gm)];if(hashes.length!==1)throw Error('Expected one ad-hoc CDHash');
 const requirement=`cdhash H"${hashes[0]![1]}"`,original=createHash('sha256').update(readFileSync(approved)).digest('hex');
 const broker=spawn([binaries.broker!,socketPath,requirement]);await awaitSocket(socketPath,broker);
 const outcomes:Record<string,Decision>={};
 outcomes.approved=await client('approved',[approved,socketPath,'0'],true);
 const copied=join(payload,'approved-copy');copyFileSync(approved,copied);chmodSync(copied,0o700);
 outcomes['approved-copy']=await client('approved-copy',[copied,socketPath,'999999'],true);
 outcomes['same-identifier-new-build']=await client('same-identifier-new-build',[binaries.changed!,socketPath,String(broker.pid)],false);
 outcomes['different-identifier']=await client('different-identifier',[binaries.other!,socketPath,String(broker.pid)],false);
 outcomes['delegated-fd-bun']=await delegated(approved,false);
 outcomes['delegated-fd-interleaved']=await delegated(approved,true);
 const caller=join(payload,'caller.ts');writeFileSync(caller,'import net from "node:net";const s=net.createConnection(process.argv[2]);s.setTimeout(3000,()=>process.exit(78));s.on("connect",()=>s.write("claimed_pid=1 approved_path=fiction"));let r="";s.on("data",b=>r+=b);s.on("end",()=>{process.stdout.write(r);process.exit(JSON.parse(r).result==="denied"?77:0)});s.on("error",()=>process.exit(79));',{mode:0o600});
 outcomes['same-user-bun-spoof']=await client('same-user-bun-spoof',[process.execPath,caller,socketPath],false);
 outcomes['native-environment-switches']=await client('native-environment-switches',[approved,socketPath,'1'],true,{BUN_BE_BUN:'1',BUN_OPTIONS:'--preload=fiction'});
 await run('approved-verify-after',['codesign','--verify','--strict',approved]);if(createHash('sha256').update(readFileSync(approved)).digest('hex')!==original)throw Error('Fixture bytes changed');
 summary={date:new Date().toISOString().slice(0,10),runner:'Bun',platform:(await run('os-version',['sw_vers','-productVersion'])).stdout.trim(),outcomes,approved_bytes_unchanged:true,scope:'same-agent synthetic Unix connection identity only',keychain_operations:false,production_signer:false,k0_passed:false,
  negative_finding:'Socket audit token follows later approved writer in controlled FD interleaving; it does not bind the original unapproved request message.',
  not_verified:['message-bound XPC identity and PID reuse or exec races','mutual broker authentication','actual sealed Bun/native runtime','signer renewal/release continuity','Keychain API/accessibility and lifecycle']};
 writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});record.status='synthetic-connection-controls-observed';
}catch(error){record.status='failed-retained-for-reconciliation';throw error;}
finally{
 for(const child of [...children]){child.kill('SIGKILL');const terminal=await collect(child,5000);logs.push({case:'fixture-terminal',...terminal});}
 libc.close();rmSync(payload,{recursive:true});rmSync(socketDirectory,{recursive:true});record.writers=[];record.transient_cleanup='Owned payload/socket removed after every child observed terminal';save();
}
console.log(JSON.stringify({artifacts:root,summary},null,2));
