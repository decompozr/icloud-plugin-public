import{join}from'node:path';
import{spawn}from'node:child_process';
import{z}from'zod';
const flags=z.object({startAtLogin:z.boolean(),restartOnFailure:z.boolean()}).strict();
export function installedBackgroundService(){
 const prefix=process.env.ICLOUD_INSTALL_PREFIX;
 const call=async(action:string,input?:unknown,id?:string)=>{
  if(process.platform!=='darwin'||!prefix)return{available:false,startAtLogin:false,restartOnFailure:false,managed:false,running:false};
  const args=[join(prefix,'current/icloud-plugin.js'),'service',action,'--prefix',prefix];
  if(id)args.push('--operation',id);
  if(action==='configure'){const value=flags.parse(input);args.push('--start-at-login',String(value.startAtLogin),'--restart-on-failure',String(value.restartOnFailure))}
  const child=spawn(process.execPath,args,{stdio:['ignore','pipe','ignore']});let output='';const closed=new Promise<number|null>((resolve,reject)=>{child.once('close',resolve);child.once('error',()=>reject(Error('SERVICE_CONTROL_FAILED')))});void closed.catch(()=>{});const timer=setTimeout(()=>child.kill('SIGTERM'),15000);try{for await(const chunk of child.stdout){output+=chunk;if(output.length>65536){child.kill('SIGTERM');throw Error('SERVICE_OUTPUT_LIMIT')}}const code=await closed;if(code!==0)throw Error('SERVICE_CONTROL_FAILED');return JSON.parse(output);}finally{clearTimeout(timer)}
 };
 return{status:(id?:string)=>call('status',undefined,id),configure:(input:unknown)=>call('configure',input),restart:()=>call('restart')};
}
