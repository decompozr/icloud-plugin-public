import {z} from 'zod';
const statusSchema=z.object({BackendState:z.string(),Self:z.object({Online:z.boolean()}).optional()});
import {mkdir,rename,chmod,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
const args=process.argv.slice(2);
const output=resolve(args[0]??'');
if(!args[0])throw Error('Usage: tailscale-status.ts output.json [--watch] [--binary=/absolute/tailscale]');
const binary=args.find(x=>x.startsWith('--binary='))?.slice(9)??'tailscale';
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{stopping=true;});
async function update(){
 let installed=false,authenticated=false,online=false;
 try{
  const child=Bun.spawn([binary,'status','--json'],{stdout:'pipe',stderr:'ignore'});
  installed=true;
  const timer=setTimeout(()=>child.kill(),5000);
  try{
   const text=await new Response(child.stdout).text();
   if(await child.exited===0){const data=statusSchema.parse(JSON.parse(text) as unknown);authenticated=data.BackendState==='Running';online=authenticated&&data.Self?.Online===true;}
  }finally{clearTimeout(timer);}
 }catch{}
 await mkdir(dirname(output),{recursive:true,mode:0o700});
 const temporary=`${output}.${process.pid}.tmp`;
 try{
  await Bun.write(temporary,JSON.stringify({installed,authenticated,online,checkedAt:new Date().toISOString()})+'\n');
  await chmod(temporary,0o600);await rename(temporary,output);
 }finally{await rm(temporary,{force:true});}
}
do{await update();if(!args.includes('--watch'))break;for(let i=0;i<200&&!stopping;i++)await Bun.sleep(100);}while(!stopping);
