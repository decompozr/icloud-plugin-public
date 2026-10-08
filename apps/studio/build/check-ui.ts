import{join,resolve,dirname}from'node:path';
const root=resolve(import.meta.dir,'../../..'),cli=join(dirname(Bun.resolveSync('svelte-check/package.json',join(root,'apps/studio'))),'bin/svelte-check');
for(const owner of ['apps/studio','packages/ui','modules/account/ui','modules/mail/ui','modules/calendar/ui','modules/photos/ui','modules/homekit/ui']){
 let hasComponents=false;for await(const path of new Bun.Glob('**/*.svelte').scan({cwd:join(root,owner),onlyFiles:true})){hasComponents=true;break;}
 const args=hasComponents?[cli,'--workspace',join(root,owner),'--tsconfig','./tsconfig.json']:[join(dirname(Bun.resolveSync('typescript/package.json',join(root,'apps/studio'))),'bin/tsc'),'--noEmit','--project','./tsconfig.json'];
 const child=Bun.spawn([process.execPath,...args],{cwd:join(root,owner),stdout:'inherit',stderr:'inherit'});
 if(await child.exited!==0)throw Error('UI typecheck failed: '+owner);
}
