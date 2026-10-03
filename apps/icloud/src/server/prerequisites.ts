import {z} from 'zod';
import type {TailscaleStatus} from '../admin/handler.js';
import type {AppSettings} from './settings.js';
import{readFileSync}from'node:fs';
const status=z.object({BackendState:z.string(),Self:z.object({Online:z.boolean()}).optional()});
export async function prerequisites(settings:AppSettings):Promise<TailscaleStatus>{
 const result:TailscaleStatus={installed:false,authenticated:false,online:false,privateReachable:false};
 if(settings.tailscale_status_file){
  try{const value=z.object({installed:z.boolean(),authenticated:z.boolean(),online:z.boolean(),checkedAt:z.string().datetime()}).parse(JSON.parse(readFileSync(settings.tailscale_status_file,'utf8')));const age=Date.now()-Date.parse(value.checkedAt);if(age>=-5000&&age<=60000)Object.assign(result,{installed:value.installed,authenticated:value.authenticated,online:value.online});}catch{}
 }else try{
  const process=Bun.spawn([settings.tailscale_binary,'status','--json'],{stdout:'pipe',stderr:'ignore'});
  const timeout=setTimeout(()=>process.kill(),5000);
  try{const text=await new Response(process.stdout).text();result.installed=true;if(await process.exited===0){const value=status.parse(JSON.parse(text));result.authenticated=value.BackendState==='Running';result.online=value.Self?.Online===true;}}finally{clearTimeout(timeout);}
 }catch{/* An unavailable binary is a setup prerequisite, never a startup failure. */}
 try{const response=await fetch(settings.private_origin+'/icloud/setup/health',{signal:AbortSignal.timeout(3000),redirect:'error'});result.privateReachable=response.ok&&await response.text()==='icloud-private';}catch{}
 return result;
}
