import{join}from'node:path';
import{rm}from'node:fs/promises';
import{repository}from'./command.js';
const source=join(repository,'apps/e2e/src'),output=join(repository,'apps/e2e/dist');
await rm(output,{recursive:true,force:true});
const entries:string[]=[];for await(const file of new Bun.Glob('*.test.ts').scan(source))entries.push(join(source,file));
const result=await Bun.build({entrypoints:entries,outdir:output,target:'bun',packages:'external',external:['../../icloud/dist/*']});
if(!result.success)throw new AggregateError(result.logs,'E2E build failed');
console.log('Built isolated E2E tests against existing application output.');
