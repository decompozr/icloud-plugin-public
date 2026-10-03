import{resolve}from'node:path';
export const repository=resolve(import.meta.dir,'../../..');
export async function command(args:string[]){const child=Bun.spawn(args,{cwd:repository,stdin:'inherit',stdout:'inherit',stderr:'inherit'});const code=await child.exited;if(code!==0)process.exit(code);}
export async function tool(name:string){await command([process.execPath,resolve(import.meta.dir,name+'.ts'),...process.argv.slice(2)]);}
