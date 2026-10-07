import{join}from'node:path';
import{rm,mkdir}from'node:fs/promises';
import{repository,command}from'./command.js';
const root=join(repository,'packages/contracts'),src=join(root,'src'),out=join(root,'dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await command([process.execPath,'run','--cwd',root,'typecheck']);
await command([process.execPath,join(root,'node_modules/typescript/bin/tsc'),'--project',join(root,'tsconfig.json')]);
const result=await Bun.build({entrypoints:['index','account','readiness'].map(n=>join(src,n+'.ts')),root:src,outdir:out,target:'browser',packages:'external',splitting:true});
if(!result.success)throw new AggregateError(result.logs,'Universal contract build failed');
